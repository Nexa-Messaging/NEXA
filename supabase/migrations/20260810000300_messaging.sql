-- ============================================================================
-- NEXA — one-to-one messaging
-- 1:1 conversations between exactly two users, text messages with soft
-- delete, replies and emoji reactions, and delivered/read receipts.
--
-- Security model:
--   * RLS allows SELECT only for members of a conversation. Direct
--     INSERT/UPDATE/DELETE on either table is impossible — every write goes
--     through the RPC functions in section 5 which enforce membership,
--     blocking rules and message ownership atomically.
--   * conversations stores the pair normalized as user_a_id < user_b_id so a
--     unique index gives a single row per unordered pair.
--   * Realtime (WAL) is enabled for messages + conversations; clients see
--     only rows they are permitted to SELECT (RLS-applied on the socket).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. conversations
-- ----------------------------------------------------------------------------
create table public.conversations (
  id uuid not null default gen_random_uuid (),
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),

  primary key (id),
  constraint conversations_no_self check (user_a_id < user_b_id),
  constraint conversations_member_ck check (user_a_id <> user_b_id),
  unique (user_a_id, user_b_id)
);

comment on table public.conversations is
  'Direct conversation between two users, normalized so user_a_id < user_b_id.';

-- ----------------------------------------------------------------------------
-- 2. messages
-- ----------------------------------------------------------------------------
create table public.messages (
  id uuid not null default gen_random_uuid (),
  seq bigint not null generated always as identity,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text,
  reply_to_id uuid references public.messages (id) on delete set null,
  reactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now (),
  delivered_at timestamptz,
  read_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,

  primary key (id),
  constraint messages_body_length check (body is null or char_length (body) <= 4000)
);

comment on column public.messages.body
  is 'Message text. Nulled on soft delete so bodies are scrubbed server-side.';
comment on column public.messages.reactions
  is 'JSONB array of {user_id, emoji} — single row per user+emoji, managed by RPCs.';
comment on column public.messages.delivered_at
  is 'Set by the recipient device once it has received the message.';
comment on column public.messages.read_at
  is 'Set by the recipient once they have opened the conversation.';

create index messages_conversation_seq on public.messages (conversation_id, seq);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "conversations_select_member"
  on public.conversations
  for select
  using (auth.uid () in (user_a_id, user_b_id));

create policy "messages_select_member"
  on public.messages
  for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and auth.uid () in (c.user_a_id, c.user_b_id)
    )
  );

-- There are deliberately NO insert/update/delete policies on either table: all
-- writes go through the RPC functions below.

-- ----------------------------------------------------------------------------
-- 4. updated_at + realtime
-- ----------------------------------------------------------------------------
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at ();

-- Full replica identity so realtime UPDATE payloads carry the whole row
-- (read/delivered receipts and reactions are always fresh on every device).
alter table public.conversations replica identity full;
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC functions
-- ----------------------------------------------------------------------------

-- Returns the (existing or newly created) conversation between auth.uid() and
-- p_other. Blocking in either direction prevents a conversation from starting.
create or replace function public.start_conversation (p_other uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid () = p_other then
    raise exception 'You cannot chat with yourself';
  end if;

  if not exists (select 1 from auth.users where id = p_other) then
    raise exception 'This user does not exist';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = p_other)
       or (user_id = p_other and blocked_user_id = auth.uid ())
  ) then
    raise exception 'Unable to start a conversation';
  end if;

  select id into v_id
  from public.conversations
  where user_a_id = least (auth.uid (), p_other)
    and user_b_id = greatest (auth.uid (), p_other);

  if v_id is null then
    insert into public.conversations (user_a_id, user_b_id)
    values (least (auth.uid (), p_other), greatest (auth.uid (), p_other))
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Inserts a message into a conversation the caller belongs to (and that is not
-- blocked). Returns the new message id so clients reconcile their local copy.
create or replace function public.send_message (
  p_conversation uuid,
  p_body text,
  p_reply_to uuid default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_body text := trim (coalesce (p_body, ''));
  v_other uuid;
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_body = '' then
    raise exception 'Message cannot be empty';
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  select case when user_a_id = auth.uid () then user_b_id else user_a_id end
    into v_other
  from public.conversations
  where id = p_conversation and auth.uid () in (user_a_id, user_b_id);

  if v_other is null then
    raise exception 'Conversation not found';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = v_other)
       or (user_id = v_other and blocked_user_id = auth.uid ())
  ) then
    raise exception 'Unable to send a message';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to and conversation_id = p_conversation
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.messages (conversation_id, sender_id, body, reply_to_id)
  values (p_conversation, auth.uid (), v_body, p_reply_to)
  returning id into v_message;

  update public.conversations set updated_at = now () where id = p_conversation;

  return v_message;
end;
$$;

-- Marks incoming messages as delivered (recipient received them on a device).
-- Idempotent. Returns the number of rows touched.
create or replace function public.mark_messages_delivered (p_conversation uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_updated bigint;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.conversations
    where id = p_conversation and auth.uid () in (user_a_id, user_b_id)
  ) then
    raise exception 'Conversation not found';
  end if;

  update public.messages
     set delivered_at = coalesce (delivered_at, now ())
   where conversation_id = p_conversation
     and sender_id <> auth.uid ()
     and delivered_at is null
     and deleted_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Marks incoming messages as read (and delivered). Idempotent.
create or replace function public.mark_messages_read (p_conversation uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_updated bigint;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.conversations
    where id = p_conversation and auth.uid () in (user_a_id, user_b_id)
  ) then
    raise exception 'Conversation not found';
  end if;

  update public.messages
     set read_at = coalesce (read_at, now ()),
         delivered_at = coalesce (delivered_at, now ())
   where conversation_id = p_conversation
     and sender_id <> auth.uid ()
     and read_at is null
     and deleted_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Soft-deletes one of the caller's own messages (scrubs body + reactions).
create or replace function public.delete_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  update public.messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message and sender_id = auth.uid ();

  if not found then
    raise exception 'Message not found or you are not its sender';
  end if;
end;
$$;

-- Adds an emoji reaction from the caller. Single row per user+emoji.
create or replace function public.react_to_message (p_message uuid, p_emoji text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_emoji is null or char_length (p_emoji) > 32 then
    raise exception 'Emoji is not valid';
  end if;

  update public.messages
     set reactions = case
       when exists (
         select 1 from jsonb_array_elements (reactions) e
         where e->>'user_id' = auth.uid ()::text and e->>'emoji' = p_emoji
       ) then reactions
       else reactions || jsonb_build_array (
         jsonb_build_object ('user_id', auth.uid ()::text, 'emoji', p_emoji)
       )
     end
   where id = p_message
     and exists (
       select 1 from public.conversations c, public.messages m
       where m.id = p_message
         and c.id = m.conversation_id
         and auth.uid () in (c.user_a_id, c.user_b_id)
     );

  if not found then
    raise exception 'Message not found or you are not a participant';
  end if;
end;
$$;

-- Removes one of the caller's reactions from a message.
create or replace function public.unreact_to_message (p_message uuid, p_emoji text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  update public.messages
     set reactions = (
       select coalesce (jsonb_agg (e), '[]'::jsonb)
       from jsonb_array_elements (reactions) e
       where e->>'user_id' <> auth.uid ()::text or e->>'emoji' <> p_emoji
     )
   where id = p_message
     and exists (
       select 1 from public.conversations c, public.messages m
       where m.id = p_message
         and c.id = m.conversation_id
         and auth.uid () in (c.user_a_id, c.user_b_id)
     );

  if not found then
    raise exception 'Message not found or you are not a participant';
  end if;
end;
$$;

-- Chat-list summary for the caller: the other participant, last message and
-- unread count. Only conversations the caller is a member of are returned.
create or replace function public.list_conversations ()
  returns table (
    conversation_id uuid,
    other_user_id uuid,
    display_name text,
    username text,
    avatar_url text,
    last_message text,
    last_at timestamptz,
    unread_count bigint
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    c.id,
    case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end,
    p.display_name,
    p.username,
    p.avatar_url,
    m.body,
    coalesce (m.created_at, c.updated_at),
    (select count (*)
       from public.messages mc
      where mc.conversation_id = c.id
        and mc.sender_id <> auth.uid ()
        and mc.read_at is null
        and mc.deleted_at is null)
  from public.conversations c
  join public.profiles p
    on p.id = case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end
  left join lateral (
    select body, created_at
    from public.messages m2
    where m2.conversation_id = c.id and m2.deleted_at is null
    order by m2.seq desc
    limit 1
  ) m on true
  where auth.uid () in (c.user_a_id, c.user_b_id)
  order by coalesce (m.created_at, c.updated_at) desc;
$$;

-- Header info for an open conversation (the other participant).
create or replace function public.conversation_info (p_conversation uuid)
  returns table (
    other_user_id uuid,
    display_name text,
    username text,
    avatar_url text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end,
    p.display_name,
    p.username,
    p.avatar_url
  from public.conversations c
  join public.profiles p
    on p.id = case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end
  where c.id = p_conversation and auth.uid () in (c.user_a_id, c.user_b_id);
$$;
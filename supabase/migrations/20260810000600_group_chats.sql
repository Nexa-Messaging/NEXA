-- ============================================================================
-- NEXA — group chats
-- Multi-member conversations with owner/admin/member roles, group profiles
-- (name + photo), text/image/video/voice messages, replies, emoji reactions
-- and per-member unread tracking via a last-read sequence watermark.
--
-- Security model (mirrors messaging + media):
--   * RLS allows SELECT only for members. Direct INSERT/UPDATE/DELETE on any
--     table is impossible — every write goes through the RPC functions in
--     section 6 which enforce membership AND role permissions atomically.
--   * Roles: owner (created the group) may do everything; admin may manage
--     members, rename and set the photo, but cannot change roles; members may
--     only read + send/react/reply + delete their own messages + leave.
--   * Realtime (WAL) is enabled for group_messages/group_members/group_chats;
--     clients see only rows they are permitted to SELECT (RLS on the socket).
--   * Attachments live in a PRIVATE `group-attachments` bucket under
--     "<chat>/<sender>/<file>", and group photos in `group-avatars` under
--     "<chat>/<file>" — signed URLs are gated by membership.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. group_chats
-- ----------------------------------------------------------------------------
create table public.group_chats (
  id uuid not null default gen_random_uuid (),
  name text not null,
  avatar_path text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),

  primary key (id),
  constraint group_chats_name_length check (char_length (name) between 1 and 80)
);

comment on table public.group_chats is 'A multi-member conversation with a name (and optional photo).';
comment on column public.group_chats.created_by is 'The user who created the group (matches the owner membership row).';

-- ----------------------------------------------------------------------------
-- 2. group_members
-- ----------------------------------------------------------------------------
create table public.group_members (
  chat_id uuid not null references public.group_chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now (),
  last_read_seq bigint not null default 0,

  primary key (chat_id, user_id)
);

comment on table public.group_members is 'Membership + role of each user in a group chat.';
comment on column public.group_members.last_read_seq
  is 'Highest group_messages.seq the member has read; used to compute unread counts.';
comment on column public.group_members.role
  is 'owner (creator) > admin > member. Determines what the user may do in the group.';

create index group_members_user on public.group_members (user_id);

-- ----------------------------------------------------------------------------
-- 3. group_messages
-- ----------------------------------------------------------------------------
create table public.group_messages (
  id uuid not null default gen_random_uuid (),
  seq bigint not null generated always as identity,
  chat_id uuid not null references public.group_chats (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text,
  reply_to_id uuid references public.group_messages (id) on delete set null,
  reactions jsonb not null default '[]'::jsonb,
  message_type text not null default 'text',
  media_path text,
  media_mime text,
  media_width integer,
  media_height integer,
  media_duration numeric,
  media_size bigint,
  created_at timestamptz not null default now (),
  edited_at timestamptz,
  deleted_at timestamptz,

  primary key (id),
  constraint group_messages_body_length check (body is null or char_length (body) <= 4000),
  constraint group_messages_type_ck check (message_type in ('text', 'image', 'video', 'voice')),
  constraint group_messages_media_requires_path_ck check (message_type = 'text' or media_path is not null)
);

comment on column public.group_messages.reactions
  is 'JSONB array of {user_id, emoji} — single row per user+emoji, managed by RPCs.';
comment on column public.group_messages.body
  is 'Message text. Nulled on soft delete so bodies are scrubbed server-side.';

create index group_messages_chat_seq on public.group_messages (chat_id, seq);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.group_chats enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- Membership check used by every policy below. It is security definer so the
-- inner SELECT on group_members is not itself re-folded through RLS, which
-- would otherwise cause infinite recursion.
create or replace function public.is_group_member (p_chat uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.chat_id = p_chat and m.user_id = auth.uid ()
  );
$$;

create policy "group_chats_select_member"
  on public.group_chats
  for select
  using (public.is_group_member (id));

create policy "group_members_select_member"
  on public.group_members
  for select
  using (public.is_group_member (chat_id));

create policy "group_messages_select_member"
  on public.group_messages
  for select
  using (public.is_group_member (chat_id));

-- There are deliberately NO insert/update/delete policies on any of the three
-- tables: all writes go through the RPC functions below.

-- ----------------------------------------------------------------------------
-- 5. updated_at + realtime
-- ----------------------------------------------------------------------------
create trigger group_chats_set_updated_at
  before update on public.group_chats
  for each row execute function public.set_updated_at ();

-- Full replica identity so realtime UPDATE/DELETE payloads carry the whole row
-- (role changes, removals, name/photo edits and deletions are always fresh).
alter table public.group_chats replica identity full;
alter table public.group_members replica identity full;
alter table public.group_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_chats'
  ) then
    alter publication supabase_realtime add table public.group_chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC functions
-- ----------------------------------------------------------------------------

-- A helper used by several functions: the caller's role in a group, or null.
create or replace function public.group_role (p_chat uuid)
  returns text
  language sql
  stable
  set search_path = public
as $$
  select role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ()
$$;

-- Creates a group with the caller as owner plus the given friends as members.
-- Every requested member must be an accepted friend of the caller.
create or replace function public.create_group (
  p_name text,
  p_member_ids uuid[]
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := trim (coalesce (p_name, ''));
  v_chat uuid;
  v_member uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if char_length (v_name) < 1 or char_length (v_name) > 80 then
    raise exception 'Group name must be between 1 and 80 characters';
  end if;

  insert into public.group_chats (name, created_by)
  values (v_name, auth.uid ())
  returning id into v_chat;

  insert into public.group_members (chat_id, user_id, role)
  values (v_chat, auth.uid (), 'owner');

  if p_member_ids is not null then
    for v_member in
      select distinct m
      from unnest (p_member_ids) as m
      where m <> auth.uid ()
    loop
      if not exists (
        select 1 from public.friendships
        where status = 'accepted'
          and ((user_id = auth.uid () and friend_id = v_member)
            or (user_id = v_member and friend_id = auth.uid ()))
      ) then
        raise exception 'You can only add friends to a group';
      end if;
      insert into public.group_members (chat_id, user_id, role)
      values (v_chat, v_member, 'member');
    end loop;
  end if;

  return v_chat;
end;
$$;

-- Chat-list summary for the caller: name, photo, last message preview, unread
-- count (messages past the caller's read watermark) and the caller's role.
create or replace function public.list_group_chats ()
  returns table (
    chat_id uuid,
    name text,
    avatar_path text,
    last_message text,
    last_at timestamptz,
    unread_count bigint,
    member_count bigint,
    my_role text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    g.id,
    g.name,
    g.avatar_path,
    case m.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎤 Voice note'
      else coalesce (m.body, '')
    end,
    coalesce (m.created_at, g.updated_at),
    (select count (*)
       from public.group_messages gm
      where gm.chat_id = g.id
        and gm.sender_id <> auth.uid ()
        and gm.deleted_at is null
        and gm.seq > me.last_read_seq),
    (select count (*) from public.group_members allm where allm.chat_id = g.id),
    me.role
  from public.group_chats g
  join public.group_members me
    on me.chat_id = g.id and me.user_id = auth.uid ()
  left join lateral (
    select body, message_type, created_at
    from public.group_messages m2
    where m2.chat_id = g.id and m2.deleted_at is null
    order by m2.seq desc
    limit 1
  ) m on true
  order by coalesce (m.created_at, g.updated_at) desc;
$$;

-- Header info for an open group chat (member only).
create or replace function public.group_chat_info (p_chat uuid)
  returns table (
    id uuid,
    name text,
    avatar_path text,
    created_by uuid,
    created_at timestamptz,
    my_role text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select g.id, g.name, g.avatar_path, g.created_by, g.created_at, me.role
  from public.group_chats g
  join public.group_members me
    on me.chat_id = g.id and me.user_id = auth.uid ()
  where g.id = p_chat;
$$;

-- Members of a group with their profiles (member only), admins/owner first.
create or replace function public.group_members_list (p_chat uuid)
  returns table (
    user_id uuid,
    display_name text,
    username text,
    avatar_url text,
    role text,
    joined_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    m.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    m.role,
    m.joined_at
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  where m.chat_id = p_chat
    and exists (
      select 1 from public.group_members me
      where me.chat_id = p_chat and me.user_id = auth.uid ()
    )
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    m.joined_at;
$$;

-- Messages of a group with sender profile info (member only), oldest first.
create or replace function public.list_group_messages (p_chat uuid)
  returns table (
    id uuid,
    seq bigint,
    chat_id uuid,
    sender_id uuid,
    sender_display_name text,
    sender_username text,
    sender_avatar_url text,
    body text,
    reply_to_id uuid,
    reactions jsonb,
    message_type text,
    media_path text,
    media_mime text,
    media_width integer,
    media_height integer,
    media_duration numeric,
    media_size bigint,
    created_at timestamptz,
    edited_at timestamptz,
    deleted_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    m.id, m.seq, m.chat_id, m.sender_id,
    p.display_name, p.username, p.avatar_url,
    m.body, m.reply_to_id, m.reactions, m.message_type,
    m.media_path, m.media_mime, m.media_width, m.media_height,
    m.media_duration, m.media_size, m.created_at, m.edited_at, m.deleted_at
  from public.group_messages m
  join public.profiles p on p.id = m.sender_id
  where m.chat_id = p_chat
    and exists (
      select 1 from public.group_members me
      where me.chat_id = p_chat and me.user_id = auth.uid ()
    )
  order by m.seq;
$$;

-- Marks the caller's read watermark to the newest message (idempotent).
create or replace function public.mark_group_read (p_chat uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_max bigint;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce (max (seq), 0) into v_max
  from public.group_messages where chat_id = p_chat;

  update public.group_members
     set last_read_seq = v_max
   where chat_id = p_chat and user_id = auth.uid ();

  if not found then
    raise exception 'Group not found or you are not a member';
  end if;

  return v_max;
end;
$$;

-- Sends a text message to a group the caller belongs to. Returns the new id.
create or replace function public.send_group_message (
  p_chat uuid,
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
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.group_members
    where chat_id = p_chat and user_id = auth.uid ()
  ) then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_body = '' then
    raise exception 'Message cannot be empty';
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.group_messages
    where id = p_reply_to and chat_id = p_chat
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.group_messages (chat_id, sender_id, body, reply_to_id)
  values (p_chat, auth.uid (), v_body, p_reply_to)
  returning id into v_message;

  update public.group_chats set updated_at = now () where id = p_chat;

  return v_message;
end;
$$;

-- Registers an already-uploaded media message in a group. The object must sit
-- in the group-attachments bucket under "<chat>/<caller>/...".
create or replace function public.send_group_media_message (
  p_chat uuid,
  p_media_path text,
  p_mime text,
  p_type text,
  p_caption text default null,
  p_reply_to uuid default null,
  p_width int default null,
  p_height int default null,
  p_duration numeric default null,
  p_size bigint default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_body text := trim (coalesce (p_caption, ''));
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.group_members
    where chat_id = p_chat and user_id = auth.uid ()
  ) then
    raise exception 'Group not found or you are not a member';
  end if;

  if p_type is null or p_type not in ('image', 'video', 'voice') then
    raise exception 'Unsupported media type';
  end if;

  if p_media_path is null or p_media_path = '' then
    raise exception 'Media file is missing';
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'group-attachments'
      and name = p_media_path
      and (storage.foldername (name)) [1] = p_chat::text
      and (storage.foldername (name)) [2] = auth.uid ()::text
  ) then
    raise exception 'Media file was not uploaded for this group';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.group_messages
    where id = p_reply_to and chat_id = p_chat
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.group_messages (
    chat_id, sender_id, body, reply_to_id,
    message_type, media_path, media_mime, media_width, media_height,
    media_duration, media_size
  )
  values (
    p_chat, auth.uid (), nullif (v_body, ''), p_reply_to,
    p_type, p_media_path, p_mime, p_width, p_height, p_duration, p_size
  )
  returning id into v_message;

  update public.group_chats set updated_at = now () where id = p_chat;

  return v_message;
end;
$$;

-- Soft-deletes a group message. The sender, or any admin/owner of the group,
-- may delete a message. Media objects are removed from storage too.
create or replace function public.delete_group_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
  v_chat uuid;
  v_role text;
  v_author uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select chat_id, media_path, sender_id into v_chat, v_path, v_author
  from public.group_messages where id = p_message;

  if not found then
    raise exception 'Message not found';
  end if;

  select role into v_role from public.group_members
  where chat_id = v_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this message';
  end if;

  update public.group_messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'group-attachments' and name = v_path;
  end if;
end;
$$;

-- Adds an emoji reaction from the caller. Single row per user+emoji.
create or replace function public.react_to_group_message (p_message uuid, p_emoji text)
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

  if not exists (
    select 1
    from public.group_messages m
    join public.group_members me on me.chat_id = m.chat_id and me.user_id = auth.uid ()
    where m.id = p_message
  ) then
    raise exception 'Message not found or you are not a member';
  end if;

  update public.group_messages
     set reactions = case
       when exists (
         select 1 from jsonb_array_elements (reactions) e
         where e->>'user_id' = auth.uid ()::text and e->>'emoji' = p_emoji
       ) then reactions
       else reactions || jsonb_build_array (
         jsonb_build_object ('user_id', auth.uid ()::text, 'emoji', p_emoji)
       )
     end
   where id = p_message;
end;
$$;

-- Removes one of the caller's reactions from a group message.
create or replace function public.unreact_to_group_message (p_message uuid, p_emoji text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.group_messages m
    join public.group_members me on me.chat_id = m.chat_id and me.user_id = auth.uid ()
    where m.id = p_message
  ) then
    raise exception 'Message not found or you are not a member';
  end if;

  update public.group_messages
     set reactions = (
       select coalesce (jsonb_agg (e), '[]'::jsonb)
       from jsonb_array_elements (reactions) e
       where e->>'user_id' <> auth.uid ()::text or e->>'emoji' <> p_emoji
     )
   where id = p_message;
end;
$$;

-- Adds friends to a group. Admin/owner only; new members must be the caller's
-- accepted friends.
create or replace function public.add_group_members (
  p_chat uuid,
  p_member_ids uuid[]
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role text;
  v_member uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can add members';
  end if;

  if p_member_ids is not null then
    for v_member in
      select distinct m from unnest (p_member_ids) as m
    loop
      if v_member = auth.uid () then
        continue;
      end if;
      if not exists (
        select 1 from public.friendships
        where status = 'accepted'
          and ((user_id = auth.uid () and friend_id = v_member)
            or (user_id = v_member and friend_id = auth.uid ()))
      ) then
        raise exception 'You can only add friends to a group';
      end if;
      insert into public.group_members (chat_id, user_id, role)
      values (p_chat, v_member, 'member')
      on conflict (chat_id, user_id) do nothing;
    end loop;
  end if;
end;
$$;

-- Removes a member from a group. Admins may remove regular members; the owner
-- may also remove admins. Nobody can remove the owner.
create or replace function public.remove_group_member (p_chat uuid, p_member uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_actor text;
  v_target text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_actor from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_actor is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_actor not in ('admin', 'owner') then
    raise exception 'Only admins can remove members';
  end if;

  select role into v_target from public.group_members
  where chat_id = p_chat and user_id = p_member;

  if v_target is null then
    raise exception 'This user is not a member';
  end if;

  if v_target = 'owner' then
    raise exception 'The owner cannot be removed';
  end if;

  if v_actor = 'admin' and v_target = 'admin' then
    raise exception 'Admins cannot remove other admins';
  end if;

  delete from public.group_members
   where chat_id = p_chat and user_id = p_member;
end;
$$;

-- Changes a member's role (member <-> admin). Owner only, and never the owner.
create or replace function public.set_group_member_role (
  p_chat uuid,
  p_member uuid,
  p_role text
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_actor text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member';
  end if;

  select role into v_actor from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_actor is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_actor <> 'owner' then
    raise exception 'Only the owner can change roles';
  end if;

  if exists (
    select 1 from public.group_members
    where chat_id = p_chat and user_id = p_member and role = 'owner'
  ) then
    raise exception 'The owner role cannot be changed';
  end if;

  update public.group_members
     set role = p_role
   where chat_id = p_chat and user_id = p_member;

  if not found then
    raise exception 'This user is not a member';
  end if;
end;
$$;

-- Renames a group. Admin/owner only.
create or replace function public.rename_group (p_chat uuid, p_name text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := trim (coalesce (p_name, ''));
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if char_length (v_name) < 1 or char_length (v_name) > 80 then
    raise exception 'Group name must be between 1 and 80 characters';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can rename the group';
  end if;

  update public.group_chats set name = v_name where id = p_chat;
end;
$$;

-- Sets the group photo (object path in the group-avatars bucket). Admin/owner.
create or replace function public.set_group_avatar (p_chat uuid, p_avatar_path text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_old_path text;
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_avatar_path is null or p_avatar_path = '' then
    raise exception 'Photo file is missing';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can change the group photo';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'group-avatars'
      and name = p_avatar_path
      and (storage.foldername (name)) [1] = p_chat::text
  ) then
    raise exception 'Photo was not uploaded for this group';
  end if;

  select avatar_path into v_old_path
  from public.group_chats where id = p_chat;

  update public.group_chats set avatar_path = p_avatar_path where id = p_chat;

  -- Drop the previous photo so old signed URLs stop resolving.
  if v_old_path is not null and v_old_path <> p_avatar_path then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'group-avatars' and name = v_old_path;
  end if;
end;
$$;

-- Leaves a group. The owner's departure transfers ownership to the earliest
-- admin (else earliest member); when the last member leaves the group is
-- deleted. Media objects are removed from storage.
create or replace function public.leave_group (p_chat uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role text;
  v_next uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  delete from public.group_members
   where chat_id = p_chat and user_id = auth.uid ();

  -- Owner leaving: hand off to the earliest admin, else earliest member.
  if v_role = 'owner' then
    select user_id into v_next
    from public.group_members
    where chat_id = p_chat
    order by case when role = 'admin' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      delete from public.group_chats where id = p_chat;
    else
      update public.group_members
         set role = 'owner'
       where chat_id = p_chat and user_id = v_next;
    end if;
  end if;
end;
$$;

-- Permanently deletes a group (owner only). Members, messages and all group
-- attachments are removed from storage.
create or replace function public.delete_group (p_chat uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_role <> 'owner' then
    raise exception 'Only the owner can delete the group';
  end if;

  -- Storage objects are removed by the client via the Storage API before the
  -- group is deleted (direct SQL deletes from storage.objects are blocked).

  delete from public.group_chats where id = p_chat;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Private storage buckets (photos + attachments)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('group-attachments', 'group-attachments', false)
on conflict (id) do nothing;

-- Group photo upload/overwrite: admin/owner of the group named by folder[1].
create policy "group_avatars_insert_admin"
  on storage.objects
  for insert
  with check (
    bucket_id = 'group-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

create policy "group_avatars_update_admin"
  on storage.objects
  for update
  using (
    bucket_id = 'group-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

-- Group photo download / signed URLs: any member.
create policy "group_avatars_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

create policy "group_avatars_delete_admin"
  on storage.objects
  for delete
  using (
    bucket_id = 'group-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

-- Attachment upload: the caller owns the sender subfolder and is a member.
create policy "group_attachments_insert_member"
  on storage.objects
  for insert
  with check (
    bucket_id = 'group-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

create policy "group_attachments_update_member"
  on storage.objects
  for update
  using (
    bucket_id = 'group-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Attachment download / signed URLs: any member.
create policy "group_attachments_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'group-attachments'
    and exists (
      select 1 from public.group_members m
      where m.chat_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Attachment removal: the sender, or any admin/owner of the group.
create policy "group_attachments_delete_author"
  on storage.objects
  for delete
  using (
    bucket_id = 'group-attachments'
    and (
      (storage.foldername (name)) [2] = auth.uid ()::text
      or exists (
        select 1 from public.group_members m
        where m.chat_id::text = (storage.foldername (name)) [1]
          and m.user_id = auth.uid ()
          and m.role in ('admin', 'owner')
      )
    )
  );
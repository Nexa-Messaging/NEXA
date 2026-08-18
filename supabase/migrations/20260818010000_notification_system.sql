-- ---------------------------------------------------------------------------
-- Notification system: grouped, spam-free notifications + contextual badges
--
-- 1. Notifications gain grouping state: group_key (stable group identity),
--    message_count (events folded into this group), read_at and updated_at.
--    High-volume types (direct messages, mentions, announcements) are folded
--    into one unread group per key instead of one row per event, so a busy
--    conversation becomes "Justice — 10 new messages" rather than 10 rows.
-- 2. A badge count for pending friend requests (Friends tab) and friendships
--    being added to realtime so that badge updates live.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Notifications grouping state
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists group_key text,
  add column if not exists message_count integer not null default 1,
  add column if not exists read_at timestamptz,
  add column if not exists updated_at timestamptz not null default now ();

-- At most one ACTIVE (unread) group per user/type/key. Once read, the row
-- leaves this partial index and a fresh group may start. This both prevents
-- duplicate groups on racing inserts and makes the group-find fast.
create unique index if not exists notifications_active_group_key
  on public.notifications (user_id, type, group_key)
  where group_key is not null and is_read is false;

-- Feed ordering moved to updated_at (last activity surfaces a live group).
create index if not exists notifications_user_updated_idx
  on public.notifications (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. Notification writers: grouping helper + updated triggers
-- ---------------------------------------------------------------------------

-- Folds an event into an existing unread group for (user, type, group_key) or
-- creates a fresh group. Grouped rows get title = actor name and
-- body = "<n> <noun>" (e.g. "Justice", "10 new messages"); single events keep
-- the caller-provided title/body. Resets push_delivered_at so the push worker
-- re-delivers the updated grouped notification.
create or replace function public.notify_grouped (
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_group_key text,
  p_data jsonb,
  p_actor_name text,
  p_single_title text,
  p_single_body text,
  p_noun text
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_row public.notifications%rowtype;
  v_count integer;
begin
  if p_user is null or p_actor is null or p_user = p_actor then
    return;
  end if;

  select * into v_row
  from public.notifications
  where user_id = p_user
    and type = p_type
    and group_key = p_group_key
    and not is_read
  order by created_at desc
  limit 1
  for update;

  if v_row.id is not null then
    v_count := v_row.message_count + 1;
    update public.notifications
       set actor_id = p_actor,
           title = coalesce (p_actor_name, 'Someone'),
           body = v_count || ' ' || p_noun,
           data = coalesce (p_data, '{}'::jsonb),
           message_count = v_count,
           updated_at = now (),
           push_delivered_at = null
     where id = v_row.id;
  else
    begin
      insert into public.notifications (user_id, actor_id, type, title, body, data, group_key, message_count)
      values (p_user, p_actor, p_type, p_single_title, p_single_body, coalesce (p_data, '{}'::jsonb), p_group_key, 1);
    exception when unique_violation then
      -- A concurrent insert opened the same group; fold into it instead.
      update public.notifications
         set actor_id = p_actor,
             title = coalesce (p_actor_name, 'Someone'),
             body = (message_count + 1) || ' ' || p_noun,
             data = coalesce (p_data, '{}'::jsonb),
             message_count = message_count + 1,
             updated_at = now (),
             push_delivered_at = null
       where user_id = p_user
         and type = p_type
         and group_key = p_group_key
         and not is_read;
    end;
  end if;
end;
$$;

-- Fan-out helper gains optional grouping (used for community announcements).
create or replace function public.notify_community_members (
  p_community uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_group_key text default null,
  p_actor_name text default null,
  p_noun text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_member record;
begin
  if p_community is null then
    return;
  end if;
  for v_member in
    select m.user_id
    from public.community_members m
    where m.community_id = p_community
      and m.user_id <> p_actor
  loop
    if p_group_key is not null then
      perform public.notify_grouped (
        v_member.user_id, p_actor, p_type, p_group_key, p_data,
        p_actor_name, p_title, p_body, p_noun
      );
    else
      perform public.notify_user (v_member.user_id, p_actor, p_type, p_title, p_body, p_data);
    end if;
  end loop;
end;
$$;

-- @mentions fold per conversation (group chat or channel), not per message.
create or replace function public.notify_mentions (
  p_body text,
  p_actor uuid,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_mention record;
  v_preview text := coalesce (nullif (btrim (p_body), ''), '');
  v_key text;
begin
  if v_preview = '' or p_actor is null then
    return;
  end if;
  if char_length (v_preview) > 140 then
    v_preview := left (v_preview, 140);
  end if;

  if p_data ? 'chat_id' then
    v_key := 'group:' || (p_data ->> 'chat_id');
  elsif p_data ? 'channel_id' then
    v_key := 'channel:' || (p_data ->> 'channel_id');
  else
    return;
  end if;

  for v_mention in
    select distinct pr.id as mentioned_id, pr.username as username
    from regexp_matches (p_body, '@([a-z0-9_]{3,20})', 'g') m
    join public.profiles pr on pr.username = lower (m[1])
  loop
    perform public.notify_grouped (
      v_mention.mentioned_id,
      p_actor,
      p_type,
      v_key,
      p_data,
      '@' || v_mention.username,
      '@' || v_mention.username || ' mentioned you',
      v_preview,
      'new mentions'
    );
  end loop;
end;
$$;

-- New direct messages fold into one unread group per conversation.
create or replace function public.notify_new_direct_message ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_other uuid;
  v_conv uuid;
  v_name text;
  v_username text;
  v_preview text := public.message_preview (NEW);
begin
  if NEW.via_story_reply then
    return NEW;
  end if;

  select
    case when c.user_a_id = NEW.sender_id then c.user_b_id else c.user_a_id end,
    c.id
  into v_other, v_conv
  from public.conversations c
  where c.id = NEW.conversation_id;

  if v_other is null or v_other = NEW.sender_id then
    return NEW;
  end if;

  select display_name, username into v_name, v_username
  from public.profiles where id = NEW.sender_id;

  perform public.notify_grouped (
    v_other,
    NEW.sender_id,
    'message',
    'dm:' || v_conv::text,
    jsonb_build_object (
      'target', 'message',
      'conversation_id', v_conv,
      'message_id', NEW.id,
      'username', v_username
    ),
    coalesce (v_name, 'Someone'),
    'New message from ' || coalesce (v_name, 'someone'),
    v_preview,
    'new messages'
  );
  return NEW;
end;
$$;

-- Community announcements fold per community instead of fanning out a row per
-- announcement; @mentions inside them still go through notify_mentions above.
create or replace function public.notify_community_message_insert ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_kind text;
  v_comm_name text;
  v_preview text := public.message_preview (NEW);
begin
  select ch.kind, c.name into v_kind, v_comm_name
  from public.community_channels ch
  join public.communities c on c.id = ch.community_id
  where ch.id = NEW.channel_id;

  if v_kind = 'announcements' then
    perform public.notify_community_members (
      NEW.community_id,
      NEW.sender_id,
      'community_announcement',
      coalesce (v_comm_name, 'Your community') || ' posted an announcement',
      v_preview,
      jsonb_build_object (
        'target', 'channel',
        'channel_id', NEW.channel_id,
        'community_id', NEW.community_id,
        'message_id', NEW.id
      ),
      'community_announcement:' || NEW.community_id::text,
      coalesce (v_comm_name, 'Your community'),
      'new announcements'
    );
  end if;

  perform public.notify_mentions (
    NEW.body,
    NEW.sender_id,
    'mention',
    jsonb_build_object (
      'target', 'channel',
      'channel_id', NEW.channel_id,
      'community_id', NEW.community_id,
      'message_id', NEW.id
    )
  );
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Notification reads: exposed state (unread/read/grouped/timestamp)
-- ---------------------------------------------------------------------------

create or replace function public.list_notifications ()
  returns table (
    id uuid,
    type text,
    title text,
    body text,
    data jsonb,
    is_read boolean,
    message_count integer,
    group_key text,
    read_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    actor_id uuid,
    actor_display_name text,
    actor_username text,
    actor_avatar_url text
  )
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.process_due_event_reminders (60);
  return query
    select
      n.id, n.type, n.title, n.body, n.data, n.is_read, n.message_count,
      n.group_key, n.read_at, n.created_at, n.updated_at,
      n.actor_id, pr.display_name, pr.username, pr.avatar_url
    from public.notifications n
    left join public.profiles pr on pr.id = n.actor_id
    where n.user_id = auth.uid ()
    order by n.updated_at desc
    limit 200;
end;
$$;

create or replace function public.mark_notification_read (p_id uuid)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.notifications
  set is_read = true, read_at = now ()
  where id = p_id and user_id = auth.uid () and not is_read;
$$;

create or replace function public.mark_all_notifications_read ()
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.notifications
  set is_read = true, read_at = now ()
  where user_id = auth.uid () and not is_read;
$$;

-- ---------------------------------------------------------------------------
-- 4. Push: re-deliver when a group is updated (folded) — the update trigger
--    fires only when message_count changes, so mark-read updates stay quiet.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_enqueue_push_delivery_update on public.notifications;

create trigger trg_enqueue_push_delivery_update
  after update of message_count on public.notifications
  for each row execute function public.enqueue_push_delivery ();

-- ---------------------------------------------------------------------------
-- 5. Friends badge: pending incoming requests + live realtime source
-- ---------------------------------------------------------------------------

create or replace function public.pending_friend_request_count ()
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select count (*)
  from public.friendships
  where friend_id = auth.uid () and status = 'pending';
$$;

-- friendships was not on realtime, so the Friends badge could not update live.
alter table public.friendships replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end;
$$;
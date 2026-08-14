-- ============================================================================
-- Phase 11: Notifications
-- ----------------------------------------------------------------------------
-- Centralized in-app notification system. Every notification is created
-- server-side by security-definer helpers triggered on the source tables, so
-- screens never contain notification logic. The `data` payload carries
-- navigation targets; a future push layer can read the same rows (or a
-- `delivered_at`/`push_token` column can be added later) without touching the
-- app screens.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Marker on messages so the story-reply DM mirror does not trigger a
--    duplicate "new message" notification.
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists via_story_reply boolean not null default false;

comment on column public.messages.via_story_reply is
  'Set when the message is the DM mirror of a story reply, so the message notification fires for the story reply instead.';

-- Re-define send_story_reply to flag its mirrored message.
create or replace function public.send_story_reply (p_story uuid, p_body text)
  returns table (reply_id uuid, message_id uuid)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_author uuid;
  v_body text := trim (coalesce (p_body, ''));
  v_reply uuid;
  v_conv uuid;
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_body = '' then
    raise exception 'A reply cannot be empty';
  end if;

  if char_length (v_body) > 2000 then
    raise exception 'Reply is too long';
  end if;

  select s.user_id into v_author
  from public.stories s
  where s.id = p_story
    and s.is_deleted = false
    and s.expires_at > now ()
    and (
      s.user_id = auth.uid ()
      or (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and auth.uid () in (f.user_id, f.friend_id)
            and s.user_id in (f.user_id, f.friend_id)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.user_id = auth.uid () and b.blocked_user_id = s.user_id)
             or (b.user_id = s.user_id and b.blocked_user_id = auth.uid ())
        )
      )
    );

  if v_author is null then
    raise exception 'Story not found or you cannot reply';
  end if;

  insert into public.story_replies (story_id, reply_from, reply_to, body)
  values (p_story, auth.uid (), v_author, v_body)
  returning id into v_reply;

  if v_author = auth.uid () then
    return query select v_reply, null::uuid;
  end if;

  select id into v_conv
  from public.conversations
  where user_a_id = least (auth.uid (), v_author)
    and user_b_id = greatest (auth.uid (), v_author);

  if v_conv is null then
    insert into public.conversations (user_a_id, user_b_id)
    values (least (auth.uid (), v_author), greatest (auth.uid (), v_author))
    returning id into v_conv;
  end if;

  insert into public.messages (conversation_id, sender_id, body, via_story_reply)
  values (v_conv, auth.uid (), v_body, true)
  returning id into v_message;

  update public.conversations set updated_at = now () where id = v_conv;

  return query select v_reply, v_message;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Notifications table
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now ()
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id) where not is_read;

alter table public.notifications enable row level security;

-- Users can read and mark their own notifications. Rows are only ever written
-- by the security-definer helpers below.
create policy "notifications_select_own"
  on public.notifications
  for select to authenticated
  using (auth.uid () = user_id);

create policy "notifications_update_own"
  on public.notifications
  for update to authenticated
  using (auth.uid () = user_id);

-- Live unread-count updates.
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;

-- ----------------------------------------------------------------------------
-- 3. Server-side helpers (the only writers)
-- ----------------------------------------------------------------------------

-- Inserts one notification, skipping self-notifications. This is the single
-- entry point used by every trigger/RPC, so a push layer can hook here later.
create or replace function public.notify_user (
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body, data)
  values (p_user, p_actor, p_type, p_title, p_body, coalesce (p_data, '{}'::jsonb));
end;
$$;

-- Fan-out helper: notifies every community member except the actor.
create or replace function public.notify_community_members (
  p_community uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
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
    perform public.notify_user (v_member.user_id, p_actor, p_type, p_title, p_body, p_data);
  end loop;
end;
$$;

-- Scans a message body for '@username' mentions and notifies each matched user
-- (excluding the actor), navigating back to the message's conversation.
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
begin
  if v_preview = '' or p_actor is null then
    return;
  end if;
  if char_length (v_preview) > 140 then
    v_preview := left (v_preview, 140);
  end if;
  for v_mention in
    select distinct pr.id as mentioned_id, pr.username as username
    from regexp_matches (p_body, '@([a-z0-9_]{3,20})', 'g') m
    join public.profiles pr on pr.username = lower (m[1])
  loop
    perform public.notify_user (
      v_mention.mentioned_id,
      p_actor,
      p_type,
      '@' || v_mention.username || ' mentioned you',
      v_preview,
      p_data
    );
  end loop;
end;
$$;

-- Shared helper: short human preview for a message (media aware).
create or replace function public.message_preview (m_row public.messages)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select
    case m_row.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎙️ Voice note'
      else coalesce (nullif (btrim (m_row.body), ''), 'Message')
    end;
$$;

create or replace function public.message_preview (m_row public.group_messages)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select
    case m_row.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎙️ Voice note'
      else coalesce (nullif (btrim (m_row.body), ''), 'Message')
    end;
$$;

create or replace function public.message_preview (m_row public.community_messages)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select
    case m_row.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎙️ Voice note'
      else coalesce (nullif (btrim (m_row.body), ''), 'Message')
    end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Triggers that create notifications at their source
-- ----------------------------------------------------------------------------

-- 4.1 New direct message
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

  perform public.notify_user (
    v_other,
    NEW.sender_id,
    'message',
    'New message from ' || coalesce (v_name, 'someone'),
    v_preview,
    jsonb_build_object (
      'target', 'message',
      'conversation_id', v_conv,
      'message_id', NEW.id,
      'username', v_username
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_new_direct_message
  after insert on public.messages
  for each row execute function public.notify_new_direct_message ();

-- 4.2 New reaction on a direct message
create or replace function public.notify_message_reaction ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reactor uuid;
  v_emoji text;
  v_name text;
begin
  if NEW.reactions is distinct from OLD.reactions then
    for v_reactor, v_emoji in
      select (e->>'user_id')::uuid, e->>'emoji'
      from jsonb_array_elements (NEW.reactions) e
      where not exists (
        select 1 from jsonb_array_elements (coalesce (OLD.reactions, '[]'::jsonb)) o
        where o->>'user_id' = e->>'user_id' and o->>'emoji' = e->>'emoji'
      )
    loop
      if v_reactor is not null and v_reactor <> NEW.sender_id then
        select display_name into v_name from public.profiles where id = v_reactor;
        perform public.notify_user (
          NEW.sender_id,
          v_reactor,
          'message_reaction',
          coalesce (v_name, 'Someone') || ' reacted to your message',
          coalesce (v_emoji, ''),
          jsonb_build_object (
            'target', 'message',
            'conversation_id', NEW.conversation_id,
            'message_id', NEW.id
          )
        );
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_message_reaction
  after update of reactions on public.messages
  for each row execute function public.notify_message_reaction ();

-- 4.3 New reaction on a group message
create or replace function public.notify_group_message_reaction ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reactor uuid;
  v_emoji text;
  v_name text;
begin
  if NEW.reactions is distinct from OLD.reactions then
    for v_reactor, v_emoji in
      select (e->>'user_id')::uuid, e->>'emoji'
      from jsonb_array_elements (NEW.reactions) e
      where not exists (
        select 1 from jsonb_array_elements (coalesce (OLD.reactions, '[]'::jsonb)) o
        where o->>'user_id' = e->>'user_id' and o->>'emoji' = e->>'emoji'
      )
    loop
      if v_reactor is not null and v_reactor <> NEW.sender_id then
        select display_name into v_name from public.profiles where id = v_reactor;
        perform public.notify_user (
          NEW.sender_id,
          v_reactor,
          'message_reaction',
          coalesce (v_name, 'Someone') || ' reacted to your message',
          coalesce (v_emoji, ''),
          jsonb_build_object (
            'target', 'group',
            'chat_id', NEW.chat_id,
            'message_id', NEW.id
          )
        );
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_group_message_reaction
  after update of reactions on public.group_messages
  for each row execute function public.notify_group_message_reaction ();

-- 4.4 New reaction on a community message
create or replace function public.notify_community_message_reaction ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reactor uuid;
  v_emoji text;
  v_name text;
begin
  if NEW.reactions is distinct from OLD.reactions then
    for v_reactor, v_emoji in
      select (e->>'user_id')::uuid, e->>'emoji'
      from jsonb_array_elements (NEW.reactions) e
      where not exists (
        select 1 from jsonb_array_elements (coalesce (OLD.reactions, '[]'::jsonb)) o
        where o->>'user_id' = e->>'user_id' and o->>'emoji' = e->>'emoji'
      )
    loop
      if v_reactor is not null and v_reactor <> NEW.sender_id then
        select display_name into v_name from public.profiles where id = v_reactor;
        perform public.notify_user (
          NEW.sender_id,
          v_reactor,
          'message_reaction',
          coalesce (v_name, 'Someone') || ' reacted to your message',
          coalesce (v_emoji, ''),
          jsonb_build_object (
            'target', 'channel',
            'channel_id', NEW.channel_id,
            'community_id', NEW.community_id,
            'message_id', NEW.id
          )
        );
      end if;
    end loop;
  end if;
  return NEW;
end;
$$;

create trigger trg_notify_community_message_reaction
  after update of reactions on public.community_messages
  for each row execute function public.notify_community_message_reaction ();

-- 4.5 Friend request sent (target's inbox)
create or replace function public.notify_friend_request ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text;
  v_username text;
begin
  if NEW.status <> 'pending' then
    return NEW;
  end if;
  select display_name, username into v_name, v_username
  from public.profiles where id = NEW.user_id;
  perform public.notify_user (
    NEW.friend_id,
    NEW.user_id,
    'friend_request',
    coalesce (v_name, 'Someone') || ' sent you a friend request',
    '@' || coalesce (v_username, 'someone'),
    jsonb_build_object (
      'target', 'friends',
      'user_id', NEW.user_id,
      'username', v_username
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_friend_request
  after insert on public.friendships
  for each row execute function public.notify_friend_request ();

-- 4.6 Friend request accepted (requester's inbox)
create or replace function public.notify_friend_request_accepted ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text;
  v_username text;
begin
  if OLD.status <> 'pending' or NEW.status <> 'accepted' then
    return NEW;
  end if;
  select display_name, username into v_name, v_username
  from public.profiles where id = NEW.friend_id;
  perform public.notify_user (
    NEW.user_id,
    NEW.friend_id,
    'friend_request_accepted',
    coalesce (v_name, 'Someone') || ' accepted your friend request',
    'You are now friends with @' || coalesce (v_username, 'them'),
    jsonb_build_object (
      'target', 'profile',
      'user_id', NEW.friend_id,
      'username', v_username
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_friend_request_accepted
  after update of status on public.friendships
  for each row execute function public.notify_friend_request_accepted ();

-- 4.7 Story reaction (story author's inbox)
create or replace function public.notify_story_reaction ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
  v_username text;
begin
  select user_id into v_author from public.stories where id = NEW.story_id;
  if v_author is null or v_author = NEW.user_id then
    return NEW;
  end if;
  select display_name, username into v_name, v_username
  from public.profiles where id = NEW.user_id;
  perform public.notify_user (
    v_author,
    NEW.user_id,
    'story_reaction',
    coalesce (v_name, 'Someone') || ' reacted to your story',
    coalesce (NEW.emoji, ''),
    jsonb_build_object (
      'target', 'profile',
      'user_id', NEW.user_id,
      'username', v_username,
      'story_id', NEW.story_id
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_story_reaction
  after insert on public.story_reactions
  for each row execute function public.notify_story_reaction ();

-- 4.8 Story reply (story author's inbox)
create or replace function public.notify_story_reply ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text;
  v_username text;
  v_body text := coalesce (nullif (btrim (NEW.body), ''), 'Reply');
begin
  if NEW.reply_from = NEW.reply_to then
    return NEW;
  end if;
  if char_length (v_body) > 200 then
    v_body := left (v_body, 200);
  end if;
  select display_name, username into v_name, v_username
  from public.profiles where id = NEW.reply_from;
  perform public.notify_user (
    NEW.reply_to,
    NEW.reply_from,
    'story_reply',
    coalesce (v_name, 'Someone') || ' replied to your story',
    v_body,
    jsonb_build_object (
      'target', 'profile',
      'user_id', NEW.reply_from,
      'username', v_username,
      'story_id', NEW.story_id
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_story_reply
  after insert on public.story_replies
  for each row execute function public.notify_story_reply ();

-- 4.9 Community announcement + @mentions in community messages
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
      )
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

create trigger trg_notify_community_message_insert
  after insert on public.community_messages
  for each row execute function public.notify_community_message_insert ();

-- 4.10 @mentions in group messages
create or replace function public.notify_group_message_insert ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.notify_mentions (
    NEW.body,
    NEW.sender_id,
    'mention',
    jsonb_build_object (
      'target', 'group',
      'chat_id', NEW.chat_id,
      'message_id', NEW.id
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_group_message_insert
  after insert on public.group_messages
  for each row execute function public.notify_group_message_insert ();

-- 4.11 New poll (community-wide)
create or replace function public.notify_new_poll ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_comm_name text;
begin
  select name into v_comm_name from public.communities where id = NEW.community_id;
  perform public.notify_community_members (
    NEW.community_id,
    NEW.created_by,
    'poll',
    'New poll in ' || coalesce (v_comm_name, 'your community'),
    coalesce (NEW.question, ''),
    jsonb_build_object (
      'target', 'polls',
      'community_id', NEW.community_id,
      'poll_id', NEW.id
    )
  );
  return NEW;
end;
$$;

create trigger trg_notify_new_poll
  after insert on public.community_polls
  for each row execute function public.notify_new_poll ();

-- ----------------------------------------------------------------------------
-- 5. Event reminders (time-based) and notification reads
-- ----------------------------------------------------------------------------

-- Materialises "event_reminder" notifications for opt-in users whose reminder
-- is due (event starts within the window) and has not been notified yet.
-- Called automatically by list_notifications; can also be scheduled (pg_cron)
-- or triggered from a push worker later.
create or replace function public.process_due_event_reminders (
  p_window_minutes int default 60
)
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_report int := 0;
  v_now timestamptz := now ();
  v_window interval;
begin
  if p_window_minutes is null or p_window_minutes < 1 then
    raise exception 'Window must be at least 1 minute';
  end if;
  v_window := make_interval (mins => p_window_minutes);

  insert into public.notifications (user_id, actor_id, type, title, body, data)
  select
    re.user_id,
    ev.created_by,
    'event_reminder',
    'Reminder: ' || ev.title,
    'Starting ' || to_char (ev.starts_at, 'Mon DD at HH24:MI'),
    jsonb_build_object (
      'target', 'event',
      'event_id', ev.id,
      'community_id', ev.community_id
    )
  from public.community_event_reminders re
  join public.community_events ev on ev.id = re.event_id
  where ev.starts_at > v_now
    and ev.starts_at - v_window <= v_now
    and not exists (
      select 1 from public.notifications n
      where n.user_id = re.user_id
        and n.type = 'event_reminder'
        and n.data->>'event_id' = ev.id::text
    );

  get diagnostics v_report = row_count;
  return v_report;
end;
$$;

-- The caller's notifications (newest first), with the actor's profile. Runs
-- the due-event-reminder pass so reminders surface on App open/screen view.
create or replace function public.list_notifications ()
  returns table (
    id uuid,
    type text,
    title text,
    body text,
    data jsonb,
    is_read boolean,
    created_at timestamptz,
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
      n.id, n.type, n.title, n.body, n.data, n.is_read, n.created_at,
      n.actor_id, pr.display_name, pr.username, pr.avatar_url
    from public.notifications n
    left join public.profiles pr on pr.id = n.actor_id
    where n.user_id = auth.uid ()
    order by n.created_at desc
    limit 200;
end;
$$;

create or replace function public.unread_notification_count ()
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select count (*)
  from public.notifications
  where user_id = auth.uid () and not is_read;
$$;

create or replace function public.mark_notification_read (p_id uuid)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.notifications
  set is_read = true
  where id = p_id and user_id = auth.uid () and not is_read;
$$;

create or replace function public.mark_all_notifications_read ()
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.notifications
  set is_read = true
  where user_id = auth.uid () and not is_read;
$$;
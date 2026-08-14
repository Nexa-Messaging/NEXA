-- ============================================================================
-- Phase 15: Testing & Stabilization — consolidation of fixes found during the
-- full audit (friend/block, messaging idempotency, profiles/privacy, polls,
-- events, reports, indexes).
--
-- Idempotent: safe to run on projects that already applied these fixes.
-- Apply in the Supabase SQL Editor (or `supabase db push`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles privacy + robust signup
-- ----------------------------------------------------------------------------
-- (a) Restrict profile reads to signed-in users so anonymous clients with the
--     anon key can no longer scrape every profile.
-- (b) The `email` column is never read by the app (edit-profile uses the auth
--     session). Revoke SELECT on it from the API roles so emails cannot be
--     harvested. INSERT/UPDATE are kept so the client-side profile upsert and
--     the trigger can still write email at signup.
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  to authenticated
  using (true);

revoke select (email) on public.profiles from anon, authenticated;

-- (c) handle_new_user: never insert an empty username (which violated
--     profiles_username_format and aborted signup with a 500). Derive a valid
--     handle from the email local part when clients omit a username.
create or replace function public.handle_new_user ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower (btrim (coalesce (new.raw_user_meta_data ->> 'username', '')));
  if v_username = '' then
    v_username := lower (regexp_replace (split_part (new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  end if;
  if char_length (v_username) < 3 then
    v_username := v_username || repeat ('0', 3 - char_length (v_username));
  end if;
  if char_length (v_username) > 20 then
    v_username := left (v_username, 20);
  end if;

  insert into public.profiles (id, email, display_name, username)
  values (
    new.id,
    coalesce (new.email, ''),
    coalesce (new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_username
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. start_conversation: fix the check-then-insert TOCTOU race. Two users
--    opening a chat at the same instant could both pass the null check and the
--    second INSERT hit the unique constraint, returning a 500.
-- ----------------------------------------------------------------------------
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

  insert into public.conversations (user_a_id, user_b_id)
  values (least (auth.uid (), p_other), greatest (auth.uid (), p_other))
  on conflict (user_a_id, user_b_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.conversations
    where user_a_id = least (auth.uid (), p_other)
      and user_b_id = greatest (auth.uid (), p_other);
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Messaging idempotency — prevent duplicate messages.
--    A client-generated uuid is stored per (conversation, sender). Sending with
--    the same client_id is a no-op returning the existing id, so a failed /
--    retried send cannot create a server-side duplicate, and a message that
--    races back over realtime can be reconciled with the local pending bubble.
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists client_id uuid;

create unique index if not exists messages_client_id_key
  on public.messages (conversation_id, sender_id, client_id)
  where client_id is not null;

-- Remove the pre-idempotency overloads so RPC calls are unambiguous. Without
-- this, both the old (no p_client_id) and new functions coexist and Postgres
-- cannot choose between them when p_client_id is passed as NULL.
drop function if exists public.send_message (uuid, text, uuid);
drop function if exists public.send_media_message (uuid, text, text, text, text, uuid, int, int, numeric, bigint);

create or replace function public.send_message (
  p_conversation uuid,
  p_body text,
  p_reply_to uuid default null,
  p_client_id uuid default null
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

  insert into public.messages (conversation_id, sender_id, body, reply_to_id, client_id)
  values (p_conversation, auth.uid (), v_body, p_reply_to, p_client_id)
  on conflict (conversation_id, sender_id, client_id) where client_id is not null
  do nothing
  returning id into v_message;

  if v_message is null then
    select id into v_message
    from public.messages
    where conversation_id = p_conversation
      and sender_id = auth.uid ()
      and client_id = p_client_id;
  end if;

  update public.conversations set updated_at = now () where id = p_conversation;

  return v_message;
end;
$$;

create or replace function public.send_media_message (
  p_conversation uuid,
  p_media_path text,
  p_mime text,
  p_type text,
  p_caption text default null,
  p_reply_to uuid default null,
  p_width int default null,
  p_height int default null,
  p_duration numeric default null,
  p_size bigint default null,
  p_client_id uuid default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_other uuid;
  v_body text := trim (coalesce (p_caption, ''));
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
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

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'message-attachments'
      and name = p_media_path
      and (storage.foldername (name)) [1] = p_conversation::text
      and (storage.foldername (name)) [2] = auth.uid ()::text
  ) then
    raise exception 'Media file was not uploaded for this conversation';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to and conversation_id = p_conversation
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.messages (
    conversation_id, sender_id, body, reply_to_id,
    message_type, media_path, media_mime, media_width, media_height,
    media_duration, media_size, client_id
  )
  values (
    p_conversation, auth.uid (), nullif (v_body, ''), p_reply_to,
    p_type, p_media_path, p_mime, p_width, p_height, p_duration, p_size,
    p_client_id
  )
  on conflict (conversation_id, sender_id, client_id) where client_id is not null
  do nothing
  returning id into v_message;

  if v_message is null then
    select id into v_message
    from public.messages
    where conversation_id = p_conversation
      and sender_id = auth.uid ()
      and client_id = p_client_id;
  end if;

  update public.conversations set updated_at = now () where id = p_conversation;

  return v_message;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Anonymous polls: stop the raw table SELECT policy from leaking who voted.
--    The UI only reads voters via the security-definer `list_community_poll_voters`
--    (which already gates anonymity + author/admin/owner). Restrict the direct
--    table policy to the same guarantee.
-- ----------------------------------------------------------------------------
drop policy if exists "community_poll_votes_select_member" on public.community_poll_votes;
create policy "community_poll_votes_select_authorized"
  on public.community_poll_votes
  for select
  using (
    exists (
      select 1 from public.community_polls pol
      join public.community_members me on me.community_id = pol.community_id and me.user_id = auth.uid ()
      where pol.id = poll_id
        and pol.is_anonymous = false
        and (pol.created_by = auth.uid () or me.role in ('admin', 'owner'))
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Events: only enforce image ownership when the image is actually being
--    replaced. Previously an admin/owner editing an event that already had an
--    image (uploaded by the original author) always failed with "Image was not
--    uploaded for this community".
-- ----------------------------------------------------------------------------
create or replace function public.update_community_event (
  p_event uuid,
  p_title text default null,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_location text default null,
  p_image_path text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_author uuid;
  v_role text;
  v_current_image text;
  v_title text := trim (coalesce (p_title, ''));
  v_location text := nullif (trim (coalesce (p_location, '')), '');
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, created_by, image_path into v_community, v_author, v_current_image
  from public.community_events where id = p_event;

  if v_community is null then
    raise exception 'Event not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to edit this event';
  end if;

  if p_title is not null then
    if v_title = '' or char_length (v_title) > 120 then
      raise exception 'Event title must be between 1 and 120 characters';
    end if;
    update public.community_events set title = v_title where id = p_event;
  end if;

  if p_description is not null then
    if char_length (p_description) > 1000 then
      raise exception 'Description must be at most 1000 characters';
    end if;
    update public.community_events set description = nullif (p_description, '') where id = p_event;
  end if;

  if p_starts_at is not null then
    update public.community_events set starts_at = p_starts_at where id = p_event;
  end if;

  if p_location is not null then
    if char_length (v_location) > 200 then
      raise exception 'Location must be at most 200 characters';
    end if;
    update public.community_events set location = v_location where id = p_event;
  end if;

  if p_image_path is not null and coalesce (p_image_path, '') <> coalesce (v_current_image, '') then
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'event-images'
        and name = p_image_path
        and (storage.foldername (name)) [1] = v_community::text
        and (storage.foldername (name)) [2] = auth.uid ()::text
    ) then
      raise exception 'Image was not uploaded for this community';
    end if;
    update public.community_events set image_path = p_image_path where id = p_event;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Reports: uphold the blocked-user invariant — you cannot file a report
--    against someone who blocked you (or whom you blocked). This removes a
--    harassment-by-report vector.
-- ----------------------------------------------------------------------------
create or replace function public.report_user (
  p_target uuid,
  p_category text,
  p_details text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_details text := btrim (coalesce (p_details, ''));
  v_display text;
  v_username text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid () = p_target then
    raise exception 'You cannot report yourself';
  end if;

  if not public.report_category_ok (p_category) then
    raise exception 'Invalid report category';
  end if;

  if char_length (v_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = p_target)
       or (user_id = p_target and blocked_user_id = auth.uid ())
  ) then
    raise exception 'You cannot report this user';
  end if;

  select pr.display_name, pr.username into v_display, v_username
  from public.profiles pr where pr.id = p_target;

  if v_display is null then
    raise exception 'This user does not exist';
  end if;

  insert into public.moderation_reports (reporter_id, target_type, target_id, category, details, content)
  values (auth.uid (), 'user', p_target, p_category, nullif (v_details, ''), v_display || ' (@' || coalesce (v_username, '') || ')');
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Indexes for commonly filtered columns (avoid seq scans as volumes grow).
-- ----------------------------------------------------------------------------
create index if not exists conversations_user_a_b
  on public.conversations (user_a_id, user_b_id);

create index if not exists messages_sender_id_key
  on public.messages (sender_id);

create index if not exists messages_reply_to_id_key
  on public.messages (reply_to_id);

-- ----------------------------------------------------------------------------
-- 8. Search hardening: websearch_to_tsquery raises on malformed input (e.g.
--    unbalanced quotes), which turned a user search into a 500. Fall back to a
--    plain phrase query (which never raises) when the websearch grammar fails.
-- ----------------------------------------------------------------------------
create or replace function public.search_all (
  p_query text,
  p_category text default 'all',
  p_limit int default 20
)
  returns table (
    category text,
    id text,
    title text,
    subtitle text,
    body text,
    avatar_url text,
    created_at timestamptz,
    rank real,
    data jsonb
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_query text := btrim (coalesce (p_query, ''));
  v_tsquery tsquery;
  v_limit int := greatest (1, least (coalesce (p_limit, 20), 50));
  v_category text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_query = '' then
    raise exception 'Search query cannot be empty';
  end if;

  -- Accept both the UI tab labels and the singular row category names.
  if p_category = 'all' then
    v_category := 'all';
  elsif p_category in ('user', 'users') then
    v_category := 'user';
  elsif p_category in ('community', 'communities') then
    v_category := 'community';
  elsif p_category in ('post', 'posts') then
    v_category := 'post';
  elsif p_category in ('event', 'events') then
    v_category := 'event';
  elsif p_category in ('resource', 'resources') then
    v_category := 'resource';
  else
    raise exception 'Unknown search category: %', p_category;
  end if;

  begin
    v_tsquery := websearch_to_tsquery ('english', v_query);
  exception when others then
    v_tsquery := plainto_tsquery ('english', v_query);
  end;

  return query
    select *
    from (
      -- Users: public profiles, excluding self and anyone blocked either way.
      select
        'user'::text as category,
        pr.id::text as id,
        pr.display_name as title,
        '@' || pr.username as subtitle,
        nullif (btrim (concat_ws (' · ', pr.school, pr.department, pr.level)), '') as body,
        pr.avatar_url as avatar_url,
        pr.created_at,
        ts_rank_cd (
          to_tsvector ('english', coalesce (pr.display_name, '') || ' ' || coalesce (pr.username, '')),
          v_tsquery
        ) as rank,
        jsonb_build_object ('user_id', pr.id::text, 'username', pr.username) as data
      from public.profiles pr
      where pr.id <> auth.uid ()
        and not exists (
          select 1 from public.blocks b
          where b.user_id = auth.uid () and b.blocked_user_id = pr.id
        )
        and not exists (
          select 1 from public.blocks b
          where b.user_id = pr.id and b.blocked_user_id = auth.uid ()
        )
        and (
          to_tsvector ('english',
            coalesce (pr.display_name, '') || ' ' || coalesce (pr.username, '')
              || ' ' || coalesce (pr.school, '') || ' ' || coalesce (pr.department, '')
              || ' ' || coalesce (pr.level, '')
          ) @@ v_tsquery
          or lower (pr.display_name) like '%' || lower (v_query) || '%'
          or lower (pr.username) like '%' || lower (v_query) || '%'
        )

      union all

      -- Communities the caller belongs to, plus their class community.
      select
        'community'::text as category,
        c.id::text as id,
        c.name as title,
        btrim (concat_ws (' · ', c.school, c.department, c.level)) as subtitle,
        c.description as body,
        c.avatar_path as avatar_url,
        c.created_at,
        ts_rank_cd (to_tsvector ('english', coalesce (c.name, '')), v_tsquery) as rank,
        jsonb_build_object ('community_id', c.id::text) as data
      from public.communities c
      left join public.community_members me
        on me.community_id = c.id and me.user_id = auth.uid ()
      left join public.profiles p on p.id = auth.uid ()
      where (me.role is not null
             or (lower (btrim (c.school)) = lower (btrim (coalesce (p.school, '')))
                 and lower (btrim (c.department)) = lower (btrim (coalesce (p.department, '')))
                 and lower (btrim (c.level)) = lower (btrim (coalesce (p.level, '')))))
        and (
          to_tsvector ('english',
            coalesce (c.name, '') || ' ' || coalesce (c.school, '') || ' ' || coalesce (c.department, '')
              || ' ' || coalesce (c.level, '') || ' ' || coalesce (c.description, '')
          ) @@ v_tsquery
          or lower (c.name) like '%' || lower (v_query) || '%'
        )

      union all

      -- Posts: community messages outside the Academics channel (member only).
      select
        'post'::text as category,
        m.id::text as id,
        co.name as title,
        '#' || ch.name || ' · ' || sp.display_name as subtitle,
        m.body as body,
        sp.avatar_url as avatar_url,
        m.created_at,
        ts_rank_cd (to_tsvector ('english', coalesce (m.body, '')), v_tsquery) as rank,
        jsonb_build_object (
          'community_id', co.id::text,
          'channel_id', ch.id::text,
          'channel_name', ch.name,
          'message_id', m.id::text
        ) as data
      from public.community_messages m
      join public.community_channels ch on ch.id = m.channel_id and ch.kind <> 'academics'
      join public.communities co on co.id = m.community_id
      join public.profiles sp on sp.id = m.sender_id
      where m.deleted_at is null
        and m.body is not null
        and exists (
          select 1 from public.community_members me
          where me.community_id = m.community_id and me.user_id = auth.uid ()
        )
        and to_tsvector ('english', coalesce (m.body, '')) @@ v_tsquery

      union all

      -- Events in the caller's communities.
      select
        'event'::text as category,
        ev.id::text as id,
        ev.title as title,
        btrim (concat_ws (' · ', co.name, ev.location)) as subtitle,
        ev.description as body,
        ev.image_path as avatar_url,
        ev.created_at,
        ts_rank_cd (
          to_tsvector ('english', coalesce (ev.title, '') || ' ' || coalesce (ev.description, '')),
          v_tsquery
        ) as rank,
        jsonb_build_object ('community_id', co.id::text, 'event_id', ev.id::text) as data
      from public.community_events ev
      join public.communities co on co.id = ev.community_id
      where exists (
          select 1 from public.community_members me
          where me.community_id = ev.community_id and me.user_id = auth.uid ()
        )
        and (
          to_tsvector ('english',
            coalesce (ev.title, '') || ' ' || coalesce (ev.description, '') || ' ' || coalesce (ev.location, '')
          ) @@ v_tsquery
          or lower (ev.title) like '%' || lower (v_query) || '%'
        )

      union all

      -- Academic resources: messages in the Academics channel (member only).
      select
        'resource'::text as category,
        m.id::text as id,
        co.name as title,
        'Academics · ' || sp.display_name as subtitle,
        m.body as body,
        sp.avatar_url as avatar_url,
        m.created_at,
        ts_rank_cd (to_tsvector ('english', coalesce (m.body, '')), v_tsquery) as rank,
        jsonb_build_object (
          'community_id', co.id::text,
          'channel_id', ch.id::text,
          'channel_name', ch.name,
          'message_id', m.id::text
        ) as data
      from public.community_messages m
      join public.community_channels ch on ch.id = m.channel_id and ch.kind = 'academics'
      join public.communities co on co.id = m.community_id
      join public.profiles sp on sp.id = m.sender_id
      where m.deleted_at is null
        and m.body is not null
        and exists (
          select 1 from public.community_members me
          where me.community_id = m.community_id and me.user_id = auth.uid ()
        )
        and to_tsvector ('english', coalesce (m.body, '')) @@ v_tsquery
    ) all_rows
    where v_category = 'all' or all_rows.category = v_category
    order by rank desc, created_at desc
    limit v_limit;
end;
$$;

grant execute on function public.search_all (text, text, int) to authenticated;

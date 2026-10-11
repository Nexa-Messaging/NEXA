-- ============================================================================
-- Regression fixes surfaced by `npm run verify` (steps 88 and 93).
--
-- Both were introduced by 20260915040000_security_audit_fixes.sql and
-- 20260916000000_fix_broken_triggers.sql. Neither is related to the execute
-- hardening or index migrations in this change set.
--
-- BUG 1 - search_all: return contract broken, two categories deleted
--   The function originally returned RETURNS TABLE(category, id, title,
--   subtitle, body, avatar_url, created_at, rank, data) covering five
--   categories. It was rewritten to RETURNS jsonb returning
--   {"results": [...], "total": n} and only three categories.
--
--   Consumers still expect the old shape:
--     * mobile/src/services/search.ts casts the RPC result to
--       SearchResultRow[] and hands it to the list, so the Search screen
--       throws on a non-array.
--     * mobile/src/types/database.ts still declares the table signature, so
--       the generated types disagree with the live schema.
--     * SearchCategory in database.ts includes 'events' | 'resources', which
--       the rewrite silently stopped serving.
--
--   Fix: restore the five-category TABLE return, keeping the real security
--   improvements from the rewrite (LIKE metacharacter escaping, banned-user
--   filtering, both block directions).
--
-- BUG 2 - process_due_event_reminders: switched to the wrong event system
--   The original read community_event_reminders JOIN community_events. The
--   rewrite switched it to user_event_reminders JOIN user_events, so opting
--   into a *community* event reminder (toggle_event_reminder) no longer
--   produces any notification - verify step 88 fails with gotReminder:false.
--   Both event systems exist, so this processes both.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BUG 1. Restore search_all's contract.
-- ---------------------------------------------------------------------------
drop function if exists public.search_all (text, text, int);

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
  v_escaped text;
  v_tsquery tsquery;
  v_limit int := greatest (1, least (coalesce (p_limit, 20), 50));
  v_category text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if char_length (v_query) < 1 then
    raise exception 'Search query cannot be empty';
  end if;

  if char_length (v_query) > 200 then
    raise exception 'Search query must be 200 characters or fewer';
  end if;

  -- Escape LIKE metacharacters so a query of '%' or '_' does not match
  -- everything. Falls back to a literal substring search.
  v_escaped := replace (replace (v_query, '\', '\\'), '%', '\%');
  v_escaped := replace (v_escaped, '_', '\_');

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
      -- Users: public profiles, excluding self, banned, and either block side.
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
        and pr.banned_at is null
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
          or lower (pr.display_name) like '%' || lower (v_escaped) || '%' escape '\'
          or lower (pr.username) like '%' || lower (v_escaped) || '%' escape '\'
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
        and c.created_by not in (
          select id from public.profiles where banned_at is not null
        )
        and (
          to_tsvector ('english',
            coalesce (c.name, '') || ' ' || coalesce (c.school, '') || ' ' || coalesce (c.department, '')
              || ' ' || coalesce (c.level, '') || ' ' || coalesce (c.description, '')
          ) @@ v_tsquery
          or lower (c.name) like '%' || lower (v_escaped) || '%' escape '\'
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
        and sp.banned_at is null
        and exists (
          select 1 from public.community_members me
          where me.community_id = m.community_id and me.user_id = auth.uid ()
        )
        and (
          to_tsvector ('english', coalesce (m.body, '')) @@ v_tsquery
          or lower (m.body) like '%' || lower (v_escaped) || '%' escape '\'
        )

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
          or lower (ev.title) like '%' || lower (v_escaped) || '%' escape '\'
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
        and sp.banned_at is null
        and exists (
          select 1 from public.community_members me
          where me.community_id = m.community_id and me.user_id = auth.uid ()
        )
        and (
          to_tsvector ('english', coalesce (m.body, '')) @@ v_tsquery
          or lower (m.body) like '%' || lower (v_escaped) || '%' escape '\'
        )
    ) all_rows
    where v_category = 'all' or all_rows.category = v_category
    order by rank desc, created_at desc
    limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- BUG 2. Restore community event reminders, keeping personal event reminders.
-- ---------------------------------------------------------------------------
drop function if exists public.process_due_event_reminders (int);

create or replace function public.process_due_event_reminders (p_window_minutes int default 5)
  returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int := 0;
  v_n int;
begin
  if p_window_minutes is null or p_window_minutes < 1 then
    raise exception 'Window must be at least 1 minute';
  end if;

  -- Community events (the original behaviour, accidentally removed).
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
  where ev.starts_at between now () and now () + make_interval (mins => p_window_minutes)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = re.user_id
        and n.type = 'event_reminder'
        and n.data->>'event_id' = ev.id::text
    );
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Personal events.
  insert into public.notifications (user_id, actor_id, type, title, body, data)
  select
    re.user_id,
    e.created_by,
    'event_reminder',
    e.title,
    e.title || ' · ' || to_char (e.starts_at, 'Mon DD at HH12:MIam'),
    jsonb_build_object ('event_id', e.id)
  from public.user_event_reminders re
  join public.user_events e on e.id = re.event_id
  where e.starts_at between now () and now () + make_interval (mins => p_window_minutes)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = re.user_id
        and n.type = 'event_reminder'
        and n.data->>'event_id' = e.id::text
        and n.created_at > now () - interval '1 hour'
    );
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- The DROPs above recreate both functions from scratch, which resets their
-- ACLs to the PostgreSQL default (EXECUTE to PUBLIC). Re-apply the tightened
-- grants from 20261011000000_function_execute_hardening.sql so `anon` cannot
-- call them.
-- ---------------------------------------------------------------------------
revoke execute on function public.search_all (text, text, int) from public, anon;
grant  execute on function public.search_all (text, text, int) to authenticated, service_role;

revoke execute on function public.process_due_event_reminders (int) from public, anon, authenticated;
grant  execute on function public.process_due_event_reminders (int) to service_role;

-- pg_cron drives this every 5 minutes; make sure the job is present.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.unschedule ('process_event_reminders');
  end if;
exception when others then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule (
      'process_event_reminders', '*/5 * * * *',
      'select public.process_due_event_reminders()'
    );
  end if;
exception when others then
  null;
end $$;

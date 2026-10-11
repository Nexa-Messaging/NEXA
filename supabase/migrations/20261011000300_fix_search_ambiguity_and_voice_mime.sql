-- ============================================================================
-- Corrective fixes for 20261011000200_fix_search_and_reminders.sql.
--
-- BUG A - search_all: "column reference ``id`` is ambiguous"
--   RETURNS TABLE(category, id, title, subtitle, body, avatar_url,
--   created_at, rank, data) makes those names PL/pgSQL OUT *variables*, not
--   just output columns. Any unqualified use of them inside the body is
--   therefore ambiguous between the variable and a table column, and
--   PostgreSQL rejects the whole statement.
--
--   20261011000200 introduced two such references:
--     * `select id from public.profiles where banned_at is not null`
--       (the banned-creator filter I added to the communities branch)
--     * `order by rank desc, created_at desc`
--   The original had neither, which is why it worked.
--   Both are now table-qualified.
--
-- BUG B - voice notes rejected: "mime type audio/mp4 is not supported"
--   20260915040000_security_audit_fixes.sql tightened the storage bucket
--   MIME allow-lists but omitted audio/mp4, which is what the app and
--   verify.mjs upload for voice notes (iOS records .m4a/.mp4 audio and the
--   MediaRecorder reports audio/mp4). Added to both attachment buckets.
-- ============================================================================
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
        nullif (btrim (concat_ws (' Â· ', pr.school, pr.department, pr.level)), '') as body,
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
        btrim (concat_ws (' Â· ', c.school, c.department, c.level)) as subtitle,
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
          select ban.id from public.profiles ban where ban.banned_at is not null
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
        '#' || ch.name || ' Â· ' || sp.display_name as subtitle,
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
        btrim (concat_ws (' Â· ', co.name, ev.location)) as subtitle,
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
        'Academics Â· ' || sp.display_name as subtitle,
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
    order by all_rows.rank desc, all_rows.created_at desc
    limit v_limit;
end;
$$;


-- ---------------------------------------------------------------------------
-- The DROP above resets the ACL to the PostgreSQL default (EXECUTE to
-- PUBLIC). Re-apply the tightened grants.
-- ---------------------------------------------------------------------------
revoke execute on function public.search_all (text, text, int) from public, anon;
grant  execute on function public.search_all (text, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BUG B. Allow the MIME type actually used for voice notes.
-- ---------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array_append (allowed_mime_types, 'audio/mp4')
where id = 'message-attachments'
  and not ('audio/mp4' = any (allowed_mime_types));

update storage.buckets
set allowed_mime_types = array_append (allowed_mime_types, 'audio/mp4')
where id = 'group-attachments'
  and not ('audio/mp4' = any (allowed_mime_types));

-- ============================================================================
-- NEXA — global search (Phase 12)
--
-- One RPC (`search_all`) searches five kinds of content through a single,
-- rank-ordered result set:
--   * users      — public profiles, minus blocked users and yourself.
--   * communities— the caller's memberships plus their class community
--                  (same discovery filter as `list_communities`).
--   * posts      — community_messages in non-Academics channels.
--   * events     — community_events of communities the caller belongs to.
--   * resources  — community_messages in the Academics channel (study notes,
--                  links and files shared with classmates).
--
-- Matching uses Postgres full-text search (`websearch_to_tsquery`) backed by
-- GIN indexes so every category stays fast even as content grows. Name-ish
-- fields (usernames, community names, event titles) additionally match on
-- case-insensitive substring so partial handles like "bol" still find "bola".
--
-- Privacy: `search_all` is security definer (RLS cannot be relied on inside
-- one function), so it re-checks every visibility rule explicitly. Private
-- direct/group messages are never searchable, and posts/events/resources are
-- restricted to communities the caller belongs to.
--
-- Recent searches are stored server-side (one row per user, max 10, de-duped
-- and ordered by recency) so they survive across devices.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Full-text GIN indexes
-- ----------------------------------------------------------------------------
create index profiles_search_tsv
  on public.profiles using gin (
    to_tsvector ('english',
      coalesce (display_name, '') || ' ' || coalesce (username, '')
        || ' ' || coalesce (school, '') || ' ' || coalesce (department, '')
        || ' ' || coalesce (level, '')
    )
  );

create index communities_search_tsv
  on public.communities using gin (
    to_tsvector ('english',
      coalesce (name, '') || ' ' || coalesce (school, '') || ' ' || coalesce (department, '')
        || ' ' || coalesce (level, '') || ' ' || coalesce (description, '')
    )
  );

-- Messages only carry searchable text while they exist and are not deleted.
create index community_messages_search_tsv
  on public.community_messages using gin (
    to_tsvector ('english', coalesce (body, ''))
  )
  where deleted_at is null and body is not null;

create index community_events_search_tsv
  on public.community_events using gin (
    to_tsvector ('english',
      coalesce (title, '') || ' ' || coalesce (description, '') || ' ' || coalesce (location, '')
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Recent searches
-- ----------------------------------------------------------------------------
create table public.recent_searches (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now (),

  primary key (id),
  constraint recent_searches_query_length check (char_length (query) between 1 and 200)
);

comment on table public.recent_searches
  is 'Server-side recent search queries, capped at 10 per user.';

create index recent_searches_user on public.recent_searches (user_id, created_at desc);

alter table public.recent_searches enable row level security;

create policy "recent_searches_select_own"
  on public.recent_searches
  for select
  using (auth.uid () = user_id);

create policy "recent_searches_insert_own"
  on public.recent_searches
  for insert
  with check (auth.uid () = user_id);

create policy "recent_searches_delete_own"
  on public.recent_searches
  for delete
  using (auth.uid () = user_id);

-- Records a search query. Bumping an existing query refreshes its recency
-- instead of inserting a duplicate, then the list is trimmed to 10 entries.
create or replace function public.add_recent_search (p_query text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_query text := btrim (coalesce (p_query, ''));
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_query = '' or char_length (v_query) > 200 then
    return;
  end if;

  update public.recent_searches
     set created_at = now ()
   where user_id = auth.uid () and lower (query) = lower (v_query);

  if not found then
    insert into public.recent_searches (user_id, query)
    values (auth.uid (), v_query);
  end if;

  delete from public.recent_searches
   where user_id = auth.uid ()
     and id not in (
       select id from public.recent_searches
       where user_id = auth.uid ()
       order by created_at desc
       limit 10
     );
end;
$$;

create or replace function public.list_recent_searches ()
  returns table (query text, created_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select rs.query, rs.created_at
  from public.recent_searches rs
  where rs.user_id = auth.uid ()
  order by rs.created_at desc
  limit 10;
$$;

create or replace function public.clear_recent_searches ()
  returns void
  language sql
  security definer
  set search_path = public
as $$
  delete from public.recent_searches where user_id = auth.uid ();
$$;

-- ----------------------------------------------------------------------------
-- 3. search_all
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

  v_tsquery := websearch_to_tsquery ('english', v_query);

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
grant execute on function public.add_recent_search (text) to authenticated;
grant execute on function public.list_recent_searches () to authenticated;
grant execute on function public.clear_recent_searches () to authenticated;

-- ============================================================================
-- NEXA — polls & events inside class communities (Phase 10)
--
-- Polls: any member of a community may create a multi-option poll with an
-- optional anonymous toggle (voter identity is never exposed) and an optional
-- expiration date. Every member may vote exactly once per poll.
--
-- Events: any member may create an event (title, description, date/time,
-- location, optional photo). Members respond with Going / Maybe / Not going.
-- A caller can opt in to an in-app reminder for an event (a bell that surfaces
-- upcoming events on the community screen).
--
-- Like communities, ALL writes go through security-definer RPCs which re-check
-- membership atomically; the base tables have no INSERT/UPDATE/DELETE policies.
-- Read access is restricted to members of the poll/event's community.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table public.community_polls (
  id uuid not null default gen_random_uuid (),
  community_id uuid not null references public.communities (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  question text not null,
  is_anonymous boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now (),

  primary key (id),
  constraint community_polls_question_length check (char_length (question) between 1 and 300)
);

comment on column public.community_polls.is_anonymous
  is 'When true, voter identity is never recorded or exposed (aggregate counts only).';
comment on column public.community_polls.expires_at
  is 'When set, voting closes at this time; null means the poll never expires.';

create index community_polls_community on public.community_polls (community_id, created_at desc);

create table public.community_poll_options (
  id uuid not null default gen_random_uuid (),
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_text text not null,
  position int not null default 0,

  primary key (id),
  constraint community_poll_options_text_length check (char_length (option_text) between 1 and 120),
  constraint community_poll_options_position_unique unique (poll_id, position)
);

create table public.community_poll_votes (
  poll_id uuid not null references public.community_polls (id) on delete cascade,
  option_id uuid not null references public.community_poll_options (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),

  primary key (poll_id, user_id)
);

comment on table public.community_poll_votes
  is 'One vote per user per poll. The poll_id+user_id key enforces the single-vote rule.';

create index community_poll_votes_option on public.community_poll_votes (option_id);

create table public.community_events (
  id uuid not null default gen_random_uuid (),
  community_id uuid not null references public.communities (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  location text,
  image_path text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),

  primary key (id),
  constraint community_events_title_length check (char_length (title) between 1 and 120),
  constraint community_events_description_length check (description is null or char_length (description) <= 1000),
  constraint community_events_location_length check (location is null or char_length (location) <= 200)
);

create index community_events_community on public.community_events (community_id, starts_at);

create table public.community_event_rsvps (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  response text not null check (response in ('going', 'maybe', 'not_going')),
  updated_at timestamptz not null default now (),

  primary key (event_id, user_id)
);

create table public.community_event_reminders (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),

  primary key (event_id, user_id)
);

comment on table public.community_event_reminders
  is 'In-app "remind me" opt-in per user per event; surfaces upcoming events with a bell.';

-- ----------------------------------------------------------------------------
-- 2. Row Level Security (read = member only; writes exclusively via RPCs)
-- ----------------------------------------------------------------------------
alter table public.community_polls enable row level security;
alter table public.community_poll_options enable row level security;
alter table public.community_poll_votes enable row level security;
alter table public.community_events enable row level security;
alter table public.community_event_rsvps enable row level security;
alter table public.community_event_reminders enable row level security;

create policy "community_polls_select_member"
  on public.community_polls
  for select
  using (
    exists (
      select 1 from public.community_members me
      where me.community_id = community_id and me.user_id = auth.uid ()
    )
  );

create policy "community_poll_options_select_member"
  on public.community_poll_options
  for select
  using (
    exists (
      select 1 from public.community_polls pol
      join public.community_members me on me.community_id = pol.community_id and me.user_id = auth.uid ()
      where pol.id = poll_id
    )
  );

create policy "community_poll_votes_select_member"
  on public.community_poll_votes
  for select
  using (
    exists (
      select 1 from public.community_polls pol
      join public.community_members me on me.community_id = pol.community_id and me.user_id = auth.uid ()
      where pol.id = poll_id
    )
  );

create policy "community_events_select_member"
  on public.community_events
  for select
  using (
    exists (
      select 1 from public.community_members me
      where me.community_id = community_id and me.user_id = auth.uid ()
    )
  );

create policy "community_event_rsvps_select_member"
  on public.community_event_rsvps
  for select
  using (
    exists (
      select 1 from public.community_events ev
      join public.community_members me on me.community_id = ev.community_id and me.user_id = auth.uid ()
      where ev.id = event_id
    )
  );

create policy "community_event_reminders_select_member"
  on public.community_event_reminders
  for select
  using (
    exists (
      select 1 from public.community_events ev
      join public.community_members me on me.community_id = ev.community_id and me.user_id = auth.uid ()
      where ev.id = event_id
    )
  );

-- There are deliberately NO insert/update/delete policies on any table: every
-- write goes through the security-definer RPCs below.

-- ----------------------------------------------------------------------------
-- 3. updated_at + realtime
-- ----------------------------------------------------------------------------
create trigger community_events_set_updated_at
  before update on public.community_events
  for each row execute function public.set_updated_at ();

alter table public.community_polls replica identity full;
alter table public.community_poll_votes replica identity full;
alter table public.community_events replica identity full;
alter table public.community_event_rsvps replica identity full;
alter table public.community_event_reminders replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_polls'
  ) then
    alter publication supabase_realtime add table public.community_polls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_poll_votes'
  ) then
    alter publication supabase_realtime add table public.community_poll_votes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_events'
  ) then
    alter publication supabase_realtime add table public.community_events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_event_rsvps'
  ) then
    alter publication supabase_realtime add table public.community_event_rsvps;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_event_reminders'
  ) then
    alter publication supabase_realtime add table public.community_event_reminders;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC functions — polls
-- ----------------------------------------------------------------------------

-- Creates a poll in a community the caller belongs to, with its options.
create or replace function public.create_community_poll (
  p_community uuid,
  p_question text,
  p_options text[],
  p_anonymous boolean default false,
  p_expires_at timestamptz default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_question text := trim (coalesce (p_question, ''));
  v_opt text;
  v_position int := 0;
  v_poll uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid ()
  ) then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_question = '' or char_length (v_question) > 300 then
    raise exception 'Poll question must be between 1 and 300 characters';
  end if;

  if p_options is null or cardinality (p_options) < 2 or cardinality (p_options) > 10 then
    raise exception 'A poll needs between 2 and 10 options';
  end if;

  if p_expires_at is not null and p_expires_at <= now () then
    raise exception 'Expiration must be in the future';
  end if;

  insert into public.community_polls (community_id, created_by, question, is_anonymous, expires_at)
  values (p_community, auth.uid (), v_question, coalesce (p_anonymous, false), p_expires_at)
  returning id into v_poll;

  foreach v_opt in array p_options loop
    v_opt := trim (coalesce (v_opt, ''));
    if v_opt = '' or char_length (v_opt) > 120 then
      raise exception 'Each option must be between 1 and 120 characters';
    end if;
    insert into public.community_poll_options (poll_id, option_text, position)
    values (v_poll, v_opt, v_position);
    v_position := v_position + 1;
  end loop;

  return v_poll;
end;
$$;

-- The caller's role in the poll's community, or null. Used by other functions.
create or replace function public.role_in_poll_community (p_poll uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select me.role
  from public.community_polls pol
  join public.community_members me
    on me.community_id = pol.community_id and me.user_id = auth.uid ()
  where pol.id = p_poll
$$;

-- Polls of a community, one row per option, with aggregate results, the
-- caller's vote and the caller's role. Anonymous polls never expose voter
-- identity; this function only ever returns aggregate counts.
create or replace function public.list_community_polls (p_community uuid)
  returns table (
    poll_id uuid,
    question text,
    is_anonymous boolean,
    expires_at timestamptz,
    created_by uuid,
    creator_display_name text,
    creator_username text,
    created_at timestamptz,
    my_role text,
    my_vote_option_id uuid,
    total_votes bigint,
    is_expired boolean,
    option_id uuid,
    option_text text,
    option_position int,
    option_votes bigint
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    pol.id, pol.question, pol.is_anonymous, pol.expires_at, pol.created_by,
    pr.display_name, pr.username, pol.created_at, me.role,
    (select ov.option_id from public.community_poll_votes ov
      where ov.poll_id = pol.id and ov.user_id = auth.uid ()),
    (select count (*) from public.community_poll_votes allv where allv.poll_id = pol.id),
    pol.expires_at is not null and pol.expires_at <= now (),
    opt.id, opt.option_text, opt.position,
    (select count (*) from public.community_poll_votes thisv where thisv.option_id = opt.id)
  from public.community_polls pol
  join public.community_poll_options opt on opt.poll_id = pol.id
  join public.profiles pr on pr.id = pol.created_by
  join public.community_members me on me.community_id = pol.community_id and me.user_id = auth.uid ()
  where pol.community_id = p_community
  order by pol.created_at desc, opt.position;
$$;

-- Records the caller's vote (once per poll). Blocked for expired polls.
create or replace function public.vote_community_poll (p_poll uuid, p_option uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_expires timestamptz;
  v_opt_poll uuid;
  v_inserted int;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, expires_at into v_community, v_expires
  from public.community_polls where id = p_poll;

  if v_community is null then
    raise exception 'Poll not found';
  end if;

  if not exists (
    select 1 from public.community_members
    where community_id = v_community and user_id = auth.uid ()
  ) then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_expires is not null and v_expires <= now () then
    raise exception 'This poll has expired';
  end if;

  select poll_id into v_opt_poll from public.community_poll_options where id = p_option;
  if v_opt_poll is null or v_opt_poll <> p_poll then
    raise exception 'Option does not belong to this poll';
  end if;

  insert into public.community_poll_votes (poll_id, option_id, user_id)
  values (p_poll, p_option, auth.uid ())
  on conflict (poll_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'You have already voted in this poll';
  end if;
end;
$$;

-- Voter breakdown for a NON-anonymous poll: visible to the poll author and to
-- community admins/owners only. Anonymous polls return no rows.
create or replace function public.list_community_poll_voters (p_poll uuid)
  returns table (
    user_id uuid,
    display_name text,
    username text,
    avatar_url text,
    option_id uuid,
    voted_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select v.user_id, pr.display_name, pr.username, pr.avatar_url, v.option_id, v.created_at
  from public.community_poll_votes v
  join public.community_polls pol on pol.id = v.poll_id
  join public.profiles pr on pr.id = v.user_id
  join public.community_members me on me.community_id = pol.community_id and me.user_id = auth.uid ()
  where v.poll_id = p_poll
    and pol.is_anonymous = false
    and (pol.created_by = auth.uid () or me.role in ('admin', 'owner'))
  order by v.created_at;
$$;

-- Deletes a poll (its options and votes cascade). The author or a community
-- admin/owner may delete it.
create or replace function public.delete_community_poll (p_poll uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_author uuid;
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, created_by into v_community, v_author
  from public.community_polls where id = p_poll;

  if v_community is null then
    raise exception 'Poll not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this poll';
  end if;

  delete from public.community_polls where id = p_poll;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC functions — events
-- ----------------------------------------------------------------------------

-- Creates an event in a community the caller belongs to.
create or replace function public.create_community_event (
  p_community uuid,
  p_title text,
  p_starts_at timestamptz,
  p_description text default null,
  p_location text default null,
  p_image_path text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_title text := trim (coalesce (p_title, ''));
  v_location text := nullif (trim (coalesce (p_location, '')), '');
  v_event uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = auth.uid ()
  ) then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_title = '' or char_length (v_title) > 120 then
    raise exception 'Event title must be between 1 and 120 characters';
  end if;

  if p_starts_at is null then
    raise exception 'An event needs a date and time';
  end if;

  if p_description is not null and char_length (p_description) > 1000 then
    raise exception 'Description must be at most 1000 characters';
  end if;

  if v_location is not null and char_length (v_location) > 200 then
    raise exception 'Location must be at most 200 characters';
  end if;

  if p_image_path is not null and not exists (
    select 1 from storage.objects
    where bucket_id = 'event-images'
      and name = p_image_path
      and (storage.foldername (name)) [1] = p_community::text
      and (storage.foldername (name)) [2] = auth.uid ()::text
  ) then
    raise exception 'Image was not uploaded for this community';
  end if;

  insert into public.community_events (
    community_id, created_by, title, description, starts_at, location, image_path
  )
  values (
    p_community, auth.uid (), v_title,
    nullif (p_description, ''), p_starts_at, v_location, p_image_path
  )
  returning id into v_event;

  return v_event;
end;
$$;

-- Events of a community with the caller's response, response tallies, the
-- reminder opt-in and the caller's role.
create or replace function public.list_community_events (p_community uuid)
  returns table (
    event_id uuid,
    title text,
    description text,
    starts_at timestamptz,
    location text,
    image_path text,
    created_by uuid,
    created_at timestamptz,
    community_id uuid,
    my_role text,
    my_response text,
    reminding boolean,
    going_count bigint,
    maybe_count bigint,
    not_going_count bigint
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    ev.id, ev.title, ev.description, ev.starts_at, ev.location, ev.image_path,
    ev.created_by, ev.created_at, ev.community_id, me.role,
    (select rs.response from public.community_event_rsvps rs
      where rs.event_id = ev.id and rs.user_id = auth.uid ()),
    exists (
      select 1 from public.community_event_reminders re
      where re.event_id = ev.id and re.user_id = auth.uid ()
    ),
    (select count (*) from public.community_event_rsvps cg where cg.event_id = ev.id and cg.response = 'going'),
    (select count (*) from public.community_event_rsvps cb where cb.event_id = ev.id and cb.response = 'maybe'),
    (select count (*) from public.community_event_rsvps cn where cn.event_id = ev.id and cn.response = 'not_going')
  from public.community_events ev
  join public.community_members me on me.community_id = ev.community_id and me.user_id = auth.uid ()
  where ev.community_id = p_community
  order by ev.starts_at;
$$;

-- Sets/updates the caller's RSVP for an event. Reused for all three states.
create or replace function public.respond_to_event (p_event uuid, p_response text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_response is null or p_response not in ('going', 'maybe', 'not_going') then
    raise exception 'Response must be going, maybe or not_going';
  end if;

  if not exists (
    select 1
    from public.community_events ev
    join public.community_members me
      on me.community_id = ev.community_id and me.user_id = auth.uid ()
    where ev.id = p_event
  ) then
    raise exception 'Event not found or you are not a member';
  end if;

  insert into public.community_event_rsvps (event_id, user_id, response)
  values (p_event, auth.uid (), p_response)
  on conflict (event_id, user_id)
  do update set response = excluded.response, updated_at = now ();
end;
$$;

-- Toggles the caller's in-app reminder for an event.
create or replace function public.toggle_event_reminder (p_event uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_on boolean;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.community_events ev
    join public.community_members me
      on me.community_id = ev.community_id and me.user_id = auth.uid ()
    where ev.id = p_event
  ) then
    raise exception 'Event not found or you are not a member';
  end if;

  select exists (
    select 1 from public.community_event_reminders
    where event_id = p_event and user_id = auth.uid ()
  ) into v_on;

  if v_on then
    delete from public.community_event_reminders
    where event_id = p_event and user_id = auth.uid ();
    return false;
  end if;

  insert into public.community_event_reminders (event_id, user_id)
  values (p_event, auth.uid ())
  on conflict do nothing;
  return true;
end;
$$;

-- Updates an event. The author or a community admin/owner may edit it.
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
  v_title text := trim (coalesce (p_title, ''));
  v_location text := nullif (trim (coalesce (p_location, '')), '');
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, created_by into v_community, v_author
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

  if p_image_path is not null then
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

-- Deletes an event. The author or a community admin/owner may delete it; the
-- event image is removed from storage.
create or replace function public.delete_community_event (p_event uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_author uuid;
  v_role text;
  v_path text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, created_by, image_path into v_community, v_author, v_path
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
    raise exception 'You are not allowed to delete this event';
  end if;

  delete from public.community_events where id = p_event;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'event-images' and name = v_path;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Private storage bucket (event images)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', false)
on conflict (id) do nothing;

-- Event image upload/overwrite: a member of the community named by folder[1]
-- and the caller owns the sender subfolder (folder[2]).
create policy "event_images_insert_member"
  on storage.objects
  for insert
  with check (
    bucket_id = 'event-images'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

create policy "event_images_update_member"
  on storage.objects
  for update
  using (
    bucket_id = 'event-images'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Event image download / signed URLs: any member of the community.
create policy "event_images_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'event-images'
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Event image removal: the uploader, or any admin/owner of the community.
create policy "event_images_delete_author"
  on storage.objects
  for delete
  using (
    bucket_id = 'event-images'
    and (
      (storage.foldername (name)) [2] = auth.uid ()::text
      or exists (
        select 1 from public.community_members m
        where m.community_id::text = (storage.foldername (name)) [1]
          and m.user_id = auth.uid ()
          and m.role in ('admin', 'owner')
      )
    )
  );
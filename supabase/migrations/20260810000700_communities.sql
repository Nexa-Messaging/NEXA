-- ============================================================================
-- NEXA — student communities (Phase 9)
-- School -> Department -> Level/Class -> Community.
--
-- A community is a *class community*: unique per (school, department, level)
-- in the `communities` table. Users join their own class community. Each
-- community ships with four fixed channels (General, Academics,
-- Announcements, Social) whose kinds are enforced by a check constraint.
--
-- Permissions:
--   * owner  — created the community; may do everything, including delegating
--              the role (leave handoff) and deleting the community.
--   * admin  — may manage members, promote/demote non-owner admins, rename /
--              describe / set the photo, post in the Announcements channel and
--              delete any message.
--   * member — may read every channel, post where permitted (all except the
--              Announcements channel), react, reply and delete their own posts.
--
-- Ordinary members can NEVER perform admin actions — every write runs through
-- a security definer RPC which re-checks membership AND role atomically, and
-- direct INSERT/UPDATE/DELETE on the tables is impossible (no write policies).
--
-- Discovery: authenticated users can SELECT the `communities` table so they
-- can find their class community; channel/message/membership data is gated to
-- members only. Joining is restricted to users whose profile class matches the
-- community.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table public.communities (
  id uuid not null default gen_random_uuid (),
  name text not null,
  description text,
  avatar_path text,
  school text not null,
  department text not null,
  level text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),

  primary key (id),
  constraint communities_name_length check (char_length (name) between 1 and 80),
  constraint communities_description_length check (description is null or char_length (description) <= 500),
  constraint communities_school_length check (char_length (school) between 1 and 120),
  constraint communities_department_length check (char_length (department) between 1 and 120),
  constraint communities_level_length check (char_length (level) between 1 and 20)
);

-- One class community per school/department/level.
create unique index communities_class_key
  on public.communities (lower (btrim (school)), lower (btrim (department)), lower (btrim (level)));

comment on table public.communities is 'A class community, unique per school/department/level.';
comment on column public.communities.created_by is 'The user who created the community (matches the owner membership row).';

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now (),

  primary key (community_id, user_id)
);

comment on table public.community_members is 'Membership + role of each user in a community.';
comment on column public.community_members.role
  is 'owner (creator) > admin > member. Determines what the user may do in the community.';

create index community_members_user on public.community_members (user_id);

create table public.community_channels (
  id uuid not null default gen_random_uuid (),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('general', 'academics', 'announcements', 'social')),
  sort_order int not null default 0,
  created_at timestamptz not null default now (),

  primary key (id),
  constraint community_channels_name_length check (char_length (name) between 1 and 40),
  constraint community_channels_kind_unique unique (community_id, kind)
);

comment on table public.community_channels is 'Fixed channel set of a community. Announcements is write-only for admins.';
comment on column public.community_channels.kind
  is 'general | academics | announcements | social. Only admins/owner can post to announcements.';

create index community_channels_order on public.community_channels (community_id, sort_order);

create table public.community_messages (
  id uuid not null default gen_random_uuid (),
  seq bigint not null generated always as identity,
  community_id uuid not null references public.communities (id) on delete cascade,
  channel_id uuid not null references public.community_channels (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text,
  reply_to_id uuid references public.community_messages (id) on delete set null,
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
  constraint community_messages_body_length check (body is null or char_length (body) <= 4000),
  constraint community_messages_type_ck check (message_type in ('text', 'image', 'video', 'voice')),
  constraint community_messages_media_requires_path_ck check (message_type = 'text' or media_path is not null)
);

comment on column public.community_messages.reactions
  is 'JSONB array of {user_id, emoji} — single row per user+emoji, managed by RPCs.';
comment on column public.community_messages.body
  is 'Message text. Nulled on soft delete so bodies are scrubbed server-side.';

create index community_messages_channel_seq on public.community_messages (channel_id, seq);
create index community_messages_community_seq on public.community_messages (community_id, seq);

create table public.community_channel_reads (
  community_id uuid not null references public.communities (id) on delete cascade,
  channel_id uuid not null references public.community_channels (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_seq bigint not null default 0,

  primary key (channel_id, user_id)
);

comment on table public.community_channel_reads
  is 'Per-member read watermark for every channel; used to compute unread counts.';

-- ----------------------------------------------------------------------------
-- 2. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_channel_reads enable row level security;

-- Discovery: any signed-in user may list communities (name, class, photo).
create policy "communities_select_auth"
  on public.communities
  for select
  using (auth.role () = 'authenticated');

-- Membership check used by every member-gated policy below. It is security
-- definer so the inner SELECT on community_members is not itself re-folded
-- through RLS, which would otherwise cause infinite recursion.
create or replace function public.is_community_member (p_community uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.community_members me
    where me.community_id = p_community and me.user_id = auth.uid ()
  );
$$;

-- Members only for everything else (read side). All writes go via RPCs.
create policy "community_members_select_member"
  on public.community_members
  for select
  using (public.is_community_member (community_id));

create policy "community_channels_select_member"
  on public.community_channels
  for select
  using (public.is_community_member (community_id));

create policy "community_messages_select_member"
  on public.community_messages
  for select
  using (public.is_community_member (community_id));

create policy "community_channel_reads_select_member"
  on public.community_channel_reads
  for select
  using (public.is_community_member (community_id));

-- There are deliberately NO insert/update/delete policies on any table: every
-- write goes through the RPC functions below.

-- ----------------------------------------------------------------------------
-- 3. updated_at + realtime
-- ----------------------------------------------------------------------------
create trigger communities_set_updated_at
  before update on public.communities
  for each row execute function public.set_updated_at ();

alter table public.communities replica identity full;
alter table public.community_members replica identity full;
alter table public.community_channels replica identity full;
alter table public.community_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'communities'
  ) then
    alter publication supabase_realtime add table public.communities;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_members'
  ) then
    alter publication supabase_realtime add table public.community_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_channels'
  ) then
    alter publication supabase_realtime add table public.community_channels;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_messages'
  ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC functions
-- ----------------------------------------------------------------------------

-- The caller's role in a community, or null. (Not security definer — it is
-- only ever called from inside security definer functions with search_path.)
create or replace function public.community_role (p_community uuid)
  returns text
  language sql
  stable
  set search_path = public
as $$
  select role from public.community_members
  where community_id = p_community and user_id = auth.uid ()
$$;

-- Normalised class comparison used for joining/matching. Returns true when an
-- arbitrary profile row's class matches the community's.
create or replace function public.community_matches_class (
  p_community uuid,
  p_school text,
  p_department text,
  p_level text
)
  returns boolean
  language sql
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = p_community
      and lower (btrim (c.school)) = lower (btrim (coalesce (p_school, '')))
      and lower (btrim (c.department)) = lower (btrim (coalesce (p_department, '')))
      and lower (btrim (c.level)) = lower (btrim (coalesce (p_level, '')))
  )
$$;

-- Creates the class community for a school/department/level with the caller as
-- owner and the four fixed channels. Name defaults to "<level> <department>".
create or replace function public.create_community (
  p_school text,
  p_department text,
  p_level text,
  p_name text default null,
  p_description text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_school text := trim (coalesce (p_school, ''));
  v_department text := trim (coalesce (p_department, ''));
  v_level text := trim (coalesce (p_level, ''));
  v_name text := trim (coalesce (p_name, ''));
  v_description text := nullif (trim (coalesce (p_description, '')), '');
  v_community uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_school = '' or v_department = '' or v_level = '' then
    raise exception 'School, department and level are required';
  end if;

  if char_length (v_school) > 120 or char_length (v_department) > 120 or char_length (v_level) > 20 then
    raise exception 'School, department or level is too long';
  end if;

  if v_name = '' then
    v_name := v_level || ' ' || v_department;
  end if;
  if char_length (v_name) > 80 then
    raise exception 'Community name must be 80 characters or fewer';
  end if;

  insert into public.communities (name, description, school, department, level, created_by)
  values (v_name, v_description, v_school, v_department, v_level, auth.uid ())
  returning id into v_community;

  insert into public.community_members (community_id, user_id, role)
  values (v_community, auth.uid (), 'owner');

  insert into public.community_channels (community_id, name, kind, sort_order) values
    (v_community, 'General', 'general', 0),
    (v_community, 'Academics', 'academics', 1),
    (v_community, 'Social', 'social', 2),
    (v_community, 'Announcements', 'announcements', 3);

  return v_community;
end;
$$;

-- Joins the caller's class community: matches the caller's profile class to an
-- existing community (creating it when none exists). Returns the community id.
create or replace function public.join_my_class_community ()
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_school text;
  v_department text;
  v_level text;
  v_community uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select p.school, p.department, p.level into v_school, v_department, v_level
  from public.profiles p where p.id = auth.uid ();

  if v_school is null or v_department is null or v_level is null then
    raise exception 'Set your school, department and level in your profile first';
  end if;

  select c.id into v_community
  from public.communities c
  where lower (btrim (c.school)) = lower (btrim (v_school))
    and lower (btrim (c.department)) = lower (btrim (v_department))
    and lower (btrim (c.level)) = lower (btrim (v_level));

  if v_community is null then
    v_community := public.create_community (v_school, v_department, v_level);
    return v_community;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_community, auth.uid (), 'member')
  on conflict (community_id, user_id) do nothing;

  return v_community;
end;
$$;

-- Joins a specific community, but only when the caller's profile class matches.
create or replace function public.join_community (p_community uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_school text;
  v_department text;
  v_level text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select p.school, p.department, p.level into v_school, v_department, v_level
  from public.profiles p where p.id = auth.uid ();

  if v_school is null or v_department is null or v_level is null then
    raise exception 'Set your school, department and level in your profile first';
  end if;

  if not public.community_matches_class (p_community, v_school, v_department, v_level) then
    raise exception 'You can only join your own class community';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (p_community, auth.uid (), 'member')
  on conflict (community_id, user_id) do nothing;
end;
$$;

-- Community list for the signed-in user: communities they belong to plus the
-- discoverable class communities that match their profile. Because unread
-- counts are only meaningful to members, they are computed per channel.
create or replace function public.list_communities ()
  returns table (
    community_id uuid,
    name text,
    description text,
    avatar_path text,
    school text,
    department text,
    level text,
    is_member boolean,
    my_role text,
    member_count bigint,
    unread_count bigint,
    last_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    c.id,
    c.name,
    c.description,
    c.avatar_path,
    c.school,
    c.department,
    c.level,
    me.role is not null,
    me.role,
    (select count (*) from public.community_members allm where allm.community_id = c.id),
    coalesce ((
      select sum (sub.unread)
      from (
        select (
          select count (*)
          from public.community_messages m
          where m.channel_id = ch.id
            and m.sender_id <> auth.uid ()
            and m.deleted_at is null
            and m.seq > coalesce ((select r.last_read_seq from public.community_channel_reads r
                                    where r.channel_id = ch.id and r.user_id = auth.uid ()), 0)
        ) as unread
        from public.community_channels ch
        where ch.community_id = c.id
      ) sub
    ), 0),
    coalesce ((select max (m.created_at)
                 from public.community_messages m where m.community_id = c.id), c.updated_at) as last_at
  from public.communities c
  left join public.community_members me
    on me.community_id = c.id and me.user_id = auth.uid ()
  left join public.profiles p on p.id = auth.uid ()
  where me.role is not null
     or (lower (btrim (c.school)) = lower (btrim (coalesce (p.school, '')))
         and lower (btrim (c.department)) = lower (btrim (coalesce (p.department, '')))
         and lower (btrim (c.level)) = lower (btrim (coalesce (p.level, ''))))
  order by (me.role is not null) desc, last_at desc;
$$;

-- Header info for a community the caller belongs to.
create or replace function public.community_info (p_community uuid)
  returns table (
    id uuid,
    name text,
    description text,
    avatar_path text,
    school text,
    department text,
    level text,
    created_by uuid,
    created_at timestamptz,
    my_role text,
    member_count bigint
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    c.id, c.name, c.description, c.avatar_path, c.school, c.department, c.level,
    c.created_by, c.created_at, me.role,
    (select count (*) from public.community_members allm where allm.community_id = c.id)
  from public.communities c
  join public.community_members me
    on me.community_id = c.id and me.user_id = auth.uid ()
  where c.id = p_community;
$$;

-- Members of a community with their profiles (member only), admins/owner first.
create or replace function public.list_community_members (p_community uuid)
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
  select m.user_id, p.display_name, p.username, p.avatar_url, m.role, m.joined_at
  from public.community_members m
  join public.profiles p on p.id = m.user_id
  where m.community_id = p_community
    and exists (
      select 1 from public.community_members me
      where me.community_id = p_community and me.user_id = auth.uid ()
    )
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    m.joined_at;
$$;

-- User profiles that match the community's class and are not yet members.
-- Used by the admin "add members" picker.
create or replace function public.list_class_users (p_community uuid)
  returns table (
    user_id uuid,
    display_name text,
    username text,
    avatar_url text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where lower (btrim (p.school)) = (select lower (btrim (c.school)) from public.communities c where c.id = p_community)
    and lower (btrim (p.department)) = (select lower (btrim (c.department)) from public.communities c where c.id = p_community)
    and lower (btrim (p.level)) = (select lower (btrim (c.level)) from public.communities c where c.id = p_community)
    and p.id <> auth.uid ()
    and not exists (
      select 1 from public.community_members m
      where m.community_id = p_community and m.user_id = p.id
    );
$$;

-- Channels of the caller's community, with last message preview, per-channel
-- unread and whether the caller may post (announcements are admin-write-only).
create or replace function public.list_community_channels (p_community uuid)
  returns table (
    channel_id uuid,
    name text,
    kind text,
    sort_order int,
    last_message text,
    last_at timestamptz,
    unread_count bigint,
    can_post boolean
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    ch.id, ch.name, ch.kind, ch.sort_order,
    case m.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎤 Voice note'
      else coalesce (m.body, '')
    end,
    coalesce (m.created_at, ch.created_at),
    (select count (*)
       from public.community_messages cm
      where cm.channel_id = ch.id
        and cm.sender_id <> auth.uid ()
        and cm.deleted_at is null
        and cm.seq > coalesce ((select r.last_read_seq from public.community_channel_reads r
                                where r.channel_id = ch.id and r.user_id = auth.uid ()), 0)),
    ch.kind <> 'announcements'
      or (select role from public.community_members rm
          where rm.community_id = p_community and rm.user_id = auth.uid ()) in ('admin', 'owner')
  from public.community_channels ch
  left join lateral (
    select body, message_type, created_at
    from public.community_messages m2
    where m2.channel_id = ch.id and m2.deleted_at is null
    order by m2.seq desc
    limit 1
  ) m on true
  where ch.community_id = p_community
    and exists (
      select 1 from public.community_members me
      where me.community_id = p_community and me.user_id = auth.uid ()
    )
  order by ch.sort_order;
$$;

-- Header + permission context for an open channel (member of its community).
create or replace function public.channel_info (p_channel uuid)
  returns table (
    id uuid,
    community_id uuid,
    community_name text,
    name text,
    kind text,
    my_role text,
    can_post boolean
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    ch.id, ch.community_id, c.name, ch.name, ch.kind, me.role,
    ch.kind <> 'announcements' or me.role in ('admin', 'owner')
  from public.community_channels ch
  join public.communities c on c.id = ch.community_id
  join public.community_members me
    on me.community_id = ch.community_id and me.user_id = auth.uid ()
  where ch.id = p_channel;
$$;

-- Messages of a channel with sender profile info (member only), oldest first.
create or replace function public.list_channel_messages (p_channel uuid)
  returns table (
    id uuid,
    seq bigint,
    community_id uuid,
    channel_id uuid,
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
    m.id, m.seq, m.community_id, m.channel_id, m.sender_id,
    p.display_name, p.username, p.avatar_url,
    m.body, m.reply_to_id, m.reactions, m.message_type,
    m.media_path, m.media_mime, m.media_width, m.media_height,
    m.media_duration, m.media_size, m.created_at, m.edited_at, m.deleted_at
  from public.community_messages m
  join public.profiles p on p.id = m.sender_id
  where m.channel_id = p_channel
    and exists (
      select 1 from public.community_members me
      where me.community_id = m.community_id and me.user_id = auth.uid ()
    )
  order by m.seq;
$$;

-- Marks the caller's read watermark for a channel to the newest message.
create or replace function public.mark_channel_read (p_channel uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_max bigint;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id into v_community
  from public.community_channels where id = p_channel;

  if not exists (
    select 1 from public.community_members
    where community_id = v_community and user_id = auth.uid ()
  ) then
    raise exception 'Community not found or you are not a member';
  end if;

  select coalesce (max (seq), 0) into v_max
  from public.community_messages where channel_id = p_channel;

  insert into public.community_channel_reads (community_id, channel_id, user_id, last_read_seq)
  values (v_community, p_channel, auth.uid (), v_max)
  on conflict (channel_id, user_id)
  do update set last_read_seq = excluded.last_read_seq, community_id = excluded.community_id;

  return v_max;
end;
$$;

-- Sends a text message to a channel the caller belongs to. Announcements
-- channel requires an admin or the owner.
create or replace function public.send_community_message (
  p_channel uuid,
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
  v_community uuid;
  v_kind text;
  v_role text;
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, kind into v_community, v_kind
  from public.community_channels where id = p_channel;

  if v_community is null then
    raise exception 'Channel not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_kind = 'announcements' and v_role not in ('admin', 'owner') then
    raise exception 'Only admins can post announcements';
  end if;

  if v_body = '' then
    raise exception 'Message cannot be empty';
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.community_messages
    where id = p_reply_to and channel_id = p_channel
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.community_messages (community_id, channel_id, sender_id, body, reply_to_id)
  values (v_community, p_channel, auth.uid (), v_body, p_reply_to)
  returning id into v_message;

  update public.communities set updated_at = now () where id = v_community;

  return v_message;
end;
$$;

-- Registers an already-uploaded media message in a channel. The object must sit
-- in the community-attachments bucket under "<community>/<caller>/...".
create or replace function public.send_community_media_message (
  p_channel uuid,
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
  v_community uuid;
  v_kind text;
  v_role text;
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, kind into v_community, v_kind
  from public.community_channels where id = p_channel;

  if v_community is null then
    raise exception 'Channel not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_kind = 'announcements' and v_role not in ('admin', 'owner') then
    raise exception 'Only admins can post announcements';
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
    where bucket_id = 'community-attachments'
      and name = p_media_path
      and (storage.foldername (name)) [1] = v_community::text
      and (storage.foldername (name)) [2] = auth.uid ()::text
  ) then
    raise exception 'Media file was not uploaded for this community';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.community_messages
    where id = p_reply_to and channel_id = p_channel
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.community_messages (
    community_id, channel_id, sender_id, body, reply_to_id,
    message_type, media_path, media_mime, media_width, media_height,
    media_duration, media_size
  )
  values (
    v_community, p_channel, auth.uid (), nullif (v_body, ''), p_reply_to,
    p_type, p_media_path, p_mime, p_width, p_height, p_duration, p_size
  )
  returning id into v_message;

  update public.communities set updated_at = now () where id = v_community;

  return v_message;
end;
$$;

-- Soft-deletes a community message. The sender, or any admin/owner of the
-- community, may delete a message. Media objects are removed from storage.
create or replace function public.delete_community_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
  v_community uuid;
  v_role text;
  v_author uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, media_path, sender_id into v_community, v_path, v_author
  from public.community_messages where id = p_message;

  if not found then
    raise exception 'Message not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this message';
  end if;

  update public.community_messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'community-attachments' and name = v_path;
  end if;
end;
$$;

-- Adds an emoji reaction from the caller. Single row per user+emoji.
create or replace function public.react_to_community_message (p_message uuid, p_emoji text)
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
    from public.community_messages m
    join public.community_members me on me.community_id = m.community_id and me.user_id = auth.uid ()
    where m.id = p_message
  ) then
    raise exception 'Message not found or you are not a member';
  end if;

  update public.community_messages
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

-- Removes one of the caller's reactions from a community message.
create or replace function public.unreact_to_community_message (p_message uuid, p_emoji text)
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
    from public.community_messages m
    join public.community_members me on me.community_id = m.community_id and me.user_id = auth.uid ()
    where m.id = p_message
  ) then
    raise exception 'Message not found or you are not a member';
  end if;

  update public.community_messages
     set reactions = (
       select coalesce (jsonb_agg (e), '[]'::jsonb)
       from jsonb_array_elements (reactions) e
       where e->>'user_id' <> auth.uid ()::text or e->>'emoji' <> p_emoji
     )
   where id = p_message;
end;
$$;

-- Adds classmates to a community. Admin/owner only; the targets' profile class
-- must match the community's.
create or replace function public.add_community_members (
  p_community uuid,
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

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
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
      if not public.community_matches_class (p_community,
          (select p.school from public.profiles p where p.id = v_member),
          (select p.department from public.profiles p where p.id = v_member),
          (select p.level from public.profiles p where p.id = v_member)) then
        raise exception 'You can only add classmates to this community';
      end if;
      insert into public.community_members (community_id, user_id, role)
      values (p_community, v_member, 'member')
      on conflict (community_id, user_id) do nothing;
    end loop;
  end if;
end;
$$;

-- Removes a member from a community. Admins may remove regular members or
-- demote/promote admins via set_community_role; the owner may remove any
-- non-owner. Nobody can remove the owner.
create or replace function public.remove_community_member (p_community uuid, p_member uuid)
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

  select role into v_actor from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_actor is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_actor not in ('admin', 'owner') then
    raise exception 'Only admins can remove members';
  end if;

  select role into v_target from public.community_members
  where community_id = p_community and user_id = p_member;

  if v_target is null then
    raise exception 'This user is not a member';
  end if;

  if v_target = 'owner' then
    raise exception 'The owner cannot be removed';
  end if;

  if v_actor = 'admin' and v_target = 'admin' then
    raise exception 'Admins cannot remove other admins';
  end if;

  delete from public.community_members
   where community_id = p_community and user_id = p_member;
end;
$$;

-- Changes a member's role (member <-> admin). The owner may change any
-- non-owner's role; admins may promote members or demote other admins, but
-- nobody can change the owner's role.
create or replace function public.set_community_role (
  p_community uuid,
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

  select role into v_actor from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_actor is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_actor not in ('admin', 'owner') then
    raise exception 'Only admins can change roles';
  end if;

  if exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = p_member and role = 'owner'
  ) then
    raise exception 'The owner role cannot be changed';
  end if;

  update public.community_members
     set role = p_role
   where community_id = p_community and user_id = p_member;

  if not found then
    raise exception 'This user is not a member';
  end if;
end;
$$;

-- Updates the community name/description. Admin/owner only.
create or replace function public.update_community_settings (
  p_community uuid,
  p_name text default null,
  p_description text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := trim (coalesce (p_name, ''));
  v_description text := nullif (trim (coalesce (p_description, '')), '');
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can edit the community settings';
  end if;

  if p_name is not null then
    if v_name = '' or char_length (v_name) > 80 then
      raise exception 'Community name must be between 1 and 80 characters';
    end if;
    update public.communities set name = v_name where id = p_community;
  end if;

  update public.communities set description = v_description where id = p_community;
end;
$$;

-- Sets the community photo (object path in the community-avatars bucket).
-- Admin/owner only; the previous photo is removed from storage.
create or replace function public.set_community_avatar (p_community uuid, p_avatar_path text)
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

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can change the community photo';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'community-avatars'
      and name = p_avatar_path
      and (storage.foldername (name)) [1] = p_community::text
  ) then
    raise exception 'Photo was not uploaded for this community';
  end if;

  select avatar_path into v_old_path
  from public.communities where id = p_community;

  update public.communities set avatar_path = p_avatar_path where id = p_community;

  if v_old_path is not null and v_old_path <> p_avatar_path then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'community-avatars' and name = v_old_path;
  end if;
end;
$$;

-- Leaves a community. The owner's departure transfers ownership to the earliest
-- admin (else earliest member); when the last member leaves the community is
-- deleted and its storage objects are removed.
create or replace function public.leave_community (p_community uuid)
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

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  delete from public.community_members
   where community_id = p_community and user_id = auth.uid ();

  if v_role = 'owner' then
    select user_id into v_next
    from public.community_members
    where community_id = p_community
    order by case when role = 'admin' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      perform set_config ('storage.allow_delete_query', 'true', true);
      delete from storage.objects
      where bucket_id = 'community-attachments'
        and (storage.foldername (name)) [1] = p_community::text;
      delete from storage.objects
      where bucket_id = 'community-avatars'
        and (storage.foldername (name)) [1] = p_community::text;
      delete from public.communities where id = p_community;
    else
      update public.community_members
         set role = 'owner'
       where community_id = p_community and user_id = v_next;
    end if;
  end if;
end;
$$;

-- Permanently deletes a community (owner only). Members, channels, messages
-- and all attachments are removed from storage.
create or replace function public.delete_community (p_community uuid)
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

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_role <> 'owner' then
    raise exception 'Only the owner can delete the community';
  end if;

  -- Storage objects are removed by the client via the Storage API before the
  -- community is deleted (direct SQL deletes from storage.objects are blocked).

  delete from public.communities where id = p_community;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Private storage buckets (photos + attachments)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('community-avatars', 'community-avatars', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('community-attachments', 'community-attachments', false)
on conflict (id) do nothing;

-- Community photo upload/overwrite: admin/owner of the community named by folder[1].
create policy "community_avatars_insert_admin"
  on storage.objects
  for insert
  with check (
    bucket_id = 'community-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

create policy "community_avatars_update_admin"
  on storage.objects
  for update
  using (
    bucket_id = 'community-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

-- Community photo download / signed URLs: any member.
create policy "community_avatars_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'community-avatars'
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

create policy "community_avatars_delete_admin"
  on storage.objects
  for delete
  using (
    bucket_id = 'community-avatars'
    and auth.uid () is not null
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
        and m.role in ('admin', 'owner')
    )
  );

-- Attachment upload: the caller owns the sender subfolder and is a member.
create policy "community_attachments_insert_member"
  on storage.objects
  for insert
  with check (
    bucket_id = 'community-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

create policy "community_attachments_update_member"
  on storage.objects
  for update
  using (
    bucket_id = 'community-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Attachment download / signed URLs: any member.
create policy "community_attachments_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'community-attachments'
    and exists (
      select 1 from public.community_members m
      where m.community_id::text = (storage.foldername (name)) [1]
        and m.user_id = auth.uid ()
    )
  );

-- Attachment removal: the sender, or any admin/owner of the community.
create policy "community_attachments_delete_author"
  on storage.objects
  for delete
  using (
    bucket_id = 'community-attachments'
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
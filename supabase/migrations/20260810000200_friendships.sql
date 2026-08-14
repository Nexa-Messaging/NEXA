-- ============================================================================
-- NEXA — friendships + blocks
-- Friend requests (single 'pending'/'accepted' row, request creator is
-- user_id), blocking, status helper, and RPC mutation endpoints.
--
-- Security model:
--   * RLS allows reads only for the two participants, and allows NO direct
--     inserts/updates/deletes. Every mutation goes through the RPC functions
--     below which enforce the business rules atomically.
--   * A unique index on the normalized (least, greatest) pair prevents
--     duplicate relationships in either direction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. friendships
-- ----------------------------------------------------------------------------
create table public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),

  primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

-- One friendship per unordered pair of users (blocks A->B plus B->A).
create unique index friendships_pair_key
  on public.friendships (least (user_id, friend_id), greatest (user_id, friend_id));

comment on table public.friendships is
  'Directed rows: user_id sent the request, friend_id is the recipient.';
comment on column public.friendships.status
  is 'pending = friend request awaiting response; accepted = friends.';

-- ----------------------------------------------------------------------------
-- 2. blocks
-- ----------------------------------------------------------------------------
create table public.blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),

  primary key (user_id, blocked_user_id),
  constraint blocks_no_self check (user_id <> blocked_user_id)
);

comment on table public.blocks is 'users I have blocked. Blocking is one-way.';

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;

-- Reads: only the two participants may read a row.
create policy "friendships_select_participant"
  on public.friendships
  for select
  using (auth.uid () = user_id or auth.uid () = friend_id);

create policy "blocks_select_participant"
  on public.blocks
  for select
  using (auth.uid () = user_id or auth.uid () = blocked_user_id);

-- No INSERT / UPDATE / DELETE policies on either table: direct table writes
-- are impossible for every client. Use the RPC functions (section 5).

-- ----------------------------------------------------------------------------
-- 4. updated_at
-- ----------------------------------------------------------------------------
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at ();

-- ----------------------------------------------------------------------------
-- 5. RPC mutation/status functions
-- ----------------------------------------------------------------------------

-- Current relationship between auth.uid() and p_other, from my perspective:
--   none | friends | request_sent | request_received | i_blocked | they_blocked_me
create or replace function public.friend_status (p_other uuid)
  returns text
  language sql
  stable
  set search_path = public
as $$
  select case
    when exists (
      select 1 from public.blocks
      where user_id = auth.uid () and blocked_user_id = p_other
    ) then 'i_blocked'
    when exists (
      select 1 from public.blocks
      where user_id = p_other and blocked_user_id = auth.uid ()
    ) then 'they_blocked_me'
    when exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id = auth.uid () and friend_id = p_other)
          or (user_id = p_other and friend_id = auth.uid ()))
    ) then 'friends'
    when exists (
      select 1 from public.friendships
      where user_id = auth.uid () and friend_id = p_other and status = 'pending'
    ) then 'request_sent'
    when exists (
      select 1 from public.friendships
      where user_id = p_other and friend_id = auth.uid () and status = 'pending'
    ) then 'request_received'
    else 'none'
  end;
$$;

create or replace function public.request_friend (p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid () = p_target then
    raise exception 'You cannot send a friend request to yourself';
  end if;

  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'This user does not exist';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = p_target)
       or (user_id = p_target and blocked_user_id = auth.uid ())
  ) then
    raise exception 'Unable to send a friend request';
  end if;

  if exists (
    select 1 from public.friendships
    where (user_id = auth.uid () and friend_id = p_target)
       or (user_id = p_target and friend_id = auth.uid ())
  ) then
    raise exception 'A friend request is already pending or you are already friends';
  end if;

  insert into public.friendships (user_id, friend_id, status)
  values (auth.uid (), p_target, 'pending');
end;
$$;

create or replace function public.respond_friend_request (p_sender uuid, p_accept boolean)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_accept then
    update public.friendships
       set status = 'accepted'
     where user_id = p_sender and friend_id = auth.uid () and status = 'pending';
  else
    delete from public.friendships
     where user_id = p_sender and friend_id = auth.uid () and status = 'pending';
  end if;

  if not found then
    raise exception 'No pending friend request from this user';
  end if;
end;
$$;

create or replace function public.cancel_friend_request (p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.friendships
   where user_id = auth.uid () and friend_id = p_target and status = 'pending';

  if not found then
    raise exception 'No pending friend request to cancel';
  end if;
end;
$$;

create or replace function public.remove_friend (p_other uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.friendships
   where status = 'accepted'
     and ((user_id = auth.uid () and friend_id = p_other)
       or (user_id = p_other and friend_id = auth.uid ()));

  if not found then
    raise exception 'You are not friends with this user';
  end if;
end;
$$;

create or replace function public.block_user (p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid () = p_target then
    raise exception 'You cannot block yourself';
  end if;

  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'This user does not exist';
  end if;

  -- Clear any friendship in either direction, then block.
  delete from public.friendships
   where (user_id = auth.uid () and friend_id = p_target)
      or (user_id = p_target and friend_id = auth.uid ());

  insert into public.blocks (user_id, blocked_user_id)
  values (auth.uid (), p_target)
  on conflict (user_id, blocked_user_id) do nothing;
end;
$$;

create or replace function public.unblock_user (p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.blocks
   where user_id = auth.uid () and blocked_user_id = p_target;

  if not found then
    raise exception 'This user is not blocked';
  end if;
end;
$$;
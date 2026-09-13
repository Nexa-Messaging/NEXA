-- ============================================================================
-- NEXA — Bonds
-- Friendship bond system with XP, levels, milestones
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bond_activities (action types that grant XP)
-- ----------------------------------------------------------------------------
create table public.bond_activities (
  id text primary key,
  name text not null,
  description text not null,
  base_xp int not null check (base_xp > 0),
  cooldown_seconds int not null default 60,
  daily_cap int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.bond_activities (id, name, description, base_xp, cooldown_seconds, daily_cap) values
  ('message_sent', 'Message sent', 'Send a message to your friend', 2, 30, 100),
  ('message_replied', 'Message replied', 'Reply to your friend''s message within 5 minutes', 3, 10, 50),
  ('voice_note_sent', 'Voice note sent', 'Send a voice note', 5, 60, 20),
  ('photo_shared', 'Photo shared', 'Share a photo', 5, 60, 20),
  ('video_shared', 'Video shared', 'Share a video', 8, 120, 10),
  ('story_reply', 'Story reply', 'Reply to your friend''s story', 4, 30, 30),
  ('game_played', 'Game played together', 'Play a game together', 15, 300, 5),
  ('challenge_completed', 'Challenge completed', 'Complete a challenge together', 20, 600, 3),
  ('moment_shared', 'Moment shared', 'Share a moment/location', 6, 180, 15)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  base_xp = excluded.base_xp,
  cooldown_seconds = excluded.cooldown_seconds,
  daily_cap = excluded.daily_cap;

-- ----------------------------------------------------------------------------
-- 2. bonds (per-friendship bond state)
-- ----------------------------------------------------------------------------
create table public.bonds (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  xp bigint not null default 0,
  level int not null default 1,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, friend_id),
  constraint bonds_different_users check (user_id <> friend_id)
);

create index bonds_user_id_idx on public.bonds (user_id);
create index bonds_friend_id_idx on public.bonds (friend_id);
create index bonds_level_idx on public.bonds (level desc);

-- ----------------------------------------------------------------------------
-- 3. bond_xp_log (audit trail for XP grants)
-- ----------------------------------------------------------------------------
create table public.bond_xp_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null references public.bond_activities (id),
  xp_awarded int not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index bond_xp_log_user_friend_idx on public.bond_xp_log (user_id, friend_id, created_at desc);
create index bond_xp_log_activity_idx on public.bond_xp_log (activity_id);

-- ----------------------------------------------------------------------------
-- 4. bond_milestones (unlockable rewards per level)
-- ----------------------------------------------------------------------------
create table public.bond_milestones (
  level int primary key,
  name text not null,
  description text not null,
  reward_type text not null, -- 'reaction' | 'chat_theme' | 'visual_effect' | 'badge'
  reward_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

insert into public.bond_milestones (level, name, description, reward_type, reward_data) values
  (5, 'Inside Joke', 'Unlock a special reaction', 'reaction', '{"emoji": "🤝", "label": "Bond"}'::jsonb),
  (10, 'Vibe Sync', 'Unlock a custom chat theme', 'chat_theme', '{"theme_id": "bond_10"}'::jsonb),
  (15, 'Kindred Spirits', 'Unlock a special badge', 'badge', '{"badge_id": "kindred"}'::jsonb),
  (20, 'Soulmates', 'Unlock a special visual effect', 'visual_effect', '{"effect_id": "soulmates"}'::jsonb),
  (30, 'Legendary Bond', 'Unlock an exclusive animated theme', 'chat_theme', '{"theme_id": "bond_30"}'::jsonb),
  (50, 'Unbreakable', 'Maximum bond level reached', 'badge', '{"badge_id": "unbreakable"}'::jsonb)
on conflict (level) do update set
  name = excluded.name,
  description = excluded.description,
  reward_type = excluded.reward_type,
  reward_data = excluded.reward_data;

-- ----------------------------------------------------------------------------
-- 5. bond_rewards_claimed (track which milestones user has claimed)
-- ----------------------------------------------------------------------------
create table public.bond_rewards_claimed (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  level int not null references public.bond_milestones (level),
  claimed_at timestamptz not null default now(),

  primary key (user_id, friend_id, level)
);

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.bond_activities enable row level security;
alter table public.bonds enable row level security;
alter table public.bond_xp_log enable row level security;
alter table public.bond_milestones enable row level security;
alter table public.bond_rewards_claimed enable row level security;

-- bond_activities: public read
create policy "bond_activities_select_public"
  on public.bond_activities for select using (is_active = true);

-- bonds: users can see bonds they're part of
create policy "bonds_select_own"
  on public.bonds for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "bonds_insert_own"
  on public.bonds for insert
  with check (auth.uid() = user_id);

-- bond_xp_log: users can see their own XP logs
create policy "bond_xp_log_select_own"
  on public.bond_xp_log for select
  using (auth.uid() = user_id);

-- bond_milestones: public read
create policy "bond_milestones_select_public"
  on public.bond_milestones for select using (true);

-- bond_rewards_claimed: users can see their own claims
create policy "bond_rewards_claimed_select_own"
  on public.bond_rewards_claimed for select
  using (auth.uid() = user_id);

create policy "bond_rewards_claimed_insert_own"
  on public.bond_rewards_claimed for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7. Helper: get bond for a friendship (creates if not exists)
-- ----------------------------------------------------------------------------
create or replace function public.get_or_create_bond (p_friend_id uuid)
returns public.bonds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_bond public.bonds%rowtype;
begin
  -- Ensure consistent ordering (lower UUID first) so the bond is shared
  if v_user_id > p_friend_id then
    v_user_id := p_friend_id;
    p_friend_id := auth.uid();
  end if;

  insert into public.bonds (user_id, friend_id)
  values (v_user_id, p_friend_id)
  on conflict (user_id, friend_id) do nothing
  returning * into v_bond;

  if not found then
    select * into v_bond from public.bonds
    where user_id = v_user_id and friend_id = p_friend_id;
  end if;

  return v_bond;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Core: award bond XP (server-side, anti-spam)
-- ----------------------------------------------------------------------------
create or replace function public.award_bond_xp (
  p_friend_id uuid,
  p_activity_id text,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  xp_awarded int,
  new_xp bigint,
  new_level int,
  leveled_up boolean,
  new_milestones int[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_activity public.bond_activities%rowtype;
  v_bond public.bonds%rowtype;
  v_xp_awarded int := 0;
  v_new_xp bigint;
  v_new_level int;
  v_old_level int;
  v_leveled_up boolean := false;
  v_new_milestones int[] := '{}';
  v_recent_count int;
  v_daily_count int;
  v_now timestamptz := now();
begin
  -- Validate friendship exists and is accepted
  if not exists (
    select 1 from public.friendships
    where user_id = v_user_id and friend_id = p_friend_id and status = 'accepted'
  ) then
    if not exists (
      select 1 from public.friendships
      where user_id = p_friend_id and friend_id = v_user_id and status = 'accepted'
    ) then
      raise exception 'Not friends';
    end if;
  end if;

  -- Get activity config
  select * into v_activity
  from public.bond_activities
  where id = p_activity_id and is_active = true;

  if not found then
    raise exception 'Invalid activity';
  end if;

  -- Get or create bond (consistent ordering)
  if v_user_id > p_friend_id then
    select * into v_bond from public.get_or_create_bond(p_friend_id);
  else
    select * into v_bond from public.get_or_create_bond(p_friend_id);
  end if;

  -- Anti-spam: cooldown check
  if v_bond.last_activity_at is not null then
    if v_now - v_bond.last_activity_at < make_interval(secs => v_activity.cooldown_seconds) then
      return query select 0, v_bond.xp, v_bond.level, false, '{}'::int[];
      return;
    end if;
  end if;

  -- Anti-spam: daily cap check
  if v_activity.daily_cap is not null then
    select count(*) into v_daily_count
    from public.bond_xp_log
    where user_id = v_user_id
      and friend_id = p_friend_id
      and activity_id = p_activity_id
      and created_at >= v_now - interval '1 day';

    if v_daily_count >= v_activity.daily_cap then
      return query select 0, v_bond.xp, v_bond.level, false, '{}'::int[];
      return;
    end if;
  end if;

  -- Calculate XP (base only for now; could add streaks, multipliers later)
  v_xp_awarded := v_activity.base_xp;
  v_old_level := v_bond.level;
  v_new_xp := v_bond.xp + v_xp_awarded;

  -- Level formula: level = floor(sqrt(xp / 100)) + 1
  v_new_level := floor(sqrt(v_new_xp / 100.0))::int + 1;

  if v_new_level > v_old_level then
    v_leveled_up := true;

    -- Find newly unlocked milestones
    select array_agg(level) into v_new_milestones
    from public.bond_milestones
    where level > v_old_level and level <= v_new_level;
  end if;

  -- Update bond
  update public.bonds
  set xp = v_new_xp,
      level = v_new_level,
      last_activity_at = v_now,
      updated_at = v_now
  where user_id = v_bond.user_id and friend_id = v_bond.friend_id;

  -- Log the XP grant
  insert into public.bond_xp_log (user_id, friend_id, activity_id, xp_awarded, meta)
  values (v_user_id, p_friend_id, p_activity_id, v_xp_awarded, p_meta);

  return query select v_xp_awarded, v_new_xp, v_new_level, v_leveled_up, v_new_milestones;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Get bond info for a friendship
-- ----------------------------------------------------------------------------
create or replace function public.get_bond (p_friend_id uuid)
returns table (
  xp bigint,
  level int,
  last_activity_at timestamptz,
  next_level_xp bigint,
  progress_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_bond public.bonds%rowtype;
  v_current_level_xp bigint;
  v_next_level_xp bigint;
begin
  select * into v_bond
  from public.bonds
  where (user_id = v_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_user_id);

  if not found then
    return query select 0, 1, null, 100, 0;
    return;
  end if;

  v_current_level_xp := (v_bond.level - 1) * (v_bond.level - 1) * 100;
  v_next_level_xp := v_bond.level * v_bond.level * 100;

  return query select
    v_bond.xp,
    v_bond.level,
    v_bond.last_activity_at,
    v_next_level_xp,
    case when v_next_level_xp > v_current_level_xp
      then round(100.0 * (v_bond.xp - v_current_level_xp) / (v_next_level_xp - v_current_level_xp), 1)
      else 100
    end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Get bond leaderboard for user (top bonds by level)
-- ----------------------------------------------------------------------------
create or replace function public.get_bond_leaderboard (p_limit int default 10)
returns table (
  friend_id uuid,
  friend_display_name text,
  friend_username text,
  friend_avatar_url text,
  xp bigint,
  level int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select b.friend_id, p.display_name, p.username, p.avatar_url, b.xp, b.level
  from public.bonds b
  join public.profiles p on p.id = b.friend_id
  where b.user_id = auth.uid()
  order by b.level desc, b.xp desc
  limit p_limit;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Claim milestone reward
-- ----------------------------------------------------------------------------
create or replace function public.claim_bond_reward (p_friend_id uuid, p_level int)
returns public.bond_rewards_claimed
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_bond public.bonds%rowtype;
  v_claim public.bond_rewards_claimed;
begin
  -- Verify bond exists and user has reached this level
  select * into v_bond
  from public.bonds
  where (user_id = v_user_id and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_user_id);

  if not found or v_bond.level < p_level then
    raise exception 'Milestone not yet reached';
  end if;

  -- Check milestone exists
  if not exists (select 1 from public.bond_milestones where level = p_level) then
    raise exception 'Invalid milestone';
  end if;

  -- Insert claim (idempotent)
  insert into public.bond_rewards_claimed (user_id, friend_id, level)
  values (v_user_id, p_friend_id, p_level)
  on conflict (user_id, friend_id, level) do nothing
  returning * into v_claim;

  return v_claim;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. Get claimed rewards for a bond
-- ----------------------------------------------------------------------------
create or replace function public.get_claimed_bond_rewards (p_friend_id uuid)
returns setof public.bond_rewards_claimed
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select * from public.bond_rewards_claimed
  where (user_id = auth.uid() and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. Updated_at trigger for bonds
-- ----------------------------------------------------------------------------
create trigger bonds_set_updated_at
  before update on public.bonds
  for each row execute function public.set_updated_at();
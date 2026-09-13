-- ============================================================================
-- NEXA — Moods
-- Temporary user moods with expiration, displayed near avatar/profile
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. moods table
-- ----------------------------------------------------------------------------
create table public.moods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  label text not null,
  is_custom boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Index for efficient "active mood for user" queries
create index moods_user_id_expires_at_idx
  on public.moods (user_id, expires_at desc);

-- ----------------------------------------------------------------------------
-- 2. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.moods enable row level security;

-- Public select so moods are visible on profiles/chat lists
create policy "moods_select_public"
  on public.moods
  for select
  using (expires_at > now());

-- Users can insert their own mood
create policy "moods_insert_own"
  on public.moods
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own mood
create policy "moods_update_own"
  on public.moods
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own mood
create policy "moods_delete_own"
  on public.moods
  for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. Helper function: upsert_mood
-- Replaces any existing active mood for the user with a new one
-- ----------------------------------------------------------------------------
create or replace function public.upsert_mood (
  p_emoji text,
  p_label text,
  p_expires_at timestamptz,
  p_is_custom boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_mood_id uuid;
begin
  -- Delete any existing active mood for this user
  delete from public.moods
  where user_id = v_user_id
    and expires_at > now();

  -- Insert the new mood
  insert into public.moods (user_id, emoji, label, is_custom, expires_at)
  values (v_user_id, p_emoji, p_label, p_is_custom, p_expires_at)
  returning id into v_mood_id;

  return v_mood_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Helper function: clear_mood
-- Removes the user's current active mood
-- ----------------------------------------------------------------------------
create or replace function public.clear_mood ()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.moods
  where user_id = auth.uid()
    and expires_at > now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Helper function: get_mood
-- Returns the active mood for a user (if any, and not expired)
-- ----------------------------------------------------------------------------
create or replace function public.get_mood (p_user_id uuid)
returns table (
  id uuid,
  emoji text,
  label text,
  is_custom boolean,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select m.id, m.emoji, m.label, m.is_custom, m.expires_at, m.created_at
  from public.moods m
  where m.user_id = p_user_id
    and m.expires_at > now()
  order by m.created_at desc
  limit 1;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Preset moods (for reference / client-side defaults)
-- ----------------------------------------------------------------------------
comment on table public.moods is 'Temporary user moods with expiration. One active mood per user.';

-- Preset moods that the client can use:
-- 😂 Funny
-- 🔥 Good vibes
-- 🎮 Gaming
-- 🎵 Music
-- 🧠 Locked in
-- 💤 Sleep mode
-- 🥳 Celebrating
-- 😭 Struggling
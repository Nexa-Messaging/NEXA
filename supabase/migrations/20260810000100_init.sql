-- ============================================================================
-- NEXA — initial schema
-- profiles + avatar storage + Row Level Security
-- Run this in the Supabase SQL Editor (or via `supabase db push`) once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  username text not null,
  avatar_url text,
  bio text,
  school text,
  department text,
  level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 50),
  constraint profiles_email_length check (char_length(email) between 3 and 320),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500),
  constraint profiles_school_length check (school is null or char_length(school) <= 120),
  constraint profiles_department_length check (department is null or char_length(department) <= 120),
  constraint profiles_level_length check (level is null or char_length(level) <= 20)
);

create unique index profiles_username_key on public.profiles (username);

comment on table public.profiles is 'User profiles. One row per auth user.';
comment on column public.profiles.username is 'Lowercase 3-20 letter/digit/underscore handle, globally unique.';
comment on column public.profiles.level is 'Student level, e.g. "300 Level" or "Masters".';

-- ----------------------------------------------------------------------------
-- 2. Row Level Security on profiles
--
-- Select is public so profile pages are viewable across the app.
-- Insert/update/delete are restricted to the row owner (auth.uid() = id),
-- which is what stops users from modifying each other's profiles.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_public"
  on public.profiles
  for select
  using (true);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid () = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid () = id)
  with check (auth.uid () = id);

create policy "profiles_delete_own"
  on public.profiles
  for delete
  using (auth.uid () = id);

-- ----------------------------------------------------------------------------
-- 3. updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at ()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now ();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at ();

-- ----------------------------------------------------------------------------
-- 4. Auto-create a user's profile when they sign up.
-- Reads display_name/username from the sign-up metadata so it works even
-- before email confirmation is finished (no client round-trip / no race).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, username)
  values (
    new.id,
    coalesce (new.email, ''),
    coalesce (new.raw_user_meta_data ->> 'display_name', 'New member'),
    lower (coalesce (new.raw_user_meta_data ->> 'username', ''))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user ();

-- ----------------------------------------------------------------------------
-- 5. Avatar storage bucket
--
-- Public bucket so avatars can be rendered by anyone. Files are stored under
-- "<user_id>/<filename>" and every storage policy is scoped to the owner's
-- folder via storage.foldername(name)[1].
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_select_public"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid ()::text = (storage.foldername (name)) [1]
  );

create policy "avatars_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.uid ()::text = (storage.foldername (name)) [1]
  );

create policy "avatars_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.uid ()::text = (storage.foldername (name)) [1]
  );
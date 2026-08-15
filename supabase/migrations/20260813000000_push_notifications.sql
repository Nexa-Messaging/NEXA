-- ============================================================================
-- Phase 18: Push notifications (device token registry)
-- ----------------------------------------------------------------------------
-- Stores each participant's Expo push token so a delivery worker can fan out
-- pushes. Rows are only ever written by the security-definer RPCs below; the
-- client never touches the table directly, and the push worker reads with the
-- service role key. The in-app `notifications` table remains the source of
-- truth for content — a worker just mirrors `notify_user` rows as pushes.
-- ============================================================================

create table public.device_tokens (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null,
  invalidated_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint device_tokens_user_token_key unique (user_id, token)
);

comment on column public.device_tokens.platform is
  'Emitter platform: ios or android. Expo push tokens are emitter-agnostic but the field helps diagnostics.';

create index device_tokens_user_idx on public.device_tokens (user_id);
create index device_tokens_active_token_idx
  on public.device_tokens (token desc)
  where invalidated_at is null;

-- No client policies on purpose. The RPCs below are the only writers; a
-- delivery worker uses the service role, which bypasses RLS.
alter table public.device_tokens enable row level security;

-- ----------------------------------------------------------------------------
-- Registration
-- ----------------------------------------------------------------------------

-- Upserts the caller's device token. A token previously marked invalid is
-- re-activated on re-registration.
create or replace function public.register_device_token (
  p_token text,
  p_platform text default 'ios'
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;
  if p_token is null or btrim (p_token) = '' then
    raise exception 'Push token is required';
  end if;
  -- Expo service tokens are of the form ExponentPushToken[...] or
  -- ExpoPushToken[...]. Anything else is almost certainly not an Expo token.
  if p_token !~ '^(ExponentPushToken|ExpoPushToken)\[' then
    raise exception 'Invalid push token';
  end if;

  insert into public.device_tokens (user_id, token, platform, invalidated_at)
  values (
    auth.uid (),
    p_token,
    case when p_platform in ('ios', 'android') then p_platform else 'ios' end,
    null
  )
  on conflict (user_id, token)
  do update
    set invalidated_at = null,
        platform = excluded.platform,
        updated_at = now ();
end;
$$;

-- Removes the caller's token for this device (sign-out). Idempotent.
create or replace function public.unregister_device_token (p_token text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_token is null or btrim (p_token) = '' then
    return;
  end if;
  delete from public.device_tokens
  where user_id = auth.uid () and token = p_token;
end;
$$;

-- Backend storage used by the RPCs is a simple table, so nothing further is
-- needed here. Grant only the RPCs execute; users keep no direct SQL access.
revoke all on table public.device_tokens from anon, authenticated;
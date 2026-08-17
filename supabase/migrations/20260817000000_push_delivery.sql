-- ============================================================================
-- Phase 19: Push delivery worker wiring
-- ----------------------------------------------------------------------------
-- Bridge between the existing in-app `notifications` rows (written by
-- notify_user()) and the Expo Push delivery worker Edge Function
-- (supabase/functions/send-push).
--
--   1. `push_delivered_at` on notifications makes delivery idempotent and
--      duplicate-free (the worker no-ops once it is set).
--   2. `push_config` holds the internal webhook secret the trigger must pass
--      to the Edge Function. The mobile app never sees it.
--   3. An AFTER INSERT trigger fires net.http_post (pg_net) to
--      `<supabase-url>/functions/v1/send-push` with the notification id, so
--      pushes are enqueued the instant a notification row exists — including
--      a fired-and-forgotten request that never blocks message inserts.
--
-- Deploy order: apply this migration, then `supabase functions deploy
-- send-push`. The function URL is derived from the request JWT so no manual
-- URL configuration is required.
-- ============================================================================

-- Idempotency / audit column for push delivery.
alter table public.notifications
  add column if not exists push_delivered_at timestamptz;

-- Index used by the worker's catch-up sweep (push_delivered_at is null).
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at)
  where push_delivered_at is null;

-- ----------------------------------------------------------------------------
-- Internal webhook secret (server-side only)
-- ----------------------------------------------------------------------------
create table if not exists public.push_config (
  key text primary key,
  value text not null
);

-- Seeded with the shared value the DB trigger sends to the Edge Function.
-- The worker compares it with its own lookup; a mismatch is rejected.
insert into public.push_config (key, value)
values ('push_webhook_secret', gen_random_uuid ()::text)
on conflict (key) do nothing;

-- Never exposed to clients; only the service role (worker) and SECURITY
-- DEFINER functions (trigger) can see it.
alter table public.push_config enable row level security;
revoke all on table public.push_config from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Webhook: notifications.insert -> send-push
-- ----------------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.enqueue_push_delivery ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_function_url text;
  v_secret text;
  v_iss text;
begin
  -- Derive the Edge Function URL from the request JWT issuer so this works
  -- on any Supabase project with zero configuration. Fall back to a stored
  -- value when no JWT context is present (e.g. server-side jobs).
  v_iss := nullif (current_setting ('request.jwt.claims', true), '');
  if v_iss is not null then
    v_function_url := regexp_replace (
      v_iss::jsonb ->> 'iss',
      '/auth/v1$',
      '/functions/v1/send-push'
    );
  else
    select value into v_function_url
    from public.push_config
    where key = 'push_function_url';
  end if;

  select value into v_secret
  from public.push_config
  where key = 'push_webhook_secret';

  if v_function_url is null or v_secret is null then
    return NEW;
  end if;

  -- Fire-and-forget. pg_net handles the HTTP request in the background, so a
  -- slow/missing Edge Function can never block message or notification writes.
  perform net.http_post (
    url     := v_function_url,
    body    := jsonb_build_object ('notification_id', NEW.id),
    headers := jsonb_build_object (
      'Content-Type'      , 'application/json',
      'x-nexa-push-secret', v_secret
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_enqueue_push_delivery on public.notifications;

create trigger trg_enqueue_push_delivery
  after insert on public.notifications
  for each row execute function public.enqueue_push_delivery ();
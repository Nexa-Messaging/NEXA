-- ============================================================================
-- Push delivery: send the `apikey` header the Edge Functions gateway requires.
--
-- Why
--   The Supabase Edge Functions gateway now rejects any request without an
--   `apikey` header, even with JWT verification disabled on the function:
--
--     code: MISSING_CREDENTIALS
--     acceptedAuthModes: ["publishable", "secret"]
--
--   `enqueue_push_delivery` only sent Content-Type and x-nexa-push-secret, so
--   every notification insert produced a 401 and no push was ever delivered.
--
-- How the key is sourced
--   1. Reuse the publishable key the client already sent on this request.
--      PostgREST exposes the inbound headers as the `request.headers` GUC, so
--      a message insert carries the same `apikey` the app authenticated with.
--   2. Fall back to `push_config.push_publishable_key` for contexts with no
--      inbound request (pg_cron, service-role jobs).
--
--   The publishable key is public by design: it ships inside the mobile app
--   bundle as EXPO_PUBLIC_SUPABASE_ANON_KEY. Storing it here leaks nothing.
--   `push_config` stays locked to anon/authenticated, and the service-role
--   key is never stored or sent from the database.
-- ============================================================================

-- Fallback for non-request contexts (pg_cron and similar). Idempotent, and an
-- `on conflict do update` lets a rotated key be corrected with one re-run.
insert into public.push_config (key, value)
values ('push_publishable_key', 'sb_publishable_TxRL35AD0f0Gj9L1SxCNNQ_STU0Zlkt')
on conflict (key) do update set value = excluded.value;

-- The trigger derives the function URL from the request JWT issuer, which only
-- exists when the insert came through PostgREST. Without it the trigger falls
-- back to this key and silently skips the HTTP call when it is missing — so
-- notifications created by pg_cron, the admin dashboard or service-role jobs
-- would never push. Seed it so every path works.
insert into public.push_config (key, value)
values (
  'push_function_url',
  'https://jnbfsgmpshorrogdqevx.supabase.co/functions/v1/send-push'
)
on conflict (key) do update set value = excluded.value;

create or replace function public.enqueue_push_delivery ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_function_url text;
  v_secret text;
  v_apikey text;
  v_iss text;
  v_headers jsonb;
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

  -- Prefer the key carried by the caller's own request, so a rotated
  -- publishable key is picked up without touching this configuration.
  begin
    v_headers := nullif (current_setting ('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_headers is not null then
    v_apikey := nullif (v_headers ->> 'apikey', '');
  end if;

  if v_apikey is null then
    select value into v_apikey
    from public.push_config
    where key = 'push_publishable_key';
  end if;

  select value into v_secret
  from public.push_config
  where key = 'push_webhook_secret';

  if v_function_url is null or v_secret is null or v_apikey is null then
    return NEW;
  end if;

  -- Fire-and-forget. pg_net handles the HTTP request in the background, so a
  -- slow/missing Edge Function can never block message or notification writes.
  perform net.http_post (
    url     := v_function_url,
    body    := jsonb_build_object ('notification_id', NEW.id),
    headers := jsonb_build_object (
      'Content-Type'      , 'application/json',
      'apikey'            , v_apikey,
      'x-nexa-push-secret', v_secret
    )
  );

  return NEW;
end;
$$;

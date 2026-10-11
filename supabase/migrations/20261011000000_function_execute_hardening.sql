-- ============================================================================
-- Security hardening: lock down function EXECUTE privileges.
--
-- Problem
--   No migration ever issued REVOKE EXECUTE on functions, and no
--   ALTER DEFAULT PRIVILEGES was set. PostgreSQL therefore grants EXECUTE to
--   PUBLIC on every function, which means the unauthenticated `anon` role can
--   invoke every SECURITY DEFINER function in `public`.
--
--   Most of those functions self-guard with `auth.uid()`, but several do not:
--     * purge_expired_stories(days)  - caller controls the window; a negative
--       value turns `now() - (-N days)` into the future, deleting every story
--       and its storage object.
--     * notify_user(...)             - inserts an arbitrary notification for
--       any user with a spoofable actor_id / type (phishing vector).
--     * process_due_event_reminders  - lets anyone force notification inserts.
--     * get_mood(user_id)            - readable by unauthenticated callers.
--       (moods are intentionally public via the moods_select_public policy, so
--       this is not an RLS bypass - only the missing auth gate is the issue.)
--
-- Fix
--   1. Revoke EXECUTE from PUBLIC and anon on every function in `public`.
--   2. Re-grant to `authenticated` and `service_role` so existing app and
--      Edge Function behaviour is unchanged.
--   3. Take the two cron/maintenance functions away from `authenticated` and
--      hand them to `service_role` only.
--   4. Require a signed-in caller for `get_mood`.
--
-- Trigger functions (notify_*, handle_new_user, enqueue_push_delivery) are
-- unaffected: PostgreSQL checks EXECUTE at CREATE TRIGGER time and invokes the
-- function as its owner at fire time, so revoking from PUBLIC/anon cannot break
-- a firing trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 + 2. Revoke the implicit PUBLIC grant, re-grant to authenticated and
--        service_role (Edge Functions / pg_cron run as service_role, which is
--        not superuser and therefore needs an explicit EXECUTE).
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select format(
             'revoke execute on function %I.%I(%s) from public, anon',
             n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
           ) as revoke_sql,
           format(
             'grant execute on function %I.%I(%s) to authenticated, service_role',
             n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
           ) as grant_sql
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
    order by 1
  loop
    execute fn.revoke_sql;
    execute fn.grant_sql;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Cron / maintenance functions: service_role only.
--    These are driven by pg_cron / an Edge Function, never by the app.
-- ---------------------------------------------------------------------------
revoke execute on function public.purge_expired_stories(int) from authenticated;
revoke execute on function public.process_due_event_reminders(int) from authenticated;

grant execute on function public.purge_expired_stories(int) to service_role;
grant execute on function public.process_due_event_reminders(int) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Guard get_mood. It is SECURITY DEFINER and takes an arbitrary user_id,
--    so it needs an explicit auth gate. Moods themselves are intentionally
--    readable by other users (moods_select_public), so we do NOT restrict it
--    to self - we only require a signed-in caller, matching the RLS intent.
--    (moods.ts reads the table directly via RLS, so this RPC is currently
--    unused by the app - hardening it is free.)
-- ---------------------------------------------------------------------------
create or replace function public.get_mood (p_user_id uuid)
returns table (
  id uuid,
  emoji text,
  label text,
  is_custom boolean,
  expires_at timestamptz,
  created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select m.id, m.emoji, m.label, m.is_custom, m.expires_at, m.created_at
  from public.moods m
  where m.user_id = p_user_id
    and m.expires_at > now ()
  order by m.created_at desc
  limit 1;
end;
$$;

-- Keep the grant set consistent after the CREATE OR REPLACE above.
revoke execute on function public.get_mood(uuid) from public, anon;
grant  execute on function public.get_mood(uuid) to authenticated, service_role;

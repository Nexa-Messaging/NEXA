-- ============================================================================
-- Drop the pre-idempotency send_message / send_media_message overloads.
--
-- Phase 15's idempotency migration created *new* overloads with an extra
-- `p_client_id` argument (created via `create or replace`, which does not
-- remove the old signatures). With both overloads present, Postgres cannot
-- choose a candidate when `p_client_id` is passed as NULL, producing:
--   "Could not choose the best candidate function between ..."
--
-- Run this AFTER 20260812030000_phase15_stabilization.sql. It removes only the
-- legacy overloads; the p_client_id-aware versions (created by phase 15) remain
-- the single candidates. Safe to re-run.
-- ============================================================================

drop function if exists public.send_message (uuid, text, uuid);
drop function if exists public.send_media_message (uuid, text, text, text, text, uuid, int, int, numeric, bigint);
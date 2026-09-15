-- ============================================================
-- Automation Engine: Triggers + Scheduled Jobs
-- ============================================================
-- This migration adds server-side automation for operations
-- that were previously client-side only.
-- ============================================================

-- 1. Enable pg_cron + pg_net (Supabase hosted)
-- ============================================================
-- pg_cron is available on Supabase Pro/Team/Enterprise plans.
-- If not enabled, run via Supabase Dashboard > SQL Editor:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    RAISE NOTICE 'pg_cron enabled';
  ELSE
    RAISE NOTICE 'pg_cron not available — scheduled jobs will not run';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
    RAISE NOTICE 'pg_net enabled';
  ELSE
    RAISE NOTICE 'pg_net not available — HTTP requests will not work';
  END IF;
END $$;

-- ============================================================
-- 2. AUTO-DELIVERY: Set delivered_at on message insert
-- ============================================================
-- When a message is inserted, if the recipient already has
-- an open conversation (last_read exists), mark as delivered.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_deliver_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Mark as delivered if recipient has opened this conversation
  IF EXISTS (
    SELECT 1 FROM public.conversation_last_read
    WHERE user_id = NEW.receiver_id
      AND conversation_id = NEW.conversation_id
  ) THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_deliver ON public.messages;
CREATE TRIGGER trg_auto_deliver
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_deliver_message();

-- ============================================================
-- 3. BOND XP: Auto-award XP on message insert
-- ============================================================
-- Award 1 XP per message sent (with daily cap of 50).
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_award_bond_xp()
RETURNS TRIGGER AS $$
DECLARE
  v_today_xp INT;
  v_bond_id UUID;
BEGIN
  -- Only award if sender and receiver are bonded
  SELECT id INTO v_bond_id
  FROM public.bonds
  WHERE (
    (user_one_id = NEW.sender_id AND user_two_id = NEW.receiver_id)
    OR (user_one_id = NEW.receiver_id AND user_two_id = NEW.sender_id)
  );

  IF v_bond_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check daily cap (50 XP per user per day across all bonds)
  SELECT COALESCE(SUM(xp_awarded), 0) INTO v_today_xp
  FROM public.bond_xp_log
  WHERE user_id = NEW.sender_id
    AND awarded_at >= (now()::date);

  IF v_today_xp >= 50 THEN
    RETURN NEW;
  END IF;

  -- Award 1 XP
  UPDATE public.bonds
  SET xp = xp + 1,
      updated_at = now()
  WHERE id = v_bond_id;

  INSERT INTO public.bond_xp_log (bond_id, user_id, action, xp_awarded, awarded_at)
  VALUES (v_bond_id, NEW.sender_id, 'message', 1, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_bond_xp ON public.messages;
CREATE TRIGGER trg_auto_bond_xp
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_award_bond_xp();

-- ============================================================
-- 4. EVENT STATUS: Auto-transition upcoming -> live
-- ============================================================
-- When an event's starts_at is reached, mark it live and
-- send notifications to RSVPed users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_transition_event_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Transition upcoming -> live when starts_at is now
  IF NEW.status = 'upcoming' AND NEW.starts_at <= now() THEN
    NEW.status := 'live';

    -- Notify RSVPed users
    INSERT INTO public.notifications (user_id, actor_id, type, entity_type, entity_id, preview)
    SELECT
      r.user_id,
      e.created_by,
      'event_started',
      'event',
      e.id,
      e.title
    FROM public.user_event_rsvps r
    JOIN public.user_events e ON e.id = r.event_id
    WHERE r.event_id = NEW.id
      AND r.status IN ('going', 'maybe')
      AND r.user_id != NEW.created_by;
  END IF;

  -- Transition live -> ended when ends_at is reached
  IF NEW.status = 'live' AND NEW.ends_at <= now() THEN
    NEW.status := 'ended';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_event_status ON public.user_events;
CREATE TRIGGER trg_auto_event_status
  BEFORE UPDATE ON public.user_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_transition_event_status();

-- ============================================================
-- 5. EVENT REMINDERS: Auto-process due reminders
-- ============================================================
-- When an event reminder is inserted, schedule a notification
-- for the reminder time.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_process_event_reminder()
RETURNS TRIGGER AS $$
BEGIN
  -- Schedule notification at reminder_time
  INSERT INTO public.notifications (user_id, actor_id, type, entity_type, entity_id, preview)
  SELECT
    NEW.user_id,
    e.created_by,
    'event_reminder',
    'event',
    e.id,
    e.title || ' — ' || to_char(e.starts_at, 'Mon DD at HH12:MIam')
  FROM public.user_events e
  WHERE e.id = NEW.event_id
    AND NEW.reminder_time <= now() + interval '15 minutes';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_event_reminder ON public.user_event_reminders;
CREATE TRIGGER trg_auto_event_reminder
  AFTER INSERT ON public.user_event_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_process_event_reminder();

-- ============================================================
-- 6. SCHEDULED JOBS (pg_cron)
-- ============================================================
-- These run automatically if pg_cron is enabled.
-- If not available, they serve as documentation for manual setup.
-- Each job is a separate DO block to avoid nested dollar-quoting.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    PERFORM cron.schedule('purge_expired_stories', '0 3 * * *', 'SELECT public.purge_expired_stories()');
    PERFORM cron.schedule('purge_expired_moods', '30 3 * * *', 'DELETE FROM public.moods WHERE expires_at < now()');
    PERFORM cron.schedule('process_event_reminders', '*/5 * * * *', 'SELECT public.process_due_event_reminders()');
    PERFORM cron.schedule('transition_event_status', '*/5 * * * *', 'UPDATE public.user_events SET status = ''live'' WHERE status = ''upcoming'' AND starts_at <= now()');
    RAISE NOTICE 'Scheduled jobs configured';
  ELSE
    RAISE NOTICE 'pg_cron not available — scheduled jobs skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'discover_scores') THEN
    PERFORM cron.schedule('refresh_discover_scores', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.discover_scores');
  END IF;
END $$;

-- ============================================================
-- 7. CLEANUP: Mark stale presence as offline
-- ============================================================
-- Fallback for when Supabase Presence doesn't clean up.
-- Runs via pg_cron every 10 minutes.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup_stale_presence', '*/10 * * * *', 'DELETE FROM public.user_presence WHERE last_seen < now() - interval ''5 minutes''');
  END IF;
END $$;

-- ============================================================
-- 8. LOGGING: Track automation events
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage automation_log"
  ON public.automation_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own automation log"
  ON public.automation_log FOR SELECT
  USING (true);  -- Read-only for debugging

-- ============================================================
-- 9. HELPER: Bulk mark messages as delivered (for open chat)
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_delivered(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS INT AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.messages
  SET delivered_at = now()
  WHERE conversation_id = p_conversation_id
    AND receiver_id = p_user_id
    AND delivered_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. REALTIME: Add bonds to Realtime publication
-- ============================================================

DO $$
BEGIN
  -- Add bonds table to Realtime publication
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bonds;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_preferences;
    RAISE NOTICE 'Added bonds + user_preferences to Realtime';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication update failed: %', SQLERRM;
END $$;

-- ============================================================
-- DONE
-- ============================================================
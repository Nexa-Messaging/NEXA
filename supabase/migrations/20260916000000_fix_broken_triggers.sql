-- ============================================================
-- Fix: Broken triggers, functions, and cron jobs
-- ============================================================
-- Fixes every runtime error found in the audit of
-- 20260915030000_automation_engine.sql and
-- 20260915040000_security_audit_fixes.sql
-- ============================================================

-- ============================================================
-- 1. CRITICAL: auto_deliver_message — is_online() doesn't exist
-- ============================================================
-- Replace with profiles.last_seen_at check (user online if seen
-- within 5 minutes).

DROP TRIGGER IF EXISTS trg_auto_deliver ON public.messages;
DROP FUNCTION IF EXISTS public.auto_deliver_message();

CREATE OR REPLACE FUNCTION public.auto_deliver_message()
RETURNS TRIGGER AS $$
DECLARE
  v_receiver uuid;
BEGIN
  SELECT CASE
    WHEN c.user_a_id = NEW.sender_id THEN c.user_b_id
    ELSE c.user_a_id
  END INTO v_receiver
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_receiver IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_receiver
         AND last_seen_at > now() - interval '5 minutes'
     ) THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_auto_deliver
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_deliver_message();

-- ============================================================
-- 2. CRITICAL: auto_award_bond_xp — activity_id 'message' invalid
-- ============================================================
-- Valid FK values: message_sent, message_replied, voice_note_sent,
-- photo_shared, video_shared, story_reply, game_played,
-- challenge_completed, moment_shared

DROP TRIGGER IF EXISTS trg_auto_bond_xp ON public.messages;
DROP FUNCTION IF EXISTS public.auto_award_bond_xp();

CREATE OR REPLACE FUNCTION public.auto_award_bond_xp()
RETURNS TRIGGER AS $$
DECLARE
  v_today_xp INT;
  v_receiver uuid;
BEGIN
  SELECT CASE
    WHEN c.user_a_id = NEW.sender_id THEN c.user_b_id
    ELSE c.user_a_id
  END INTO v_receiver
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_receiver IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bonds
    WHERE (user_id = NEW.sender_id AND friend_id = v_receiver)
       OR (user_id = v_receiver AND friend_id = NEW.sender_id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(xp_awarded), 0) INTO v_today_xp
  FROM public.bond_xp_log
  WHERE user_id = NEW.sender_id
    AND created_at >= (now()::date);

  IF v_today_xp >= 50 THEN
    RETURN NEW;
  END IF;

  UPDATE public.bonds
  SET xp = xp + 1,
      updated_at = now()
  WHERE (user_id = NEW.sender_id AND friend_id = v_receiver)
     OR (user_id = v_receiver AND friend_id = NEW.sender_id);

  INSERT INTO public.bond_xp_log (user_id, friend_id, activity_id, xp_awarded)
  VALUES (NEW.sender_id, v_receiver, 'message_sent', 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_auto_bond_xp
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_award_bond_xp();

-- ============================================================
-- 3. CRITICAL: auto_transition_event_status — user_events has no
--    status column and no community_id column
-- ============================================================
-- The trigger logic assumed columns that don't exist. Status was
-- always computed on the fly in queries. Drop this trigger entirely
-- — it crashes on every UPDATE of user_events.

DROP TRIGGER IF EXISTS trg_auto_event_status ON public.user_events;
DROP FUNCTION IF EXISTS public.auto_transition_event_status();

-- ============================================================
-- 4. CRITICAL: auto_process_event_reminder — e.community_id doesn't exist
-- ============================================================

DROP TRIGGER IF EXISTS trg_auto_event_reminder ON public.user_event_reminders;
DROP FUNCTION IF EXISTS public.auto_process_event_reminder();

CREATE OR REPLACE FUNCTION public.auto_process_event_reminder()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, data)
  SELECT
    NEW.user_id,
    e.created_by,
    'event_reminder',
    e.title,
    e.title || ' — ' || to_char(e.starts_at, 'Mon DD at HH12:MIam'),
    jsonb_build_object('event_id', e.id)
  FROM public.user_events e
  WHERE e.id = NEW.event_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_auto_event_reminder
  AFTER INSERT ON public.user_event_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_process_event_reminder();

-- ============================================================
-- 5. CRITICAL: process_due_event_reminders — e.community_id doesn't exist
--    + auth gate breaks cron jobs
-- ============================================================
-- Remove auth gate (cron has no JWT) and remove community_id ref.

DROP FUNCTION IF EXISTS public.process_due_event_reminders(int);

CREATE OR REPLACE FUNCTION public.process_due_event_reminders(p_window_minutes int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, data)
  SELECT
    re.user_id,
    e.created_by,
    'event_reminder',
    e.title,
    e.title || ' — ' || to_char(e.starts_at, 'Mon DD at HH12:MIam'),
    jsonb_build_object('event_id', e.id)
  FROM public.user_event_reminders re
  JOIN public.user_events e ON e.id = re.event_id
  WHERE e.starts_at BETWEEN now() AND now() + (p_window_minutes || ' minutes')::interval
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = re.user_id
        AND n.type = 'event_reminder'
        AND n.data->>'event_id' = e.id::text
        AND n.created_at > now() - interval '1 hour'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 6. CRITICAL: purge_expired_stories — auth gate breaks cron
-- ============================================================
-- Remove auth gate so pg_cron can call it. The function only
-- deletes already-expired stories, so it's safe.

DROP FUNCTION IF EXISTS public.purge_expired_stories(int);

CREATE OR REPLACE FUNCTION public.purge_expired_stories(p_older_than_days int DEFAULT 7)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_row   record;
BEGIN
  FOR v_row IN
    SELECT s.id, s.media_path
    FROM public.stories s
    WHERE s.expires_at < now() - (p_older_than_days || ' days')::interval
      AND s.is_deleted = false
  LOOP
    IF v_row.media_path IS NOT NULL AND v_row.media_path != '' THEN
      PERFORM set_config('storage.allow_delete_query', 'true', true);
      DELETE FROM storage.objects
      WHERE bucket_id = 'stories-media'
        AND name = v_row.media_path;
      PERFORM set_config('storage.allow_delete_query', 'false', true);
    END IF;

    DELETE FROM public.story_views WHERE story_id = v_row.id;
    DELETE FROM public.story_reactions WHERE story_id = v_row.id;
    DELETE FROM public.story_replies WHERE story_id = v_row.id;
    DELETE FROM public.stories WHERE id = v_row.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 7. HIGH: get_discover_feed — wrong column names
-- ============================================================
-- Fixed: c.avatar_url → c.avatar_path, removed c.cover_url,
-- dq.body → dq.text, da.body → da.answer,
-- removed da.is_anonymous, public.friends → public.friendships,
-- added count(*)::int casts for compute_discover_score

DROP FUNCTION IF EXISTS public.get_discover_feed(int, int);

CREATE OR REPLACE FUNCTION public.get_discover_feed(
  p_limit  int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  item_type   text,
  item_id     uuid,
  score       float,
  payload     jsonb
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH feed AS (
    SELECT
      'community'::text AS item_type,
      c.id AS item_id,
      public.compute_discover_score(c.created_at, COALESCE(mc2.cnt, 0)::int, 0, 0) AS score,
      jsonb_build_object(
        'name', c.name,
        'description', c.description,
        'avatar_path', c.avatar_path,
        'member_count', COALESCE(mc2.cnt, 0),
        'is_member', (mc.user_id IS NOT NULL)
      ) AS payload
    FROM public.communities c
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM public.community_members cm
      WHERE cm.community_id = c.id
    ) mc2 ON true
    LEFT JOIN public.community_members mc
      ON mc.community_id = c.id AND mc.user_id = v_uid
    WHERE c.created_by NOT IN (
      SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
    )

    UNION ALL

    SELECT
      'question'::text AS item_type,
      dq.id AS item_id,
      public.compute_discover_score(dq.created_at, COALESCE(qr.total_reactions, 0)::int, COALESCE(qr.total_answers, 0)::int, COALESCE(qr.total_answers, 0)::int) AS score,
      jsonb_build_object(
        'text', dq.text,
        'scheduled_date', dq.scheduled_date,
        'answer_count', COALESCE(qr.total_answers, 0),
        'has_answered', EXISTS (
          SELECT 1 FROM public.daily_answers da
          WHERE da.question_id = dq.id AND da.user_id = v_uid
        )
      ) AS payload
    FROM public.daily_questions dq
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT da.id)::int AS total_answers,
        count(DISTINCT dar.id)::int AS total_reactions
      FROM public.daily_answers da
      LEFT JOIN public.daily_answer_reactions dar ON dar.answer_id = da.id
      WHERE da.question_id = dq.id
    ) qr ON true
    WHERE dq.scheduled_date <= CURRENT_DATE

    UNION ALL

    SELECT
      'answer'::text AS item_type,
      da.id AS item_id,
      public.compute_discover_score(da.created_at, COALESCE(ar.cnt, 0)::int, 0, 0) AS score,
      jsonb_build_object(
        'answer', da.answer,
        'is_public', da.is_public,
        'reaction_count', COALESCE(ar.cnt, 0),
        'user', jsonb_build_object(
          'id', p.id,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        )
      ) AS payload
    FROM public.daily_answers da
    LEFT JOIN public.profiles p ON p.id = da.user_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt
      FROM public.daily_answer_reactions dar
      WHERE dar.answer_id = da.id
    ) ar ON true
    WHERE da.is_public = true
      AND da.user_id NOT IN (
        SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
      )

    UNION ALL

    SELECT
      'profile'::text AS item_type,
      pr.id AS item_id,
      public.compute_discover_score(pr.created_at, 0, 0, (SELECT count(*) FROM public.friendships f WHERE (f.user_id = pr.id AND f.status = 'accepted') OR (f.friend_id = pr.id AND f.status = 'accepted'))::int) AS score,
      jsonb_build_object(
        'id', pr.id,
        'display_name', pr.display_name,
        'avatar_url', pr.avatar_url,
        'bio', pr.bio,
        'school', pr.school,
        'is_friend', EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE (f.user_id = v_uid AND f.friend_id = pr.id AND f.status = 'accepted')
             OR (f.friend_id = v_uid AND f.user_id = pr.id AND f.status = 'accepted')
        )
      ) AS payload
    FROM public.profiles pr
    WHERE pr.id != v_uid
      AND pr.banned_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.user_id = v_uid AND b.blocked_user_id = pr.id)
           OR (b.blocked_user_id = v_uid AND b.user_id = pr.id)
      )
  )
  SELECT feed.item_type, feed.item_id, feed.score, feed.payload
  FROM feed
  ORDER BY feed.score DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================
-- 8. HIGH: search_all — wrong column names
-- ============================================================
-- Fixed: c.avatar_url → c.avatar_path, da.body → da.answer

DROP FUNCTION IF EXISTS public.search_all(text, text, int);

CREATE OR REPLACE FUNCTION public.search_all(
  p_query    text,
  p_category text DEFAULT 'all',
  p_limit    int  DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_escaped text;
  v_results jsonb := '[]'::jsonb;
  v_cat     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF char_length(trim(p_query)) < 1 THEN
    RAISE EXCEPTION 'Search query must be at least 1 character';
  END IF;
  IF char_length(trim(p_query)) > 200 THEN
    RAISE EXCEPTION 'Search query must be 200 characters or fewer';
  END IF;

  v_escaped := replace(replace(trim(p_query), '%', '\%'), '_', '\_');
  v_cat := lower(coalesce(p_category, 'all'));

  IF v_cat IN ('all', 'users') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'display_name', display_name, 'avatar_url', avatar_url,
      'type', 'user', 'school', school
    )), '[]'::jsonb)
    INTO v_results
    FROM (
      SELECT pr.id, pr.display_name, pr.avatar_url, pr.school
      FROM public.profiles pr
      WHERE pr.id != v_uid
        AND pr.banned_at IS NULL
        AND (
          lower(pr.display_name) LIKE '%' || lower(v_escaped) || '%' ESCAPE '\'
          OR lower(pr.username) LIKE '%' || lower(v_escaped) || '%' ESCAPE '\'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.user_id = v_uid AND b.blocked_user_id = pr.id)
             OR (b.blocked_user_id = v_uid AND b.user_id = pr.id)
        )
      ORDER BY
        CASE WHEN lower(pr.username) = lower(v_escaped) THEN 0
             WHEN lower(pr.username) LIKE lower(v_escaped) || '%' THEN 1
             ELSE 2 END,
        pr.display_name
      LIMIT CASE WHEN v_cat = 'users' THEN p_limit ELSE 10 END
    ) u;
  END IF;

  IF v_cat IN ('all', 'communities') THEN
    v_results := v_results || (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'avatar_path', avatar_path,
        'description', description, 'type', 'community'
      )), '[]'::jsonb)
      FROM (
        SELECT c.id, c.name, c.avatar_path, c.description
        FROM public.communities c
        WHERE c.created_by NOT IN (
          SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
        )
        AND lower(c.name) LIKE '%' || lower(v_escaped) || '%' ESCAPE '\'
        ORDER BY c.name
        LIMIT CASE WHEN v_cat = 'communities' THEN p_limit ELSE 10 END
      ) cm
    );
  END IF;

  IF v_cat IN ('all', 'posts') THEN
    v_results := v_results || (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'answer', answer, 'type', 'post',
        'user', jsonb_build_object('display_name', display_name, 'avatar_url', avatar_url)
      )), '[]'::jsonb)
      FROM (
        SELECT da.id, da.answer, p.display_name, p.avatar_url
        FROM public.daily_answers da
        JOIN public.profiles p ON p.id = da.user_id
        WHERE da.is_public = true
          AND da.user_id NOT IN (
            SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
          )
          AND lower(da.answer) LIKE '%' || lower(v_escaped) || '%' ESCAPE '\'
        ORDER BY da.created_at DESC
        LIMIT CASE WHEN v_cat = 'posts' THEN p_limit ELSE 10 END
      ) po
    );
  END IF;

  RETURN jsonb_build_object(
    'results', v_results,
    'total', jsonb_array_length(v_results)
  );
END;
$$;

-- ============================================================
-- 9. HIGH: report_discover_item — category allow-list mismatch
-- ============================================================
-- DB CHECK: ('spam','harassment','impersonation','scam',
--            'inappropriate_content','other')
-- DB target_type CHECK: ('user','message','group_message','community_message')

DROP FUNCTION IF EXISTS public.report_discover_item(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.report_discover_item(
  p_target_type text,
  p_target_id   uuid,
  p_category    text,
  p_details     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_type NOT IN ('user', 'message', 'group_message', 'community_message') THEN
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  IF p_category NOT IN ('spam', 'harassment', 'impersonation', 'scam', 'inappropriate_content', 'other') THEN
    RAISE EXCEPTION 'Invalid report category';
  END IF;

  IF char_length(coalesce(p_details, '')) > 500 THEN
    RAISE EXCEPTION 'Details must be 500 characters or fewer';
  END IF;

  INSERT INTO public.moderation_reports (reporter_id, target_type, target_id, category, details)
  VALUES (auth.uid(), p_target_type, p_target_id, p_category, p_details)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('reported', true);
END;
$$;

-- ============================================================
-- 10. MEDIUM: user_event_rsvps — drop wrong policy name
-- ============================================================
-- Original policy from events.sql:59 is named
-- "Event RSVPs readable by all authenticated users"
-- The security fix dropped a non-existent name, leaving the
-- permissive policy active alongside the restrictive one.

DROP POLICY IF EXISTS "user_event_rsvps_select_public" ON public.user_event_rsvps;
DROP POLICY IF EXISTS "Event RSVPs readable by all authenticated users" ON public.user_event_rsvps;
DROP POLICY IF EXISTS "user_event_rsvps_select_own_or_organizer" ON public.user_event_rsvps;

CREATE POLICY "user_event_rsvps_select_own_or_organizer"
  ON public.user_event_rsvps
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_events ue
      WHERE ue.id = event_id AND ue.created_by = auth.uid()
    )
  );

-- ============================================================
-- 11. Fix broken cron jobs from automation_engine.sql
-- ============================================================
-- Remove jobs that reference nonexistent columns/tables/functions.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    -- This job references user_events.status which doesn't exist
    PERFORM cron.unschedule('transition_event_status');
    RAISE NOTICE 'Removed broken transition_event_status cron job';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule transition_event_status: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    -- This job references user_presence table which doesn't exist
    PERFORM cron.unschedule('cleanup_stale_presence');
    RAISE NOTICE 'Removed broken cleanup_stale_presence cron job';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule cleanup_stale_presence: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    -- This job references discover_scores which doesn't exist
    PERFORM cron.unschedule('refresh_discover_scores');
    RAISE NOTICE 'Removed broken refresh_discover_scores cron job';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not unschedule refresh_discover_scores: %', SQLERRM;
END $$;

-- ============================================================
-- DONE
-- ============================================================

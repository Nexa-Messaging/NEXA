-- ============================================================
-- Security Audit Fixes — 2026-09-15
-- ============================================================
-- Fixes 26 vulnerabilities identified in the security audit.
-- Do NOT weaken any existing policies.
-- ============================================================

-- ============================================================
-- 1. CRITICAL: Daily Cards — Auth checks on all functions
-- ============================================================

-- 1a. assign_daily_card: enforce p_user_id = auth.uid()
CREATE OR REPLACE FUNCTION public.assign_daily_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day       date := CURRENT_DATE;
  v_existing  record;
  v_card      record;
  v_row       record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT udc.*, t.category, t.body, t.points
    INTO v_existing
    FROM public.user_daily_cards udc
    JOIN public.daily_card_templates t ON t.id = udc.card_id
   WHERE udc.user_id = p_user_id
     AND udc.day     = v_day;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id',           v_existing.id,
      'card_id',      v_existing.card_id,
      'category',     v_existing.category,
      'body',         v_existing.body,
      'points',       v_existing.points,
      'completed',    v_existing.completed,
      'completed_at', v_existing.completed_at,
      'assigned_at',  v_existing.assigned_at,
      'already_had',  true
    );
  END IF;

  SELECT t.*
    INTO v_card
    FROM public.daily_card_templates t
   WHERE t.active = true
     AND t.id NOT IN (
       SELECT card_id
         FROM public.user_daily_cards
        WHERE user_id = p_user_id
        ORDER BY assigned_at DESC
        LIMIT 20
     )
   ORDER BY random()
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT t.*
      INTO v_card
      FROM public.daily_card_templates t
     WHERE t.active = true
     ORDER BY random()
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active daily card templates found';
  END IF;

  INSERT INTO public.user_daily_cards (user_id, card_id, day)
  VALUES (p_user_id, v_card.id, v_day)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',           v_row.id,
    'card_id',      v_card.id,
    'category',     v_card.category,
    'body',         v_card.body,
    'points',       v_card.points,
    'completed',    false,
    'completed_at', null,
    'assigned_at',  v_row.assigned_at,
    'already_had',  false
  );
END;
$$;

-- 1b. complete_daily_card: enforce p_user_id = auth.uid()
CREATE OR REPLACE FUNCTION public.complete_daily_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day  date := CURRENT_DATE;
  v_row  record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.user_daily_cards
     SET completed   = true,
         completed_at = now()
   WHERE user_id = p_user_id
     AND day     = v_day
     AND completed = false
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no pending card today');
  END IF;

  RETURN jsonb_build_object(
    'id',           v_row.id,
    'completed',    true,
    'completed_at', v_row.completed_at
  );
END;
$$;

-- 1c. send_daily_card: enforce p_sender_id = auth.uid(), add receiver validation
CREATE OR REPLACE FUNCTION public.send_daily_card(
  p_sender_id   uuid,
  p_receiver_id uuid,
  p_card_id     uuid,
  p_message     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_receiver_id = p_sender_id THEN
    RAISE EXCEPTION 'Cannot send a card to yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  INSERT INTO public.daily_card_sends (sender_id, receiver_id, card_id, message)
  VALUES (p_sender_id, p_receiver_id, p_card_id, p_message)
  RETURNING * INTO v_row;

  UPDATE public.user_daily_cards
     SET completed   = true,
         completed_at = now()
   WHERE user_id = p_sender_id
     AND card_id = p_card_id
     AND day     = CURRENT_DATE
     AND completed = false;

  RETURN jsonb_build_object(
    'id',    v_row.id,
    'sent',  true,
    'sent_at', v_row.sent_at
  );
END;
$$;

-- 1d. get_unread_card_count: enforce auth.uid()
CREATE OR REPLACE FUNCTION public.get_unread_card_count(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN (SELECT count(*)::int
    FROM public.daily_card_sends
   WHERE receiver_id = p_user_id
     AND read = false);
END;
$$;

-- 1e. get_received_cards: enforce auth.uid()
CREATE OR REPLACE FUNCTION public.get_received_cards(
  p_user_id uuid,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  id         uuid,
  sender_id  uuid,
  card_body  text,
  category   text,
  message    text,
  sent_at    timestamptz,
  read       boolean,
  sender_name text,
  sender_avatar text
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT
    cs.id,
    cs.sender_id,
    t.body  AS card_body,
    t.category,
    cs.message,
    cs.sent_at,
    cs.read,
    p.display_name AS sender_name,
    p.avatar_url AS sender_avatar
  FROM public.daily_card_sends cs
  JOIN public.daily_card_templates t ON t.id = cs.card_id
  LEFT JOIN public.profiles p ON p.id = cs.sender_id
  WHERE cs.receiver_id = p_user_id
  ORDER BY cs.sent_at DESC
  LIMIT p_limit;
END;
$$;

-- 1f. mark_card_read: enforce auth.uid()
CREATE OR REPLACE FUNCTION public.mark_card_read(p_card_send_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.daily_card_sends
     SET read = true
   WHERE id = p_card_send_id
     AND receiver_id = p_user_id;
END;
$$;

-- ============================================================
-- 2. CRITICAL: purge_expired_stories — admin gate
-- ============================================================

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR v_row IN
    SELECT s.id, s.media_path
    FROM public.stories s
    WHERE s.expires_at < now() - (p_older_than_days || ' days')::interval
  LOOP
    IF v_row.media_path IS NOT NULL AND v_row.media_path != '' THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'stories-media'
        AND name = v_row.media_path;
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
-- 3. CRITICAL: report_discover_item — SECURITY DEFINER + validation
-- ============================================================

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

  IF p_target_type IS NULL OR p_target_type = '' THEN
    RAISE EXCEPTION 'Target type is required';
  END IF;

  IF p_category NOT IN ('spam', 'harassment', 'hate_speech', 'nudity', 'violence', 'other') THEN
    RAISE EXCEPTION 'Invalid report category';
  END IF;

  IF char_length(coalesce(p_details, '')) > 500 THEN
    RAISE EXCEPTION 'Details must be 500 characters or fewer';
  END IF;

  INSERT INTO public.moderation_reports (reporter_id, target_type, target_id, category, details)
  VALUES (auth.uid(), p_target_type, p_target_id, p_category, p_details);

  RETURN jsonb_build_object('reported', true);
END;
$$;

-- ============================================================
-- 4. HIGH: user_preferences — auth checks
-- ============================================================

-- 4a. get_user_preferences: enforce auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_preferences(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_row
    FROM public.user_preferences
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.user_preferences (user_id) VALUES (p_user_id) RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'user_id',         v_row.user_id,
    'theme_id',        v_row.theme_id,
    'chat_bubble_style', v_row.chat_bubble_style,
    'graffiti_style',  v_row.graffiti_style,
    'sticker_pack',    v_row.sticker_pack,
    'background_id',   v_row.background_id,
    'profile_accent',  v_row.profile_accent,
    'updated_at',      v_row.updated_at
  );
END;
$$;

-- 4b. update_user_preferences: enforce auth.uid()
CREATE OR REPLACE FUNCTION public.update_user_preferences(
  p_user_id           uuid,
  p_theme_id          text DEFAULT NULL,
  p_chat_bubble_style text DEFAULT NULL,
  p_graffiti_style    text DEFAULT NULL,
  p_sticker_pack      text DEFAULT NULL,
  p_background_id     text DEFAULT NULL,
  p_profile_accent    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.user_preferences (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_preferences
     SET theme_id          = COALESCE(p_theme_id, theme_id),
         chat_bubble_style = COALESCE(p_chat_bubble_style, chat_bubble_style),
         graffiti_style    = COALESCE(p_graffiti_style, graffiti_style),
         sticker_pack      = COALESCE(p_sticker_pack, sticker_pack),
         background_id     = COALESCE(p_background_id, background_id),
         profile_accent    = COALESCE(p_profile_accent, profile_accent),
         updated_at        = now()
   WHERE user_id = p_user_id
   RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'user_id',         v_row.user_id,
    'theme_id',        v_row.theme_id,
    'chat_bubble_style', v_row.chat_bubble_style,
    'graffiti_style',  v_row.graffiti_style,
    'sticker_pack',    v_row.sticker_pack,
    'background_id',   v_row.background_id,
    'profile_accent',  v_row.profile_accent,
    'updated_at',      v_row.updated_at
  );
END;
$$;

-- ============================================================
-- 5. HIGH: Automation Engine — fix all broken triggers
-- ============================================================

-- 5a. auto_deliver_message: fix column references
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
     AND public.is_online(v_receiver) THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5b. auto_award_bond_xp: fix all column references
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
  VALUES (NEW.sender_id, v_receiver, 'message', 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5c. auto_transition_event_status: fix column references
CREATE OR REPLACE FUNCTION public.auto_transition_event_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'upcoming' AND NEW.starts_at <= now() THEN
    NEW.status := 'live';

    INSERT INTO public.notifications (user_id, actor_id, type, title, body, data)
    SELECT
      r.user_id,
      NEW.created_by,
      'event_started',
      NEW.title,
      NEW.title,
      jsonb_build_object('event_id', NEW.id, 'community_id', NEW.community_id)
    FROM public.user_event_rsvps r
    WHERE r.event_id = NEW.id
      AND r.response IN ('going', 'maybe')
      AND r.user_id != NEW.created_by;
  END IF;

  IF NEW.status = 'live' AND NEW.ends_at <= now() THEN
    NEW.status := 'ended';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5d. auto_process_event_reminder: fix column references
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
    jsonb_build_object('event_id', e.id, 'community_id', e.community_id)
  FROM public.user_events e
  WHERE e.id = NEW.event_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. HIGH: mark_conversation_delivered — auth + membership check
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_delivered(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS INT AS $$
DECLARE
  v_updated INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
      AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a member of this conversation';
  END IF;

  UPDATE public.messages
  SET delivered_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id != auth.uid()
    AND delivered_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. HIGH: Moods — add auth gate + block check
-- ============================================================

DROP POLICY IF EXISTS "moods_select_public" ON public.moods;
CREATE POLICY "moods_select_public"
  ON public.moods
  FOR SELECT
  USING (
    expires_at > now()
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = moods.user_id)
         OR (blocker_id = moods.user_id AND blocked_id = auth.uid())
    )
  );

-- ============================================================
-- 8. HIGH: Discover Feed — fix banned_at logic (IN -> NOT IN)
-- ============================================================

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
    -- Communities (EXCLUDE banned users — fixed: NOT IN)
    SELECT
      'community'::text                   AS item_type,
      c.id                               AS item_id,
      public.compute_discover_score(
        c.created_at,
        COALESCE(mc2.cnt, 0),
        0, 0
      )                                  AS score,
      jsonb_build_object(
        'name',        c.name,
        'description', c.description,
        'avatar_url',  c.avatar_url,
        'cover_url',   c.cover_url,
        'member_count', COALESCE(mc2.cnt, 0),
        'is_member',   (mc.user_id IS NOT NULL)
      )                                  AS payload
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

    -- Daily Questions with top answers
    SELECT
      'question'::text                   AS item_type,
      dq.id                              AS item_id,
      public.compute_discover_score(
        dq.created_at,
        COALESCE(qr.total_reactions, 0),
        COALESCE(qr.total_answers, 0),
        COALESCE(qr.total_answers, 0)
      )                                  AS score,
      jsonb_build_object(
        'body',           dq.body,
        'scheduled_date', dq.scheduled_date,
        'answer_count',   COALESCE(qr.total_answers, 0),
        'has_answered',   EXISTS (
          SELECT 1 FROM public.daily_answers da
          WHERE da.question_id = dq.id AND da.user_id = v_uid
        )
      )                                  AS payload
    FROM public.daily_questions dq
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT da.id)              AS total_answers,
        count(DISTINCT dar.id)             AS total_reactions
      FROM public.daily_answers da
      LEFT JOIN public.daily_answer_reactions dar ON dar.answer_id = da.id
      WHERE da.question_id = dq.id
    ) qr ON true
    WHERE dq.scheduled_date <= CURRENT_DATE

    UNION ALL

    -- Answers (from non-banned users, public only)
    SELECT
      'answer'::text                     AS item_type,
      da.id                              AS item_id,
      public.compute_discover_score(
        da.created_at,
        COALESCE(ar.cnt, 0),
        0, 0
      )                                  AS score,
      jsonb_build_object(
        'body',          da.body,
        'is_anonymous',  da.is_anonymous,
        'reaction_count', COALESCE(ar.cnt, 0),
        'user',          CASE WHEN da.is_anonymous THEN NULL ELSE jsonb_build_object(
          'id',           p.id,
          'display_name', p.display_name,
          'avatar_url',   p.avatar_url
        ) END
      )                                  AS payload
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

    -- User profiles (non-banned, non-blocked)
    SELECT
      'profile'::text                    AS item_type,
      pr.id                             AS item_id,
      public.compute_discover_score(
        pr.created_at,
        0,
        0,
        (SELECT count(*) FROM public.friends f
         WHERE f.user_id = pr.id OR f.friend_id = pr.id)
      )                                  AS score,
      jsonb_build_object(
        'id',           pr.id,
        'display_name', pr.display_name,
        'avatar_url',   pr.avatar_url,
        'bio',          pr.bio,
        'school',       pr.school,
        'is_friend',    EXISTS (
          SELECT 1 FROM public.friends f
          WHERE (f.user_id = v_uid AND f.friend_id = pr.id)
             OR (f.friend_id = v_uid AND f.user_id = pr.id)
        )
      )                                  AS payload
    FROM public.profiles pr
    WHERE pr.id != v_uid
      AND pr.banned_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = v_uid AND b.blocked_id = pr.id)
           OR (b.blocker_id = pr.id AND b.blocked_id = v_uid)
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
-- 9. MEDIUM: search_all — escape LIKE metacharacters
-- ============================================================

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
  v_query   text;
  v_escaped text;
  v_results jsonb := '[]'::jsonb;
  v_cat     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := trim(p_query);
  IF char_length(v_query) < 1 THEN
    RAISE EXCEPTION 'Search query must be at least 1 character';
  END IF;
  IF char_length(v_query) > 200 THEN
    RAISE EXCEPTION 'Search query must be 200 characters or fewer';
  END IF;

  -- Escape LIKE metacharacters
  v_escaped := replace(replace(v_query, '%', '\%'), '_', '\_');
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
          WHERE (b.blocker_id = v_uid AND b.blocked_id = pr.id)
             OR (b.blocker_id = pr.id AND b.blocked_id = v_uid)
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
        'id', id, 'name', name, 'avatar_url', avatar_url,
        'description', description, 'type', 'community'
      )), '[]'::jsonb)
      FROM (
        SELECT c.id, c.name, c.avatar_url, c.description
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
        'id', id, 'body', body, 'type', 'post',
        'user', jsonb_build_object('display_name', display_name, 'avatar_url', avatar_url)
      )), '[]'::jsonb)
      FROM (
        SELECT da.id, da.body, p.display_name, p.avatar_url
        FROM public.daily_answers da
        JOIN public.profiles p ON p.id = da.user_id
        WHERE da.is_public = true
          AND da.user_id NOT IN (
            SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
          )
          AND lower(da.body) LIKE '%' || lower(v_escaped) || '%' ESCAPE '\'
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
-- 10. MEDIUM: user_event_rsvps — restrict public SELECT
-- ============================================================

DROP POLICY IF EXISTS "user_event_rsvps_select_public" ON public.user_event_rsvps;
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
-- 11. MEDIUM: daily answer reactions — visibility check
-- ============================================================

CREATE OR REPLACE FUNCTION public.react_to_daily_answer(
  p_answer_id uuid,
  p_emoji     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF char_length(p_emoji) > 16 THEN
    RAISE EXCEPTION 'Emoji must be 16 characters or fewer';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_answers
    WHERE id = p_answer_id AND is_public = true
  ) THEN
    RAISE EXCEPTION 'Answer not found';
  END IF;

  INSERT INTO public.daily_answer_reactions (answer_id, user_id, emoji)
  VALUES (p_answer_id, auth.uid(), p_emoji)
  ON CONFLICT (answer_id, user_id, emoji) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unreact_to_daily_answer(
  p_answer_id uuid,
  p_emoji     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_answers
    WHERE id = p_answer_id AND is_public = true
  ) THEN
    RAISE EXCEPTION 'Answer not found';
  END IF;

  DELETE FROM public.daily_answer_reactions
  WHERE answer_id = p_answer_id
    AND user_id = auth.uid()
    AND emoji = p_emoji;
END;
$$;

-- ============================================================
-- 12. LOW: automation_log — restrict to admin only
-- ============================================================

DROP POLICY IF EXISTS "Users can view own automation log" ON public.automation_log;
CREATE POLICY "Admins can view automation log"
  ON public.automation_log
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- 13. LOW: process_due_event_reminders — add auth guard
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_due_event_reminders(p_window_minutes int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR r IN
    SELECT r.user_id, r.event_id, e.title, e.starts_at, e.created_by, e.community_id
    FROM public.user_event_reminders r
    JOIN public.user_events e ON e.id = r.event_id
    WHERE e.starts_at BETWEEN now() AND now() + (p_window_minutes || ' minutes')::interval
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = r.user_id
          AND n.type = 'event_reminder'
          AND n.data->>'event_id' = r.event_id::text
          AND n.created_at > now() - interval '1 hour'
      )
  LOOP
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, data)
    VALUES (
      r.user_id,
      r.created_by,
      'event_reminder',
      r.title,
      r.title || ' — ' || to_char(r.starts_at, 'Mon DD at HH12:MIam'),
      jsonb_build_object('event_id', r.event_id, 'community_id', r.community_id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 14. Storage — add file size limits + MIME type restrictions
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
WHERE id = 'avatars';

UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/m4a', 'audio/aac', 'audio/ogg']
WHERE id = 'message-attachments';

UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
WHERE id = 'stories-media';

UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'group-avatars';

UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/m4a', 'audio/aac', 'application/pdf']
WHERE id = 'group-attachments';

UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'community-avatars';

UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']
WHERE id = 'community-attachments';

UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'event-images';

-- ============================================================
-- DONE
-- ============================================================

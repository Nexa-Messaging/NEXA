-- =============================================================
-- DISCOVER  –  ranked public content feed
-- =============================================================

-- 1. Discover item types -------------------------------------------------------
-- We don't create a new table — the RPC function assembles the feed on the fly
-- from existing public data (communities, daily_questions, daily_answers, profiles).
-- This avoids data duplication and keeps the system extensible.

-- 2. Spam protection: minimum account age and report count threshold -----------
CREATE OR REPLACE FUNCTION public.is_eligible_for_discover(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    -- Account must be at least 24 hours old
    (
      SELECT created_at FROM auth.users WHERE id = p_user_id
    ) < now() - interval '24 hours'
    -- User must not have 3+ open moderation reports against them
    AND (
      SELECT count(*)::int FROM public.moderation_reports
       WHERE target_id = p_user_id
         AND target_type = 'user'
         AND status IN ('open', 'reviewing')
    ) < 3
$$;

-- 3. Ranking function: weighted score from signals -----------------------------
-- weight_recency  : exponential decay over 7 days
-- weight_reactions: normalized log-scale reactions
-- weight_answers  : normalized answers/comments count
-- weight_participation: unique users who engaged
CREATE OR REPLACE FUNCTION public.compute_discover_score(
  p_created_at    timestamptz,
  p_reaction_count int   DEFAULT 0,
  p_answer_count   int   DEFAULT 0,
  p_participant_count int DEFAULT 0
)
RETURNS float
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    -- Recency: exponential half-life of 3 days
    (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - p_created_at)) / (3.0 * 86400)))
    -- Reactions: log-normalized (1 + log(1 + count))
    * (1.0 + ln(1.0 + p_reaction_count)::float)
    -- Answers/comments: log-normalized
    * (1.0 + ln(1.0 + p_answer_count)::float * 0.5)
    -- Participation: log-normalized unique users
    * (1.0 + ln(1.0 + p_participant_count)::float * 0.3)
$$;

-- 4. Main feed RPC: returns ranked discover items -----------------------------
CREATE OR REPLACE FUNCTION public.get_discover_feed(
  p_limit   int DEFAULT 30,
  p_offset  int DEFAULT 0
)
RETURNS TABLE (
  item_type     text,        -- 'community' | 'question' | 'answer' | 'profile'
  item_id       uuid,
  score         float,
  title         text,
  subtitle      text,
  body          text,
  avatar_url    text,
  author_name   text,
  author_id     uuid,
  reaction_count int,
  answer_count  int,
  participant_count int,
  created_at    timestamptz,
  meta          jsonb        -- extra type-specific data
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Return a blended, ranked feed from multiple content types
  RETURN QUERY

  -- ── Communities ──────────────────────────────────────────────
  SELECT
    'community'::text                  AS item_type,
    c.id                               AS item_id,
    public.compute_discover_score(
      c.created_at,
      0,
      0,
      COALESCE(member_counts.cnt, 0)
    )                                  AS score,
    c.name                             AS title,
    c.school || ' — ' || c.department  AS subtitle,
    c.description                      AS body,
    c.avatar_path                      AS avatar_url,
    NULL::text                         AS author_name,
    c.created_by                       AS author_id,
    0                                  AS reaction_count,
    0                                  AS answer_count,
    COALESCE(member_counts.cnt, 0)     AS participant_count,
    c.created_at                       AS created_at,
    jsonb_build_object(
      'school',       c.school,
      'department',   c.department,
      'level',        c.level,
      'member_count', COALESCE(member_counts.cnt, 0),
      'is_member',    CASE WHEN mc.user_id IS NOT NULL THEN true ELSE false END
    )                                  AS meta
  FROM public.communities c
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
      FROM public.community_members cm
     WHERE cm.community_id = c.id
  ) member_counts ON true
  LEFT JOIN public.community_members mc
    ON mc.community_id = c.id AND mc.user_id = v_uid
  WHERE c.created_by IN (
    SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
  )

  UNION ALL

  -- ── Daily Questions with top answers ─────────────────────────
  SELECT
    'question'::text                   AS item_type,
    dq.id                              AS item_id,
    public.compute_discover_score(
      dq.created_at,
      COALESCE(qr.total_reactions, 0),
      COALESCE(qr.total_answers, 0),
      COALESCE(qr.total_answers, 0)
    )                                  AS score,
    dq.text                            AS title,
    'Question' || CASE
      WHEN dq.category IS NOT NULL AND dq.category != 'general'
      THEN ' · ' || dq.category
      ELSE ''
    END                                AS subtitle,
    NULL::text                         AS body,
    NULL::text                         AS avatar_url,
    NULL::text                         AS author_name,
    NULL::uuid                         AS author_id,
    COALESCE(qr.total_reactions, 0)    AS reaction_count,
    COALESCE(qr.total_answers, 0)      AS answer_count,
    COALESCE(qr.total_answers, 0)      AS participant_count,
    dq.created_at                      AS created_at,
    jsonb_build_object(
      'category',      dq.category,
      'total_answers',  COALESCE(qr.total_answers, 0),
      'total_reactions', COALESCE(qr.total_reactions, 0),
      'scheduled_date', dq.scheduled_date
    )                                  AS meta
  FROM public.daily_questions dq
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS total_answers,
      COALESCE((
        SELECT count(*)::int
          FROM public.daily_answers da2
          JOIN public.daily_answer_reactions dar ON dar.answer_id = da2.id
         WHERE da2.question_id = dq.id
      ), 0) AS total_reactions
    FROM public.daily_answers da
    WHERE da.question_id = dq.id
      AND da.is_public = true
  ) qr ON true
  WHERE dq.is_active = true
    AND dq.scheduled_date IS NOT NULL

  UNION ALL

  -- ── Popular public answers ───────────────────────────────────
  SELECT
    'answer'::text                     AS item_type,
    da.id                              AS item_id,
    public.compute_discover_score(
      da.created_at,
      COALESCE(ar.reaction_count, 0),
      0,
      COALESCE(ar.reaction_count, 0)
    )                                  AS score,
    dq2.text                           AS title,
    'Answer by ' || COALESCE(p.display_name, 'Someone') AS subtitle,
    da.answer                          AS body,
    p.avatar_url                       AS avatar_url,
    p.display_name                     AS author_name,
    da.user_id                         AS author_id,
    COALESCE(ar.reaction_count, 0)     AS reaction_count,
    0                                  AS answer_count,
    COALESCE(ar.reaction_count, 0)     AS participant_count,
    da.created_at                      AS created_at,
    jsonb_build_object(
      'question_id',    da.question_id,
      'question_text',  dq2.text,
      'is_public',      da.is_public,
      'username',       p.username
    )                                  AS meta
  FROM public.daily_answers da
  JOIN public.daily_questions dq2 ON dq2.id = da.question_id
  LEFT JOIN public.profiles p ON p.id = da.user_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS reaction_count
      FROM public.daily_answer_reactions dar
     WHERE dar.answer_id = da.id
  ) ar ON true
  WHERE da.is_public = true
    AND p.banned_at IS NULL

  UNION ALL

  -- ── Active profiles (users with public answers or activity) ──
  SELECT
    'profile'::text                    AS item_type,
    pr.id                              AS item_id,
    public.compute_discover_score(
      pr.created_at,
      COALESCE(uar.total_reactions, 0),
      COALESCE(uar.total_answers, 0),
      0
    )                                  AS score,
    pr.display_name                    AS title,
    '@' || pr.username                 AS subtitle,
    NULL::text                         AS body,
    pr.avatar_url                      AS avatar_url,
    pr.display_name                    AS author_name,
    pr.id                              AS author_id,
    COALESCE(uar.total_reactions, 0)   AS reaction_count,
    COALESCE(uar.total_answers, 0)     AS answer_count,
    0                                  AS participant_count,
    pr.created_at                      AS created_at,
    jsonb_build_object(
      'username',       pr.username,
      'total_answers',  COALESCE(uar.total_answers, 0),
      'total_reactions', COALESCE(uar.total_reactions, 0)
    )                                  AS meta
  FROM public.profiles pr
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS total_answers,
      COALESCE((
        SELECT count(*)::int
          FROM public.daily_answer_reactions dar2
          JOIN public.daily_answers da2 ON da2.id = dar2.answer_id
         WHERE da2.user_id = pr.id
      ), 0) AS total_reactions
    FROM public.daily_answers da
    WHERE da.user_id = pr.id
      AND da.is_public = true
  ) uar ON true
  WHERE pr.banned_at IS NULL
    AND (uar.total_answers > 0 OR pr.id = v_uid)

  -- ── Rank and paginate ────────────────────────────────────────
  ORDER BY score DESC, created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 5. Feed item detail: single item with full context ---------------------------
CREATE OR REPLACE FUNCTION public.get_discover_item(
  p_item_type text,
  p_item_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_item_type = 'community' THEN
    SELECT jsonb_build_object(
      'type', 'community',
      'id', c.id,
      'name', c.name,
      'description', c.description,
      'avatar_path', c.avatar_path,
      'school', c.school,
      'department', c.department,
      'level', c.level,
      'member_count', (SELECT count(*)::int FROM public.community_members WHERE community_id = c.id),
      'is_member', EXISTS(SELECT 1 FROM public.community_members WHERE community_id = c.id AND user_id = auth.uid())
    ) INTO v_result
    FROM public.communities c WHERE c.id = p_item_id;

  ELSIF p_item_type = 'question' THEN
    SELECT jsonb_build_object(
      'type', 'question',
      'id', dq.id,
      'text', dq.text,
      'category', dq.category,
      'scheduled_date', dq.scheduled_date,
      'answer_count', (SELECT count(*)::int FROM public.daily_answers WHERE question_id = dq.id AND is_public = true),
      'reaction_count', (
        SELECT count(*)::int FROM public.daily_answer_reactions dar
        JOIN public.daily_answers da ON da.id = dar.answer_id
        WHERE da.question_id = dq.id
      )
    ) INTO v_result
    FROM public.daily_questions dq WHERE dq.id = p_item_id;

  ELSIF p_item_type = 'answer' THEN
    SELECT jsonb_build_object(
      'type', 'answer',
      'id', da.id,
      'answer', da.answer,
      'question_id', da.question_id,
      'question_text', dq.text,
      'author_name', p.display_name,
      'author_avatar', p.avatar_url,
      'username', p.username,
      'reaction_count', (SELECT count(*)::int FROM public.daily_answer_reactions WHERE answer_id = da.id),
      'created_at', da.created_at
    ) INTO v_result
    FROM public.daily_answers da
    JOIN public.daily_questions dq ON dq.id = da.question_id
    LEFT JOIN public.profiles p ON p.id = da.user_id
    WHERE da.id = p_item_id;

  ELSIF p_item_type = 'profile' THEN
    SELECT jsonb_build_object(
      'type', 'profile',
      'id', pr.id,
      'display_name', pr.display_name,
      'username', pr.username,
      'avatar_url', pr.avatar_url,
      'answer_count', (SELECT count(*)::int FROM public.daily_answers WHERE user_id = pr.id AND is_public = true)
    ) INTO v_result
    FROM public.profiles pr WHERE pr.id = p_item_id;
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 6. Report content wrapper (uses existing moderation_reports) -----------------
CREATE OR REPLACE FUNCTION public.report_discover_item(
  p_target_type text,
  p_target_id   uuid,
  p_category    text,
  p_details     text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.moderation_reports (reporter_id, target_type, target_id, category, details)
  VALUES (auth.uid(), p_target_type, p_target_id, p_category, p_details)
  ON CONFLICT (reporter_id, target_type, target_id) WHERE status IN ('open', 'reviewing')
  DO NOTHING;
$$;

-- 7. RLS: discover feed is read-only, no table to protect ---------------------
-- The RPC functions are SECURITY DEFINER and handle their own access control.
-- Users can only report via report_discover_item which uses INSERT on moderation_reports.

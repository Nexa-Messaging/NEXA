-- =============================================================
-- EVENTS  –  standalone user-created events + community events
-- =============================================================

-- 1. User-created events (standalone, not tied to a community) -----------------
CREATE TABLE IF NOT EXISTS public.user_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text,
  location_type text NOT NULL DEFAULT 'physical' CHECK (location_type IN ('physical', 'online', 'hybrid')),
  cover_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_events_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT user_events_description_length CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT user_events_location_length CHECK (location IS NULL OR char_length(location) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_user_events_starts ON public.user_events (starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_creator ON public.user_events (created_by, created_at DESC);

COMMENT ON TABLE public.user_events IS 'Standalone events created by users, visible beyond community membership.';
COMMENT ON COLUMN public.user_events.location_type IS 'physical | online | hybrid — controls whether a precise location is shown.';
COMMENT ON COLUMN public.user_events.cover_url IS 'Public URL of the event cover image.';

-- 2. User event RSVPs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_event_rsvps (
  event_id    uuid NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  response    text NOT NULL CHECK (response IN ('going', 'maybe', 'not_going')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- 3. User event reminders ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_event_reminders (
  event_id    uuid NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- 4. RLS -----------------------------------------------------------------------
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event_reminders ENABLE ROW LEVEL SECURITY;

-- Events: anyone authenticated can read (public discoverable content)
CREATE POLICY "User events readable by all authenticated users"
  ON public.user_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- RSVPs: readable by anyone (aggregate counts needed for discover)
CREATE POLICY "Event RSVPs readable by all authenticated users"
  ON public.user_event_rsvps FOR SELECT
  USING (auth.role() = 'authenticated');

-- Reminders: own only
CREATE POLICY "Users can read own event reminders"
  ON public.user_event_reminders FOR SELECT
  USING (auth.uid() = user_id);

-- 5. Updated_at trigger --------------------------------------------------------
CREATE TRIGGER user_events_set_updated_at
  BEFORE UPDATE ON public.user_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. RPC: Create a user event --------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_user_event(
  p_title         text,
  p_starts_at     timestamptz,
  p_description   text DEFAULT NULL,
  p_ends_at       timestamptz DEFAULT NULL,
  p_location      text DEFAULT NULL,
  p_location_type text DEFAULT 'physical',
  p_cover_url     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title text := trim(coalesce(p_title, ''));
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_event uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title = '' OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'Event title must be between 1 and 120 characters';
  END IF;

  IF p_description IS NOT NULL AND char_length(p_description) > 1000 THEN
    RAISE EXCEPTION 'Description must be at most 1000 characters';
  END IF;

  IF v_location IS NOT NULL AND char_length(v_location) > 200 THEN
    RAISE EXCEPTION 'Location must be at most 200 characters';
  END IF;

  IF p_location_type NOT IN ('physical', 'online', 'hybrid') THEN
    RAISE EXCEPTION 'Location type must be physical, online, or hybrid';
  END IF;

  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'An event needs a date and time';
  END IF;

  INSERT INTO public.user_events (
    created_by, title, description, starts_at, ends_at,
    location, location_type, cover_url
  )
  VALUES (
    auth.uid(), v_title, nullif(p_description, ''),
    p_starts_at, p_ends_at, v_location, p_location_type, p_cover_url
  )
  RETURNING id INTO v_event;

  RETURN v_event;
END;
$$;

-- 7. RPC: Update a user event (author only) ------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_event(
  p_event         uuid,
  p_title         text DEFAULT NULL,
  p_description   text DEFAULT NULL,
  p_starts_at     timestamptz DEFAULT NULL,
  p_ends_at       timestamptz DEFAULT NULL,
  p_location      text DEFAULT NULL,
  p_location_type text DEFAULT NULL,
  p_cover_url     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_events WHERE id = p_event AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Event not found or you are not the creator';
  END IF;

  IF p_title IS NOT NULL THEN
    UPDATE public.user_events SET title = trim(p_title) WHERE id = p_event;
  END IF;
  IF p_description IS NOT NULL THEN
    UPDATE public.user_events SET description = nullif(trim(p_description), '') WHERE id = p_event;
  END IF;
  IF p_starts_at IS NOT NULL THEN
    UPDATE public.user_events SET starts_at = p_starts_at WHERE id = p_event;
  END IF;
  IF p_ends_at IS NOT NULL THEN
    UPDATE public.user_events SET ends_at = p_ends_at WHERE id = p_event;
  END IF;
  IF p_location IS NOT NULL THEN
    UPDATE public.user_events SET location = nullif(trim(p_location), '') WHERE id = p_event;
  END IF;
  IF p_location_type IS NOT NULL THEN
    UPDATE public.user_events SET location_type = p_location_type WHERE id = p_event;
  END IF;
  IF p_cover_url IS NOT NULL THEN
    UPDATE public.user_events SET cover_url = p_cover_url WHERE id = p_event;
  END IF;
END;
$$;

-- 8. RPC: Delete a user event (author only) ------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_event(p_event uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_events WHERE id = p_event AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Event not found or you are not the creator';
  END IF;

  DELETE FROM public.user_events WHERE id = p_event;
END;
$$;

-- 9. RPC: List upcoming events (for Discover feed) -----------------------------
CREATE OR REPLACE FUNCTION public.list_upcoming_events(
  p_limit  int DEFAULT 30,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  event_id        uuid,
  title           text,
  description     text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  location        text,
  location_type   text,
  cover_url       text,
  created_by      uuid,
  creator_name    text,
  creator_avatar  text,
  created_at      timestamptz,
  going_count     bigint,
  maybe_count     bigint,
  not_going_count bigint,
  my_response     text,
  reminding       boolean,
  status          text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ev.id,
    ev.title,
    ev.description,
    ev.starts_at,
    ev.ends_at,
    -- Hide precise location for physical events — show only area/region
    CASE
      WHEN ev.location_type = 'online' THEN 'Online'
      WHEN ev.location IS NOT NULL THEN
        -- Show only the first part before any comma (city, not full address)
        split_part(ev.location, ',', 1)
      ELSE NULL
    END AS location,
    ev.location_type,
    ev.cover_url,
    ev.created_by,
    p.display_name,
    p.avatar_url,
    ev.created_at,
    (SELECT count(*)::bigint FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'going'),
    (SELECT count(*)::bigint FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'maybe'),
    (SELECT count(*)::bigint FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'not_going'),
    (SELECT r.response FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.user_id = auth.uid()),
    EXISTS(SELECT 1 FROM public.user_event_reminders rm WHERE rm.event_id = ev.id AND rm.user_id = auth.uid()),
    CASE
      WHEN ev.starts_at > now() THEN 'upcoming'
      WHEN ev.ends_at IS NOT NULL AND ev.ends_at < now() THEN 'ended'
      WHEN ev.starts_at <= now() THEN 'live'
      ELSE 'upcoming'
    END AS status
  FROM public.user_events ev
  LEFT JOIN public.profiles p ON p.id = ev.created_by
  WHERE ev.created_by NOT IN (
    SELECT id FROM public.profiles WHERE banned_at IS NOT NULL
  )
  ORDER BY
    CASE
      WHEN ev.starts_at > now() THEN 0  -- upcoming first
      WHEN ev.starts_at <= now() AND (ev.ends_at IS NULL OR ev.ends_at >= now()) THEN 1  -- live
      ELSE 2  -- ended last
    END,
    ev.starts_at ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- 10. RPC: Get event detail ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'id',            ev.id,
    'title',         ev.title,
    'description',   ev.description,
    'starts_at',     ev.starts_at,
    'ends_at',       ev.ends_at,
    'location',      ev.location,
    'location_type', ev.location_type,
    'cover_url',     ev.cover_url,
    'created_by',    ev.created_by,
    'creator_name',  p.display_name,
    'creator_avatar', p.avatar_url,
    'username',      p.username,
    'created_at',    ev.created_at,
    'going_count',   (SELECT count(*)::int FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'going'),
    'maybe_count',   (SELECT count(*)::int FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'maybe'),
    'not_going_count', (SELECT count(*)::int FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.response = 'not_going'),
    'my_response',   (SELECT r.response FROM public.user_event_rsvps r WHERE r.event_id = ev.id AND r.user_id = auth.uid()),
    'reminding',     EXISTS(SELECT 1 FROM public.user_event_reminders rm WHERE rm.event_id = ev.id AND rm.user_id = auth.uid()),
    'status',        CASE
                       WHEN ev.starts_at > now() THEN 'upcoming'
                       WHEN ev.ends_at IS NOT NULL AND ev.ends_at < now() THEN 'ended'
                       WHEN ev.starts_at <= now() THEN 'live'
                       ELSE 'upcoming'
                     END
  )
  FROM public.user_events ev
  LEFT JOIN public.profiles p ON p.id = ev.created_by
  WHERE ev.id = p_event_id;
$$;

-- 11. RPC: RSVP to event -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rsvp_user_event(
  p_event    uuid,
  p_response text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_response IS NULL OR p_response NOT IN ('going', 'maybe', 'not_going') THEN
    RAISE EXCEPTION 'Response must be going, maybe, or not_going';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_events WHERE id = p_event
  ) THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  INSERT INTO public.user_event_rsvps (event_id, user_id, response)
  VALUES (p_event, auth.uid(), p_response)
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET response = EXCLUDED.response, updated_at = now();
END;
$$;

-- 12. RPC: Toggle event reminder -----------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_user_event_reminder(p_event uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_on boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_events WHERE id = p_event
  ) THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_event_reminders
    WHERE event_id = p_event AND user_id = auth.uid()
  ) INTO v_on;

  IF v_on THEN
    DELETE FROM public.user_event_reminders
    WHERE event_id = p_event AND user_id = auth.uid();
    RETURN false;
  END IF;

  INSERT INTO public.user_event_reminders (event_id, user_id)
  VALUES (p_event, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- 13. RPC: Get events user is attending ----------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_events()
RETURNS TABLE (
  event_id      uuid,
  title         text,
  starts_at     timestamptz,
  location      text,
  location_type text,
  cover_url     text,
  response      text,
  creator_name  text,
  creator_avatar text,
  status        text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ev.id,
    ev.title,
    ev.starts_at,
    CASE
      WHEN ev.location_type = 'online' THEN 'Online'
      WHEN ev.location IS NOT NULL THEN split_part(ev.location, ',', 1)
      ELSE NULL
    END,
    ev.location_type,
    ev.cover_url,
    r.response,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN ev.starts_at > now() THEN 'upcoming'
      WHEN ev.ends_at IS NOT NULL AND ev.ends_at < now() THEN 'ended'
      WHEN ev.starts_at <= now() THEN 'live'
      ELSE 'upcoming'
    END
  FROM public.user_event_rsvps r
  JOIN public.user_events ev ON ev.id = r.event_id
  LEFT JOIN public.profiles p ON p.id = ev.created_by
  WHERE r.user_id = auth.uid()
    AND r.response != 'not_going'
  ORDER BY ev.starts_at ASC;
$$;

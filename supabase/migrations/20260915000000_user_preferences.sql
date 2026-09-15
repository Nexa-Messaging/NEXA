-- =============================================================
-- PERSONALIZATION  –  user theme preferences
-- =============================================================

-- Add user_theme_id column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_theme_id text NOT NULL DEFAULT 'default';

COMMENT ON COLUMN public.profiles.user_theme_id IS 'Selected personalization theme ID (e.g. neon, candy, space).';

-- User theme preferences (extended settings beyond just theme ID)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id          text NOT NULL DEFAULT 'default',
  chat_bubble_style text NOT NULL DEFAULT 'default',   -- default | rounded | square
  graffiti_style    text NOT NULL DEFAULT 'default',   -- default | neon | candy | minimal
  sticker_pack      text NOT NULL DEFAULT 'default',   -- default | quirky | cute | cool
  background_id     text NOT NULL DEFAULT 'default',   -- default | stars | waves | grid
  profile_accent    text,                               -- hex color for profile accent ring
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_preferences IS 'Per-user personalization preferences (theme, bubbles, stickers, etc).';

-- RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- RPC: get or create user preferences
CREATE OR REPLACE FUNCTION public.get_user_preferences(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row record;
BEGIN
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

-- RPC: update user preferences
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
AS $$
DECLARE
  v_row record;
BEGIN
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

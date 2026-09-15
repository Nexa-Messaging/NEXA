-- =============================================================
-- DAILY CARDS  –  random playful cards users receive each day
-- =============================================================

-- 1. Card template catalogue --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_card_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL CHECK (category IN (
                'question','compliment','challenge','friendship','chaos','game'
              )),
  body        text NOT NULL,          -- the card text shown to user
  points      int  NOT NULL DEFAULT 0,-- optional gamification weight
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.daily_card_templates IS 'Pool of daily-card templates each user can receive.';
COMMENT ON COLUMN public.daily_card_templates.category IS 'question | compliment | challenge | friendship | chaos | game';
COMMENT ON COLUMN public.daily_card_templates.points IS 'XP awarded when user completes the card action.';

-- 2. Which card a user was assigned on a given date ---------------------------
CREATE TABLE IF NOT EXISTS public.user_daily_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     uuid NOT NULL REFERENCES public.daily_card_templates(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  day         date NOT NULL DEFAULT CURRENT_DATE,
  completed   boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  sent_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)  -- one card per user per day
);

CREATE INDEX IF NOT EXISTS idx_user_daily_cards_user_day
  ON public.user_daily_cards (user_id, day DESC);

-- 3. History of cards sent between users ---------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_card_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     uuid NOT NULL REFERENCES public.daily_card_templates(id) ON DELETE CASCADE,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  message     text,                    -- optional note
  read        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_daily_card_sends_receiver
  ON public.daily_card_sends (receiver_id, sent_at DESC);

-- 4. RLS -----------------------------------------------------------------------
ALTER TABLE public.daily_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_cards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_card_sends    ENABLE ROW LEVEL SECURITY;

-- Templates: everyone can read, nobody writes from client
CREATE POLICY "Templates readable by all authenticated users"
  ON public.daily_card_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- User daily cards: own rows only
CREATE POLICY "Users can read own daily cards"
  ON public.user_daily_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily cards"
  ON public.user_daily_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily cards"
  ON public.user_daily_cards FOR UPDATE
  USING (auth.uid() = user_id);

-- Card sends: sender or receiver can read
CREATE POLICY "Users can read own sent cards"
  ON public.daily_card_sends FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send cards"
  ON public.daily_card_sends FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Receivers can mark cards read"
  ON public.daily_card_sends FOR UPDATE
  USING (auth.uid() = receiver_id);

-- 5. Assign daily card RPC ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_daily_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day       date := CURRENT_DATE;
  v_existing  record;
  v_card      record;
  v_row       record;
BEGIN
  -- Already have a card today? Return it.
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

  -- Pick a random card, avoiding the last 20 the user has seen
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

  -- Fallback: if fewer than 20 total templates, allow repeats
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

  -- Assign
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

-- 6. Complete today's card ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_daily_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_day  date := CURRENT_DATE;
  v_row  record;
BEGIN
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

-- 7. Send card to a friend ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_daily_card(
  p_sender_id   uuid,
  p_receiver_id uuid,
  p_card_id     uuid,
  p_message     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot send a card to yourself';
  END IF;

  INSERT INTO public.daily_card_sends (sender_id, receiver_id, card_id, message)
  VALUES (p_sender_id, p_receiver_id, p_card_id, p_message)
  RETURNING * INTO v_row;

  -- Award points to sender
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

-- 8. Get unread card count ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_card_count(p_user_id uuid)
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::int
    FROM public.daily_card_sends
   WHERE receiver_id = p_user_id
     AND read = false
$$;

-- 9. Get received cards (inbox) -----------------------------------------------
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
LANGUAGE sql STABLE
AS $$
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
  LIMIT p_limit
$$;

-- 10. Mark card as read -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_card_read(p_card_send_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.daily_card_sends
     SET read = true
   WHERE id = p_card_send_id
     AND receiver_id = p_user_id
$$;

-- 11. Seed card templates (60 cards — 10 per category) -------------------------
INSERT INTO public.daily_card_templates (category, body, points) VALUES
-- QUESTION (10)
('question', 'If you could have dinner with anyone, living or dead — who?', 5),
('question', 'What''s a skill you''d love to master overnight?', 5),
('question', 'What''s the best advice you''ve ever received?', 5),
('question', 'If your life had a theme song, what would it be?', 5),
('question', 'What''s a small thing that made you smile this week?', 5),
('question', 'If you could teleport anywhere right now, where would you go?', 5),
('question', 'What''s a song you have on repeat right now?', 5),
('question', 'What would your perfect lazy Sunday look like?', 5),
('question', 'If you could learn any language instantly, which one?', 5),
('question', 'What''s the last thing you watched that you can''t stop thinking about?', 5),

-- COMPLIMENT (10)
('compliment', 'Send someone a compliment and make their day brighter.', 10),
('compliment', 'Tell a friend what you admire about them.', 10),
('compliment', 'Drop a kind message to someone who needs it.', 10),
('compliment', 'You''re amazing — now tell someone else they are too.', 10),
('compliment', 'Compliment someone''s vibe today. They deserve it.', 10),
('compliment', 'Send a friend a "just thinking of you" message.', 10),
('compliment', 'Tell someone why they''re important to you.', 10),
('compliment', 'Brighten someone''s timeline with a genuine compliment.', 10),
('compliment', 'Give someone a shoutout — they earned it.', 10),
('compliment', 'Spread some love: compliment a friend right now.', 10),

-- CHALLENGE (10)
('challenge', 'Challenge a friend to a game of your choice.', 15),
('challenge', 'Go 24 hours without your favourite app. Ready?', 15),
('challenge', 'Send a voice note instead of a text today.', 10),
('challenge', 'Try a new food you''ve never had before.', 10),
('challenge', 'Do 20 push-ups right now. No excuses.', 15),
('challenge', 'Take a photo of something beautiful and share it.', 10),
('challenge', 'Write a 6-word story and send it to a friend.', 15),
('challenge', 'Compliment 3 people in the next hour.', 15),
('challenge', 'Learn one new word and use it in a sentence today.', 10),
('challenge', 'Random act of kindness — report back.', 20),

-- FRIENDSHIP (10)
('friendship', 'Reach out to a friend you haven''t talked to in a while.', 10),
('friendship', 'Send a friend a memory you share together.', 10),
('friendship', 'Check in on a friend — just a simple "how are you?"', 10),
('friendship', 'Tag a friend and remind them why you''re grateful.', 10),
('friendship', 'Share a throwback photo with someone.', 10),
('friendship', 'Plan something fun with a friend this week.', 10),
('friendship', 'Send your friend a song that reminds you of them.', 10),
('friendship', 'Create a mini bucket list with a friend.', 10),
('friendship', 'Make a friend laugh — send them something funny.', 10),
('friendship', 'Send a friend a voice memo just to say hi.', 10),

-- CHAOS (10)
('chaos', 'Post the worst selfie you can take right now.', 20),
('chaos', 'Send a message in all caps for no reason.', 15),
('chaos', 'Change your profile picture to something ridiculous.', 20),
('chaos', 'Text a friend a single random emoji. No context.', 15),
('chaos', 'Send a dramatic monologue to your group chat.', 20),
('chaos', 'Reply to your last 3 messages with only GIFs.', 15),
('chaos', 'Send a voice note singing your favourite chorus.', 20),
('chaos', 'Write a haiku about your current mood.', 15),
('chaos', 'Send a message as if you''re a villain in a movie.', 20),
('chaos', 'Spam a friend with compliments — minimum 5.', 15),

-- GAME (10)
('game', 'Play 20 questions with a friend — you start.', 15),
('game', 'Start a word chain with someone. First word: "galaxy".', 15),
('game', 'Challenge a friend to name 5 things in 10 seconds.', 15),
('game', 'Would you rather: fly or be invisible? Ask a friend.', 10),
('game', 'Send a riddle to a friend. See if they can solve it.', 15),
('game', 'Play emoji decode: send a phrase in emojis only.', 15),
('game', 'Have a friend guess the song from 3 lyrics.', 15),
('game', 'Rock paper scissors via messages — first to 3 wins.', 15),
('game', 'Start a story chain: one sentence each with a friend.', 15),
('game', 'Secret mission: make a friend laugh in under 60 seconds.', 20)
ON CONFLICT DO NOTHING;

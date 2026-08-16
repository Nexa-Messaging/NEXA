-- Add last_seen_at to profiles for offline "last seen" display.
-- Default to now() so existing users appear as "last seen" at account creation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Update the timestamp on each login. Called from the app on auth state change.
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
    SET last_seen_at = now()
    WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;

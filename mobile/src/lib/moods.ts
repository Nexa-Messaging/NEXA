import { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

export interface Mood {
  id: string;
  user_id: string;
  emoji: string;
  label: string;
  is_custom: boolean;
  expires_at: string;
  created_at: string;
}

export interface MoodResult<T> {
  data: T | null;
  error: string | null;
}

function moodError(error: PostgrestError): string {
  return `Could not save mood (${error.message}).`;
}

/** Preset moods that users can choose from. */
export const PRESET_MOODS: readonly { emoji: string; label: string }[] = [
  { emoji: '😂', label: 'Funny' },
  { emoji: '🔥', label: 'Good vibes' },
  { emoji: '🎮', label: 'Gaming' },
  { emoji: '🎵', label: 'Music' },
  { emoji: '🧠', label: 'Locked in' },
  { emoji: '💤', label: 'Sleep mode' },
  { emoji: '🥳', label: 'Celebrating' },
  { emoji: '😭', label: 'Struggling' },
] as const;

/** Default mood expiration: 24 hours from now. */
export const DEFAULT_MOOD_DURATION_HOURS = 24;

export function defaultMoodExpiration(): string {
  const date = new Date();
  date.setHours(date.getHours() + DEFAULT_MOOD_DURATION_HOURS);
  return date.toISOString();
}

/**
 * Sets or replaces the current user's mood.
 * Any existing active mood is automatically removed.
 */
export async function setMood(
  emoji: string,
  label: string,
  expiresAt: string,
  isCustom = false,
): Promise<MoodResult<Mood>> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Delete any existing active mood for this user
  await supabase
    .from('moods')
    .delete()
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString());

  // Insert the new mood
  const { data, error } = await supabase
    .from('moods')
    .insert({
      user_id: user.id,
      emoji,
      label,
      is_custom: isCustom,
      expires_at: expiresAt,
    } as any)
    .select('*')
    .maybeSingle();

  if (error) {
    return { data: null, error: moodError(error) };
  }

  return { data, error: null };
}

/**
 * Clears the current user's active mood.
 */
export async function clearMood(): Promise<MoodResult<void>> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('moods' as any)
    .delete()
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString());

  if (error) {
    return { data: null, error: moodError(error) };
  }
  return { data: null, error: null };
}

/**
 * Fetches the active mood for a user (if any, and not expired).
 */
export async function fetchMood(userId: string): Promise<MoodResult<Mood>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('moods' as any)
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: `Could not load mood (${error.message}).` };
  }

  return { data: data as Mood | null, error: null };
}

/**
 * Fetches moods for multiple users at once (for chat lists, etc).
 * Returns a map of user_id -> mood (only active, non-expired moods).
 */
export async function fetchMoodsForUsers(
  userIds: string[],
): Promise<Map<string, Mood>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('moods' as any)
    .select('*')
    .in('user_id', userIds)
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.warn('Could not load moods:', error.message);
    return new Map();
  }

  const moodMap = new Map<string, Mood>();
  for (const mood of (data as unknown as Mood[]) ?? []) {
    // Only keep the most recent mood per user (should be only one due to constraint)
    const existing = moodMap.get(mood.user_id);
    if (!existing || new Date(mood.created_at) > new Date(existing.created_at)) {
      moodMap.set(mood.user_id, mood);
    }
  }

  return moodMap;
}

/**
 * Type guard to check if a mood is still valid (not expired).
 */
export function isMoodActive(mood: Mood | null | undefined): mood is Mood {
  if (!mood) {
    return false;
  }
  return new Date(mood.expires_at) > new Date();
}
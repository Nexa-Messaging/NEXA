import { PostgrestError } from '@supabase/supabase-js';

import { getProfileWriteErrorMessage } from '@/lib/auth/errors';
import { getSupabase } from '@/lib/supabase';
import { Profile, ProfileUpdate } from '@/types/database';

export interface ProfileResult<T> {
  data: T | null;
  error: string | null;
}

function profileWriteError(error: PostgrestError): string {
  return getProfileWriteErrorMessage(error) ?? `Could not save changes (${error.message}).`;
}

export async function fetchProfileById(userId: string): Promise<ProfileResult<Profile>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { data: null, error: `Could not load profile (${error.message}).` };
  }
  return { data, error: null };
}

export async function fetchProfileByUsername(
  username: string,
): Promise<ProfileResult<Profile>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (error) {
    return { data: null, error: `Could not load profile (${error.message}).` };
  }
  return { data, error: null };
}

/** True when a username is already used by another profile (RLS allows reads). */
export async function isUsernameTaken(username: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.warn('Username availability check failed:', error.message);
    return false; // Fall back to the DB unique constraint on save.
  }
  return data !== null;
}

export async function updateOwnProfile(
  userId: string,
  updates: ProfileUpdate,
): Promise<ProfileResult<Profile>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    return { data: null, error: profileWriteError(error) };
  }
  return { data, error: null };
}

export async function updateOwnAvatar(
  userId: string,
  avatarUrl: string,
): Promise<ProfileResult<Profile>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    return { data: null, error: profileWriteError(error) };
  }
  return { data, error: null };
}
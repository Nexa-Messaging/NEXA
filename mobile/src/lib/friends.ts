import { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { Profile } from '@/types/database';

export type FriendshipStatus =
  | 'none'
  | 'friends'
  | 'request_sent'
  | 'request_received'
  | 'i_blocked'
  | 'they_blocked_me';

export const FRIENDSHIP_STATUSES: readonly FriendshipStatus[] = [
  'none',
  'friends',
  'request_sent',
  'request_received',
  'i_blocked',
  'they_blocked_me',
] as const;

export interface FriendResult<T> {
  data: T | null;
  error: string | null;
}

function fallbackMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return message || fallback;
}

function toStatus(value: unknown): FriendshipStatus {
  return typeof value === 'string' &&
    (FRIENDSHIP_STATUSES as readonly string[]).includes(value)
    ? (value as FriendshipStatus)
    : 'none';
}

async function runRpc(
  name: string,
  args: Record<string, unknown>,
  fallbackError: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc(name as never, args as never);
  return error ? fallbackMessage(error, fallbackError) : null;
}

/** Current relationship between the signed-in user and `otherId`. */
export async function getFriendStatus(otherId: string): Promise<FriendResult<FriendshipStatus>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('friend_status', { p_other: otherId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load relationship.') };
  }
  return { data: toStatus(data), error: null };
}

export async function sendFriendRequest(targetId: string): Promise<string | null> {
  return runRpc('request_friend', { p_target: targetId }, 'Could not send the friend request.');
}

export async function respondToFriendRequest(
  senderId: string,
  accept: boolean,
): Promise<string | null> {
  return runRpc(
    'respond_friend_request',
    { p_sender: senderId, p_accept: accept },
    accept ? 'Could not accept the request.' : 'Could not reject the request.',
  );
}

export async function cancelFriendRequest(targetId: string): Promise<string | null> {
  return runRpc('cancel_friend_request', { p_target: targetId }, 'Could not cancel the request.');
}

export async function removeFriend(otherId: string): Promise<string | null> {
  return runRpc('remove_friend', { p_other: otherId }, 'Could not remove this friend.');
}

export async function blockUser(targetId: string): Promise<string | null> {
  return runRpc('block_user', { p_target: targetId }, 'Could not block this user.');
}

export async function unblockUser(targetId: string): Promise<string | null> {
  return runRpc('unblock_user', { p_target: targetId }, 'Could not unblock this user.');
}

// ---------------------------------------------------------------------------
// List helpers
// ---------------------------------------------------------------------------

async function fetchProfilesByIds(ids: string[]): Promise<FriendResult<Profile[]>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return { data: [], error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.from('profiles').select('*').in('id', unique);
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load profiles.') };
  }
  return { data: (data ?? []) as Profile[], error: null };
}

function friendshipError(error: PostgrestError | null): string {
  return error ? fallbackMessage(error, 'Could not load friendships.') : '';
}

/** Accepted friends of the current user (as profiles). */
export async function listFriends(meId: string): Promise<FriendResult<Profile[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .eq('status', 'accepted')
    .or(`user_id.eq.${meId},friend_id.eq.${meId}`);

  if (error) {
    return { data: null, error: friendshipError(error) };
  }

  const otherIds = (data ?? []).map((row) =>
    row.user_id === meId ? row.friend_id : row.user_id,
  );
  return fetchProfilesByIds(otherIds);
}

/** Friend requests waiting on me (sender profiles). */
export async function listIncomingRequests(meId: string): Promise<FriendResult<Profile[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id')
    .eq('friend_id', meId)
    .eq('status', 'pending');

  if (error) {
    return { data: null, error: friendshipError(error) };
  }
  return fetchProfilesByIds((data ?? []).map((row) => row.user_id));
}

/** Friend requests I sent that are still pending (recipient profiles). */
export async function listOutgoingRequests(meId: string): Promise<FriendResult<Profile[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', meId)
    .eq('status', 'pending');

  if (error) {
    return { data: null, error: friendshipError(error) };
  }
  return fetchProfilesByIds((data ?? []).map((row) => row.friend_id));
}

/** Searches profiles by display name or username. Excludes the current user. */
export async function searchUsers(
  meId: string,
  query: string,
): Promise<FriendResult<Profile[]>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { data: [], error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', meId)
    .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
    .order('username')
    .limit(20);

  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not search for users.') };
  }
  return { data: (data ?? []) as Profile[], error: null };
}
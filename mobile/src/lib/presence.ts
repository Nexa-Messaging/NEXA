/**
 * Real-time presence — tracks online status via Supabase Presence channels.
 *
 * Uses Supabase's built-in Presence API (no database writes). Each client
 * calls `track()` to announce itself; the channel syncs presence state to all
 * subscribers. A heartbeat re-tracks every 20 s to keep the connection alive.
 */

import { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

export interface PresenceState {
  user_id: string;
  online_at: string;
}

const HEARTBEAT_MS = 20_000;

let presenceChannel: RealtimeChannel | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let listenerCount = 0;

function channelName(userId: string) {
  return `nexa-presence:${userId}`;
}

/**
 * Subscribe to presence updates for a peer user. Returns an unsubscribe fn.
 * The `onSync` callback fires whenever the presence set changes, providing
 * the list of currently online user IDs.
 */
export function subscribeToPresence(
  peerUserId: string,
  onSync: (onlineUserIds: string[]) => void,
): () => void {
  const supabase = getSupabase();
  // We subscribe to the PEER's presence channel to see if they are online.
  const ch = supabase.channel(channelName(peerUserId));

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<PresenceState>();
    const ids = Object.values(state)
      .flat()
      .map((p) => p.user_id);
    onSync(ids);
  });

  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // We don't track ourselves here — we only observe the peer's channel.
    }
  });

  return () => {
    void ch.unsubscribe();
  };
}

/**
 * Start tracking the current user's presence. Must be called once when the
 * user authenticates. Re-tracks on a heartbeat interval.
 */
export function startPresenceTracking(userId: string): void {
  listenerCount++;
  if (presenceChannel) return; // already tracking

  const supabase = getSupabase();
  const ch = supabase.channel(channelName(userId), {
    config: { presence: { key: userId } },
  });

  ch.on('presence', { event: 'sync' }, () => {
    // Presence state is synced; no action needed here — we only care about
    // being tracked, not reading our own state.
  });

  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      } satisfies PresenceState);
    }
  });

  presenceChannel = ch;

  // Heartbeat: re-track to keep presence alive.
  heartbeatTimer = setInterval(async () => {
    if (presenceChannel) {
      await presenceChannel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      } satisfies PresenceState);
    }
  }, HEARTBEAT_MS);
}

/**
 * Stop tracking the current user's presence. Called on logout.
 */
export function stopPresenceTracking(): void {
  listenerCount--;
  if (listenerCount > 0) return; // other listeners still need it

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (presenceChannel) {
    void presenceChannel.untrack();
    void presenceChannel.unsubscribe();
    presenceChannel = null;
  }
}

/**
 * Update the current user's last_seen_at timestamp (RPC call).
 */
export async function updateLastSeen(): Promise<void> {
  try {
    const supabase = getSupabase();
    // update_last_seen is created by migration 20260816000000_presence_last_seen.sql.
    await supabase.rpc('update_last_seen');
  } catch {
    // Non-critical — ignore errors
  }
}

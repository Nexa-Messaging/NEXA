/**
 * Typing indicator — ephemeral broadcast via Supabase Realtime Broadcast.
 *
 * No database writes. Each client broadcasts a "typing" event on a per-
 * conversation channel. Other clients listen and show the indicator.
 * The indicator auto-expires after a short silence period.
 */

import { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

export interface TypingPayload {
  user_id: string;
  display_name: string;
}

const TYPING_TIMEOUT_MS = 3500;
const DEBOUNCE_MS = 800;

let channels: Map<string, RealtimeChannel> = new Map();
let sendChannels: Map<string, RealtimeChannel> = new Map();
let typingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
let lastEmit: Map<string, number> = new Map();

function channelName(conversationId: string) {
  return `nexa-typing:${conversationId}`;
}

/**
 * Lazily creates and subscribes a single channel used for *sending* typing
 * events into a conversation. Creating one channel per `send` (which would
 * fall back to the REST broadcast API every time) is wasteful, so we keep a
 * shared sender channel per conversation for the channel's lifetime.
 */
function getSendChannel(conversationId: string): RealtimeChannel {
  let ch = sendChannels.get(conversationId);
  if (!ch) {
    const supabase = getSupabase();
    ch = supabase.channel(channelName(conversationId));
    // `self` defaults to false, so we won't receive our own broadcasts.
    ch.subscribe();
    sendChannels.set(conversationId, ch);
  }
  return ch;
}

/**
 * Subscribe to typing events for a conversation. Returns unsubscribe fn.
 * `onStart` fires when someone starts typing; `onStop` fires when they stop.
 */
export function subscribeToTyping(
  conversationId: string,
  onTyping: (displayName: string) => void,
): () => void {
  const supabase = getSupabase();
  const ch = supabase.channel(channelName(conversationId));

  ch.on('broadcast', { event: 'typing_start' }, (payload) => {
    const data = payload.payload as TypingPayload;
    onTyping(data.display_name);
    // Auto-clear after timeout
    const key = `${conversationId}:${data.user_id}`;
    if (typingTimers.has(key)) clearTimeout(typingTimers.get(key)!);
    typingTimers.set(
      key,
      setTimeout(() => typingTimers.delete(key), TYPING_TIMEOUT_MS),
    );
  });

  ch.on('broadcast', { event: 'typing_stop' }, (payload) => {
    const data = payload.payload as TypingPayload;
    const key = `${conversationId}:${data.user_id}`;
    if (typingTimers.has(key)) {
      clearTimeout(typingTimers.get(key)!);
      typingTimers.delete(key);
    }
  });

  ch.subscribe();

  const existing = channels.get(conversationId);
  if (existing) void existing.unsubscribe();
  channels.set(conversationId, ch);

  return () => {
    void ch.unsubscribe();
    channels.delete(conversationId);
  };
}

/**
 * Broadcast a typing event. Debounced to avoid spamming.
 * Call this on every onChangeText in the composer.
 */
export function emitTypingStart(
  conversationId: string,
  userId: string,
  displayName: string,
): void {
  const now = Date.now();
  const last = lastEmit.get(conversationId) ?? 0;
  if (now - last < DEBOUNCE_MS) return;
  lastEmit.set(conversationId, now);

  void getSendChannel(conversationId).send({
    type: 'broadcast',
    event: 'typing_start',
    payload: { user_id: userId, display_name: displayName } satisfies TypingPayload,
  });
}

/**
 * Broadcast a typing stop event. Call when the user sends a message
 * or clears the input.
 */
export function emitTypingStop(
  conversationId: string,
  userId: string,
  displayName: string,
): void {
  void getSendChannel(conversationId).send({
    type: 'broadcast',
    event: 'typing_stop',
    payload: { user_id: userId, display_name: displayName } satisfies TypingPayload,
  });
}

/**
 * Check if a specific user is currently "typing" in a conversation.
 */
export function isUserTyping(conversationId: string, userId: string): boolean {
  return typingTimers.has(`${conversationId}:${userId}`);
}

/**
 * Cleanup all typing channels (call on logout).
 */
export function cleanupTyping(): void {
  for (const ch of channels.values()) {
    void ch.unsubscribe();
  }
  channels.clear();
  for (const ch of sendChannels.values()) {
    void ch.unsubscribe();
  }
  sendChannels.clear();
  for (const t of typingTimers.values()) clearTimeout(t);
  typingTimers.clear();
  lastEmit.clear();
}

import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { uploadObjectViaXhr } from '@/lib/uploadObject';
import { ConversationInfo, ConversationSummary, MessageRow } from '@/types/database';
import { genUuid as _genUuid, randomToken } from '@/utils/random';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeMessageEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newMessage: MessageRow | null;
  oldMessage: MessageRow | null;
}

export interface MessagingResult<T> {
  data: T | null;
  error: string | null;
}

export function fallbackMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return message || fallback;
}

/** RFC 4122 v4 UUID using the platform CSPRNG (idempotency keys / local ids). */
export { _genUuid as genUuid };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Chat-list summaries for the signed-in user (newest first). */
export async function fetchConversations(): Promise<MessagingResult<ConversationSummary[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_conversations');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your chats.') };
  }
  const rows = ((data as unknown as ConversationSummary[]) ?? []) as ConversationSummary[];
  return { data: rows, error: null };
}

/** Peer info for an open conversation. Empty when the user is not a member. */
export async function fetchConversationInfo(
  conversationId: string,
): Promise<MessagingResult<ConversationInfo | null>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('conversation_info', {
    p_conversation: conversationId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load this conversation.') };
  }
  const rows = ((data as unknown as ConversationInfo[]) ?? []) as ConversationInfo[];
  return { data: rows[0] ?? null, error: null };
}

/** Default page size for message history fetches (keyset by `seq`). */
export const MESSAGE_PAGE_SIZE = 100;

export interface FetchMessagesOptions {
  /** Max rows to return. Defaults to `MESSAGE_PAGE_SIZE`. */
  limit?: number;
  /** Keyset cursor: only messages with `seq` strictly below this are returned. */
  beforeSeq?: number;
}

/** A page of messages in a conversation, oldest first. */
export async function fetchMessages(
  conversationId: string,
  options?: FetchMessagesOptions,
): Promise<MessagingResult<MessageRow[]>> {
  const limit = options?.limit ?? MESSAGE_PAGE_SIZE;
  const supabase = getSupabase();
  if (options?.beforeSeq != null) {
    // Older-than-cursor page: fetch newest-first then reverse for ascending order.
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('seq', options.beforeSeq)
      .order('seq', { ascending: false })
      .limit(limit);
    if (error) {
      return { data: null, error: fallbackMessage(error, 'Could not load messages.') };
    }
    return { data: ((data as MessageRow[]) ?? []).reverse(), error: null };
  }
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: true })
    .limit(limit);
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load messages.') };
  }
  return { data: (data ?? []) as MessageRow[], error: null };
}

/** A single message row (used after sending to adopt the canonical row). */
export async function fetchMessageById(
  messageId: string,
): Promise<MessagingResult<MessageRow | null>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the message.') };
  }
  return { data: (data ?? null) as MessageRow | null, error: null };
}

// ---------------------------------------------------------------------------
// Mutations (all server-authoritative via RPC)
// ---------------------------------------------------------------------------

/** Ensures a 1:1 conversation with `userId` exists and returns its id. */
export async function startConversationWith(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('start_conversation', { p_other: userId });
  if (error) {
    return error instanceof Error ? error.message : 'Could not open a chat with this user.';
  }
  return data ?? null;
}

/** Sends a message and returns its new id (null carries the error text). */
export async function sendMessage(
  conversationId: string,
  body: string,
  replyToId?: string | null,
  clientId?: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_conversation: string;
    p_body: string;
    p_reply_to?: string;
    p_client_id?: string;
  } = { p_conversation: conversationId, p_body: body };
  if (replyToId) {
    args.p_reply_to = replyToId;
  }
  if (clientId) {
    args.p_client_id = clientId;
  }
  const { data, error } = await supabase.rpc('send_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your message could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

/** Marks delivered/read. Returns a friendly error string or null on success. */
export async function markMessagesDelivered(conversationId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_messages_delivered', {
    p_conversation: conversationId,
  });
  return error ? fallbackMessage(error, 'Could not update the message status.') : null;
}

export async function markMessagesRead(conversationId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_messages_read', { p_conversation: conversationId });
  return error ? fallbackMessage(error, 'Could not update the message status.') : null;
}

export async function deleteMessage(messageId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_message', { p_message: messageId });
  return error ? fallbackMessage(error, 'Could not delete the message.') : null;
}

// ---------------------------------------------------------------------------
// Media (photos, videos, voice notes)
// ---------------------------------------------------------------------------

/** Private storage bucket that holds message attachments. */
export const MESSAGE_MEDIA_BUCKET = 'message-attachments';

export type MediaKind = 'image' | 'video' | 'voice';

export interface MediaUploadInput {
  kind: MediaKind;
  mimeType: string;
  /** Local file uri on the device. */
  uri: string;
  /** Playback duration in seconds (video/voice). */
  durationSeconds?: number;
  /** File size in bytes when known. */
  sizeBytes?: number;
  width?: number;
  height?: number;
}

/** Storage object path: "<conversationId>/<senderId>/<ts>-<rand>-<file>". */
export function buildMediaPath(
  conversationId: string,
  senderId: string,
  fileName: string,
): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = randomToken(4);
  return `${conversationId}/${senderId}/${Date.now()}-${rand}-${safe}`;
}

export function isMediaKind(value: string | null | undefined): value is MediaKind {
  return value === 'image' || value === 'video' || value === 'voice';
}

/**
 * Uploads a media file into the caller's folder inside the conversation's
 * storage path. Returns an error string on failure, null on success.
 * The object is placed before `sendMediaMessage` so the RPC can verify it.
 */
export async function uploadMessageMedia(
  objectPath: string,
  input: MediaUploadInput,
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return 'You need to be signed in to send media.';
  }
  try {
    await uploadObjectViaXhr({
      bucket: MESSAGE_MEDIA_BUCKET,
      objectPath,
      uri: input.uri,
      mimeType: input.mimeType,
      accessToken,
      onProgress,
    });
    return null;
  } catch (err) {
    return fallbackMessage(err, 'Upload failed. Please try again.');
  }
}

export interface SentMediaPayload {
  kind: MediaKind;
  path: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

/** Registers an already-uploaded attachment as a message. Returns its id. */
export async function sendMediaMessage(
  conversationId: string,
  media: SentMediaPayload,
  caption: string,
  replyToId?: string | null,
  clientId?: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_conversation: string;
    p_media_path: string;
    p_mime: string;
    p_type: string;
    p_caption?: string;
    p_reply_to?: string;
    p_width?: number;
    p_height?: number;
    p_duration?: number;
    p_size?: number;
    p_client_id?: string;
  } = {
    p_conversation: conversationId,
    p_media_path: media.path,
    p_mime: media.mimeType,
    p_type: media.kind,
  };
  if (clientId) {
    args.p_client_id = clientId;
  }
  if (caption) {
    args.p_caption = caption;
  }
  if (replyToId) {
    args.p_reply_to = replyToId;
  }
  if (media.width != null) {
    args.p_width = media.width;
  }
  if (media.height != null) {
    args.p_height = media.height;
  }
  if (media.durationSeconds != null) {
    args.p_duration = media.durationSeconds;
  }
  if (media.sizeBytes != null) {
    args.p_size = media.sizeBytes;
  }
  const { data, error } = await supabase.rpc('send_media_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your media could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

/** Max signed-URL cache entries; evicted oldest-first to bound memory. */
const MEDIA_URL_CACHE_MAX = 200;
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Bounded signed-URL cache insert (oldest-first eviction) shared by resolvers. */
export function cacheSignedUrl(
  cache: Map<string, { url: string; expiresAt: number }>,
  key: string,
  value: { url: string; expiresAt: number },
): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MEDIA_URL_CACHE_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done) {
      break;
    }
    cache.delete(oldest.value);
  }
}

/**
 * Resolves the short-lived signed URL for a media message. Access is enforced
 * by the storage.objects SELECT policy (conversation membership). URLs are
 * cached for ~45s (the backend signs them for 60s) and re-requested afterwards.
 */
export async function resolveMediaUrl(
  messageId: string,
  mediaPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = mediaUrlCache.get(messageId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  if (cached) {
    mediaUrlCache.delete(messageId);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .createSignedUrl(mediaPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The media is no longer available.') };
  }
  if (data?.signedUrl) {
    cacheSignedUrl(mediaUrlCache, messageId, {
      url: data.signedUrl,
      expiresAt: Date.now() + 45_000,
    });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The media is no longer available.' };
}

export async function reactToMessage(messageId: string, emoji: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('react_to_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not add the reaction.') : null;
}

export async function unreactToMessage(messageId: string, emoji: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('unreact_to_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not remove the reaction.') : null;
}

// ---------------------------------------------------------------------------
// Realtime (single underlying channels, many listeners)
// ---------------------------------------------------------------------------

type Listener<T> = (payload: T) => void;

const messageListeners = new Set<Listener<RealtimeMessageEvent>>();
const conversationListeners = new Set<Listener<RealtimePostgresChangesPayload<Record<string, unknown>>>>();
const statusListeners = new Set<Listener<RealtimeStatus>>();

let messagesChannel: RealtimeChannel | null = null;
let conversationsChannel: RealtimeChannel | null = null;

const channelStatus: Record<'messages' | 'conversations', RealtimeStatus> = {
  messages: 'disconnected',
  conversations: 'disconnected',
};

function publishStatus() {
  const values = Object.values(channelStatus);
  let next: RealtimeStatus = 'connected';
  if (values.some((s) => s === 'error')) {
    next = 'error';
  } else if (values.some((s) => s === 'connecting')) {
    next = 'connecting';
  } else if (!values.some((s) => s === 'connected')) {
    next = 'disconnected';
  }
  for (const listener of statusListeners) {
    listener(next);
  }
}

function recordStatus(key: 'messages' | 'conversations', raw: string) {
  const map: Record<string, RealtimeStatus> = {
    SUBSCRIBED: 'connected',
    TIMED_OUT: 'error',
    CHANNEL_ERROR: 'error',
    CLOSED: 'disconnected',
  };
  channelStatus[key] = map[raw] ?? 'disconnected';
  publishStatus();
}

function ensureMessagesChannel() {
  if (messagesChannel || messageListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  channelStatus.messages = 'connecting';
  publishStatus();
  messagesChannel = supabase
    .channel('nexa-realtime-messages')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const event: RealtimeMessageEvent = {
          eventType: (payload.eventType ?? 'UPDATE') as RealtimeMessageEvent['eventType'],
          newMessage: (payload.new ?? null) as MessageRow | null,
          oldMessage: (payload.old ?? null) as MessageRow | null,
        };
        for (const listener of messageListeners) {
          listener(event);
        }
      },
    )
    .subscribe((status) => recordStatus('messages', status));
}

function ensureConversationsChannel() {
  if (conversationsChannel || conversationListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  channelStatus.conversations = 'connecting';
  publishStatus();
  conversationsChannel = supabase
    .channel('nexa-realtime-conversations')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of conversationListeners) {
          listener(payload);
        }
      },
    )
    .subscribe((status) => recordStatus('conversations', status));
}

function teardownMessageChannel() {
  if (!messagesChannel) {
    return;
  }
  messagesChannel.unsubscribe();
  messagesChannel = null;
  channelStatus.messages = 'disconnected';
  publishStatus();
}

function teardownConversationsChannel() {
  if (!conversationsChannel) {
    return;
  }
  conversationsChannel.unsubscribe();
  conversationsChannel = null;
  channelStatus.conversations = 'disconnected';
  publishStatus();
}

/** Subscribe to all message events the current user may see. Returns an unsubscribe fn. */
export function subscribeToMessages(listener: Listener<RealtimeMessageEvent>): () => void {
  messageListeners.add(listener);
  ensureMessagesChannel();
  return () => {
    messageListeners.delete(listener);
    if (messageListeners.size === 0) {
      teardownMessageChannel();
    }
  };
}

/** Subscribe to conversation changes (new conversations, activity bumps). */
export function subscribeToConversations(
  listener: Listener<RealtimePostgresChangesPayload<Record<string, unknown>>>,
): () => void {
  conversationListeners.add(listener);
  ensureConversationsChannel();
  return () => {
    conversationListeners.delete(listener);
    if (conversationListeners.size === 0) {
      teardownConversationsChannel();
    }
  };
}

/** Subscribe to overall realtime connection status. */
export function subscribeToRealtimeStatus(listener: Listener<RealtimeStatus>): () => void {
  statusListeners.add(listener);
  listener(publishStatusValue());
  return () => {
    statusListeners.delete(listener);
  };
}

function publishStatusValue(): RealtimeStatus {
  const values = Object.values(channelStatus);
  const order: RealtimeStatus[] = ['error', 'connecting', 'connected', 'disconnected'];
  for (const candidate of order) {
    if (values.includes(candidate)) {
      return candidate;
    }
  }
  return 'disconnected';
}
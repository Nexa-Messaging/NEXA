import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { uploadObjectViaXhr } from '@/lib/uploadObject';
import {
  GroupChatInfo,
  GroupChatSummary,
  GroupMemberInfo,
  GroupMessageFeed,
  GroupMessageRow,
} from '@/types/database';

/** Private bucket that holds group chat photos, path "<chatId>/<file>". */
export const GROUP_AVATARS_BUCKET = 'group-avatars';

/** Private bucket that holds group media, path "<chatId>/<senderId>/<file>". */
export const GROUP_MEDIA_BUCKET = 'group-attachments';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupResult<T> {
  data: T | null;
  error: string | null;
}

/** Storage object path: "<chatId>/<senderId>/<ts>-<rand>-<safeFileName>". */
export function buildGroupMediaPath(chatId: string, senderId: string, fileName: string): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${chatId}/${senderId}/${Date.now()}-${rand}-${safe}`;
}

/** Storage object path for a group photo: "<chatId>/<timestamp>-avatar". */
export function buildGroupAvatarPath(chatId: string): string {
  return `${chatId}/${Date.now()}-avatar`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Group chat summaries for the signed-in user (newest first). */
export async function fetchGroupChats(): Promise<GroupResult<GroupChatSummary[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_group_chats');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your groups.') };
  }
  return { data: ((data as unknown as GroupChatSummary[]) ?? []) as GroupChatSummary[], error: null };
}

/** Header info for an open group chat. Empty when the caller is not a member. */
export async function fetchGroupChatInfo(
  chatId: string,
): Promise<GroupResult<GroupChatInfo | null>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('group_chat_info', { p_chat: chatId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load this group.') };
  }
  const rows = ((data as unknown as GroupChatInfo[]) ?? []) as GroupChatInfo[];
  return { data: rows[0] ?? null, error: null };
}

/** Members (with profiles) of a group. Empty when the caller is not a member. */
export async function fetchGroupMembers(chatId: string): Promise<GroupResult<GroupMemberInfo[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('group_members_list', { p_chat: chatId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the members.') };
  }
  return { data: ((data as unknown as GroupMemberInfo[]) ?? []) as GroupMemberInfo[], error: null };
}

/** Messages of a group, oldest first, with sender profile info. */
export async function fetchGroupMessages(chatId: string): Promise<GroupResult<GroupMessageFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_group_messages', { p_chat: chatId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load messages.') };
  }
  return {
    data: ((data as unknown as GroupMessageFeed[]) ?? []) as GroupMessageFeed[],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Mutations (all server-authoritative via RPC)
// ---------------------------------------------------------------------------

export async function createGroup(
  name: string,
  memberIds: string[],
): Promise<{ ok: true; chatId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_member_ids: memberIds,
  });
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'The group could not be created.') };
  }
  return { ok: true, chatId: data as string };
}

export async function sendGroupMessage(
  chatId: string,
  body: string,
  replyToId?: string | null,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args = replyToId
    ? { p_chat: chatId, p_body: body, p_reply_to: replyToId }
    : { p_chat: chatId, p_body: body };
  const { data, error } = await supabase.rpc('send_group_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your message could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

export async function markGroupRead(chatId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_group_read', { p_chat: chatId });
  return error ? fallbackMessage(error, 'Could not update the group status.') : null;
}

export async function deleteGroupMessage(messageId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_group_message', { p_message: messageId });
  return error ? fallbackMessage(error, 'Could not delete the message.') : null;
}

export async function reactToGroupMessage(messageId: string, emoji: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('react_to_group_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not add the reaction.') : null;
}

export async function unreactToGroupMessage(
  messageId: string,
  emoji: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('unreact_to_group_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not remove the reaction.') : null;
}

export async function addGroupMembers(
  chatId: string,
  memberIds: string[],
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('add_group_members', {
    p_chat: chatId,
    p_member_ids: memberIds,
  });
  return error ? fallbackMessage(error, 'Could not add the members.') : null;
}

export async function removeGroupMember(chatId: string, userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('remove_group_member', {
    p_chat: chatId,
    p_member: userId,
  });
  return error ? fallbackMessage(error, 'Could not remove the member.') : null;
}

export async function setGroupMemberRole(
  chatId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('set_group_member_role', {
    p_chat: chatId,
    p_member: userId,
    p_role: role,
  });
  return error ? fallbackMessage(error, 'Could not change the member role.') : null;
}

export async function renameGroup(chatId: string, name: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('rename_group', { p_chat: chatId, p_name: name });
  return error ? fallbackMessage(error, 'Could not rename the group.') : null;
}

export async function setGroupAvatar(chatId: string, avatarPath: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('set_group_avatar', {
    p_chat: chatId,
    p_avatar_path: avatarPath,
  });
  return error ? fallbackMessage(error, 'Could not update the group photo.') : null;
}

export async function leaveGroup(chatId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('leave_group', { p_chat: chatId });
  return error ? fallbackMessage(error, 'Could not leave the group.') : null;
}

export async function deleteGroup(chatId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_group', { p_chat: chatId });
  return error ? fallbackMessage(error, 'Could not delete the group.') : null;
}

// ---------------------------------------------------------------------------
// Media (uploads + signed URLs)
// ---------------------------------------------------------------------------

/**
 * Uploads a group media file into the caller's folder inside the group's
 * storage path. Returns an error string on failure, null on success. The object
 * is placed before `sendGroupMediaMessage` so the RPC can verify it.
 */
export async function uploadGroupMedia(
  objectPath: string,
  input: {
    kind: 'image' | 'video' | 'voice';
    mimeType: string;
    uri: string;
    durationSeconds?: number;
    sizeBytes?: number;
    width?: number;
    height?: number;
  },
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
      bucket: GROUP_MEDIA_BUCKET,
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

export interface SentGroupMediaPayload {
  kind: 'image' | 'video' | 'voice';
  path: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

/** Registers an already-uploaded attachment as a group message. Returns its id. */
export async function sendGroupMediaMessage(
  chatId: string,
  media: SentGroupMediaPayload,
  caption: string,
  replyToId?: string | null,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_chat: string;
    p_media_path: string;
    p_mime: string;
    p_type: string;
    p_caption?: string;
    p_reply_to?: string;
    p_width?: number;
    p_height?: number;
    p_duration?: number;
    p_size?: number;
  } = {
    p_chat: chatId,
    p_media_path: media.path,
    p_mime: media.mimeType,
    p_type: media.kind,
  };
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
  const { data, error } = await supabase.rpc('send_group_media_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your media could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

/**
 * Uploads a group photo into the group's avatar folder. Admin/owner only — the
 * storage policy enforces the role at upload time.
 */
export async function uploadGroupAvatar(
  objectPath: string,
  uri: string,
  mimeType: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return 'You need to be signed in to change the group photo.';
  }
  try {
    await uploadObjectViaXhr({
      bucket: GROUP_AVATARS_BUCKET,
      objectPath,
      uri,
      mimeType,
      accessToken,
    });
    return null;
  } catch (err) {
    return fallbackMessage(err, 'Upload failed. Please try again.');
  }
}

const groupMediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
const groupAvatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a short-lived signed URL for a group media message. Access is
 * enforced by the storage.objects SELECT policy (group membership). Cached.
 */
export async function resolveGroupMediaUrl(
  messageId: string,
  mediaPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = groupMediaUrlCache.get(messageId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(GROUP_MEDIA_BUCKET)
    .createSignedUrl(mediaPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The media is no longer available.') };
  }
  if (data?.signedUrl) {
    groupMediaUrlCache.set(messageId, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The media is no longer available.' };
}

/**
 * Resolves a short-lived signed URL for a group photo (keyed by the object
 * path, so it also evicts when the photo is replaced).
 */
export async function resolveGroupAvatarUrl(
  avatarPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = groupAvatarUrlCache.get(avatarPath);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(GROUP_AVATARS_BUCKET)
    .createSignedUrl(avatarPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The photo is no longer available.') };
  }
  if (data?.signedUrl) {
    groupAvatarUrlCache.set(avatarPath, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The photo is no longer available.' };
}

// ---------------------------------------------------------------------------
// Realtime (one channel per table, many listeners)
// ---------------------------------------------------------------------------

export interface GroupRealtimeMessageEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newMessage: GroupMessageRow | null;
  oldMessage: GroupMessageRow | null;
}

type GroupChangeListener<T> = (payload: T) => void;

const groupMessageListeners = new Set<GroupChangeListener<GroupRealtimeMessageEvent>>();
const groupChatListeners = new Set<
  GroupChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>
>();
const groupMemberListeners = new Set<
  GroupChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>
>();

let groupMessagesChannel: RealtimeChannel | null = null;
let groupChatsChannel: RealtimeChannel | null = null;
let groupMembersChannel: RealtimeChannel | null = null;

function ensureGroupMessagesChannel() {
  if (groupMessagesChannel || groupMessageListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  groupMessagesChannel = supabase
    .channel('nexa-realtime-group-messages')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_messages' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const event: GroupRealtimeMessageEvent = {
          eventType: (payload.eventType ?? 'UPDATE') as GroupRealtimeMessageEvent['eventType'],
          newMessage: (payload.new ?? null) as GroupMessageRow | null,
          oldMessage: (payload.old ?? null) as GroupMessageRow | null,
        };
        for (const listener of groupMessageListeners) {
          listener(event);
        }
      },
    )
    .subscribe();
}

function ensureGroupChatsChannel() {
  if (groupChatsChannel || groupChatListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  groupChatsChannel = supabase
    .channel('nexa-realtime-group-chats')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_chats' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of groupChatListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function ensureGroupMembersChannel() {
  if (groupMembersChannel || groupMemberListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  groupMembersChannel = supabase
    .channel('nexa-realtime-group-members')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_members' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of groupMemberListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function teardownGroupMessagesChannel() {
  if (!groupMessagesChannel) {
    return;
  }
  groupMessagesChannel.unsubscribe();
  groupMessagesChannel = null;
}

function teardownGroupChatsChannel() {
  if (!groupChatsChannel) {
    return;
  }
  groupChatsChannel.unsubscribe();
  groupChatsChannel = null;
}

function teardownGroupMembersChannel() {
  if (!groupMembersChannel) {
    return;
  }
  groupMembersChannel.unsubscribe();
  groupMembersChannel = null;
}

/** Subscribe to group message events the current user may see. */
export function subscribeToGroupMessages(
  listener: GroupChangeListener<GroupRealtimeMessageEvent>,
): () => void {
  groupMessageListeners.add(listener);
  ensureGroupMessagesChannel();
  return () => {
    groupMessageListeners.delete(listener);
    if (groupMessageListeners.size === 0) {
      teardownGroupMessagesChannel();
    }
  };
}

/** Subscribe to group chat changes (renames, photos, deletions). */
export function subscribeToGroupChats(
  listener: GroupChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>,
): () => void {
  groupChatListeners.add(listener);
  ensureGroupChatsChannel();
  return () => {
    groupChatListeners.delete(listener);
    if (groupChatListeners.size === 0) {
      teardownGroupChatsChannel();
    }
  };
}

/** Subscribe to group member changes (additions, removals, role changes). */
export function subscribeToGroupMembers(
  listener: GroupChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>,
): () => void {
  groupMemberListeners.add(listener);
  ensureGroupMembersChannel();
  return () => {
    groupMemberListeners.delete(listener);
    if (groupMemberListeners.size === 0) {
      teardownGroupMembersChannel();
    }
  };
}
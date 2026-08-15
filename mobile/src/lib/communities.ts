import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { uploadObjectViaXhr } from '@/lib/uploadObject';
import {
  ClassmateInfo,
  CommunityChannelInfo,
  CommunityChannelSummary,
  CommunityInfo,
  CommunityListEntry,
  CommunityMemberInfo,
  CommunityMessageFeed,
  CommunityMessageRow,
  CommunityRole,
} from '@/types/database';

import { randomToken } from '@/utils/random';

/** Private bucket that holds community photos, path "<communityId>/<file>". */
export const COMMUNITY_AVATARS_BUCKET = 'community-avatars';

/** Private bucket that holds community media, path "<communityId>/<senderId>/<file>". */
export const COMMUNITY_MEDIA_BUCKET = 'community-attachments';

export interface CommunityResult<T> {
  data: T | null;
  error: string | null;
}

export type CommunityKind = 'general' | 'academics' | 'announcements' | 'social';

/** Storage object path: "<communityId>/<senderId>/<ts>-<rand>-<safeFileName>". */
export function buildCommunityMediaPath(
  communityId: string,
  senderId: string,
  fileName: string,
): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = randomToken(4);
  return `${communityId}/${senderId}/${Date.now()}-${rand}-${safe}`;
}

/** Storage object path for a community photo: "<communityId>/<timestamp>-avatar". */
export function buildCommunityAvatarPath(communityId: string): string {
  return `${communityId}/${Date.now()}-avatar`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Communities the user belongs to, plus matching class communities (newest first). */
export async function fetchCommunities(): Promise<CommunityResult<CommunityListEntry[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_communities');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your communities.') };
  }
  return {
    data: ((data as unknown as CommunityListEntry[]) ?? []) as CommunityListEntry[],
    error: null,
  };
}

/** Header info for an open community. Empty when the caller is not a member. */
export async function fetchCommunityInfo(
  communityId: string,
): Promise<CommunityResult<CommunityInfo | null>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('community_info', { p_community: communityId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load this community.') };
  }
  const rows = ((data as unknown as CommunityInfo[]) ?? []) as CommunityInfo[];
  return { data: rows[0] ?? null, error: null };
}

/** Members (with profiles) of a community. Empty when the caller is not a member. */
export async function fetchCommunityMembers(
  communityId: string,
): Promise<CommunityResult<CommunityMemberInfo[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_community_members', {
    p_community: communityId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the members.') };
  }
  return {
    data: ((data as unknown as CommunityMemberInfo[]) ?? []) as CommunityMemberInfo[],
    error: null,
  };
}

/** Classmates who are not yet members, for the admin "add members" picker. */
export async function fetchClassmates(
  communityId: string,
): Promise<CommunityResult<ClassmateInfo[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_class_users', { p_community: communityId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your classmates.') };
  }
  return { data: ((data as unknown as ClassmateInfo[]) ?? []) as ClassmateInfo[], error: null };
}

/** Channels of a community with previews and unread counts. */
export async function fetchCommunityChannels(
  communityId: string,
): Promise<CommunityResult<CommunityChannelSummary[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_community_channels', {
    p_community: communityId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the channels.') };
  }
  return {
    data: ((data as unknown as CommunityChannelSummary[]) ?? []) as CommunityChannelSummary[],
    error: null,
  };
}

/** Context (community, my role, permissions) for an open channel. */
export async function fetchChannelInfo(
  channelId: string,
): Promise<CommunityResult<CommunityChannelInfo | null>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('channel_info', { p_channel: channelId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load this channel.') };
  }
  const rows = ((data as unknown as CommunityChannelInfo[]) ?? []) as CommunityChannelInfo[];
  return { data: rows[0] ?? null, error: null };
}

/** Messages of a channel, oldest first, with sender profile info. */
export async function fetchChannelMessages(
  channelId: string,
): Promise<CommunityResult<CommunityMessageFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_channel_messages', { p_channel: channelId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load messages.') };
  }
  return {
    data: ((data as unknown as CommunityMessageFeed[]) ?? []) as CommunityMessageFeed[],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Mutations (all server-authoritative via RPC)
// ---------------------------------------------------------------------------

/** Joins the caller's class community, creating it when none exists yet. */
export async function joinMyClassCommunity(): Promise<
  { ok: true; communityId: string } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('join_my_class_community');
  if (error) {
    return {
      ok: false,
      error: fallbackMessage(error, 'Your class community could not be joined.'),
    };
  }
  return { ok: true, communityId: data as string };
}

/** Joins a specific community (profile class must match). */
export async function joinCommunity(communityId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('join_community', { p_community: communityId });
  return error ? fallbackMessage(error, 'Could not join this community.') : null;
}

export async function sendCommunityMessage(
  channelId: string,
  body: string,
  replyToId?: string | null,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args = replyToId
    ? { p_channel: channelId, p_body: body, p_reply_to: replyToId }
    : { p_channel: channelId, p_body: body };
  const { data, error } = await supabase.rpc('send_community_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your message could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

export async function markChannelRead(channelId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_channel_read', { p_channel: channelId });
  return error ? fallbackMessage(error, 'Could not update the channel status.') : null;
}

export async function deleteCommunityMessage(messageId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_community_message', { p_message: messageId });
  return error ? fallbackMessage(error, 'Could not delete the message.') : null;
}

export async function editCommunityMessage(messageId: string, body: string): Promise<string | null> {
  const supabase = getSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('edit_community_message', {
    p_message: messageId,
    p_body: body,
  });
  return error ? fallbackMessage(error, 'Could not edit the message.') : null;
}

export async function reactToCommunityMessage(
  messageId: string,
  emoji: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('react_to_community_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not add the reaction.') : null;
}

export async function unreactToCommunityMessage(
  messageId: string,
  emoji: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('unreact_to_community_message', {
    p_message: messageId,
    p_emoji: emoji,
  });
  return error ? fallbackMessage(error, 'Could not remove the reaction.') : null;
}

export async function addCommunityMembers(
  communityId: string,
  memberIds: string[],
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('add_community_members', {
    p_community: communityId,
    p_member_ids: memberIds,
  });
  return error ? fallbackMessage(error, 'Could not add the members.') : null;
}

export async function removeCommunityMember(
  communityId: string,
  userId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('remove_community_member', {
    p_community: communityId,
    p_member: userId,
  });
  return error ? fallbackMessage(error, 'Could not remove the member.') : null;
}

export async function setCommunityMemberRole(
  communityId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('set_community_role', {
    p_community: communityId,
    p_member: userId,
    p_role: role,
  });
  return error ? fallbackMessage(error, 'Could not change the member role.') : null;
}

export async function updateCommunitySettings(
  communityId: string,
  name?: string,
  description?: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const args: { p_community: string; p_name?: string; p_description?: string } = {
    p_community: communityId,
  };
  if (name != null) {
    args.p_name = name;
  }
  const { error } = await supabase.rpc('update_community_settings', {
    ...args,
    p_description: description,
  });
  return error ? fallbackMessage(error, 'Could not update the community settings.') : null;
}

export async function setCommunityAvatar(
  communityId: string,
  avatarPath: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('set_community_avatar', {
    p_community: communityId,
    p_avatar_path: avatarPath,
  });
  return error ? fallbackMessage(error, 'Could not update the community photo.') : null;
}

export async function leaveCommunity(communityId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('leave_community', { p_community: communityId });
  return error ? fallbackMessage(error, 'Could not leave the community.') : null;
}

export async function deleteCommunity(communityId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_community', { p_community: communityId });
  return error ? fallbackMessage(error, 'Could not delete the community.') : null;
}

// ---------------------------------------------------------------------------
// Media (uploads + signed URLs)
// ---------------------------------------------------------------------------

/**
 * Uploads a community media file into the caller's folder inside the community's
 * storage path. Returns an error string on failure, null on success. The object
 * is placed before `sendCommunityMediaMessage` so the RPC can verify it.
 */
export async function uploadCommunityMedia(
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
      bucket: COMMUNITY_MEDIA_BUCKET,
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

export interface SentCommunityMediaPayload {
  kind: 'image' | 'video' | 'voice';
  path: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

/** Registers an already-uploaded attachment as a channel message. Returns its id. */
export async function sendCommunityMediaMessage(
  channelId: string,
  media: SentCommunityMediaPayload,
  caption: string,
  replyToId?: string | null,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_channel: string;
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
    p_channel: channelId,
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
  const { data, error } = await supabase.rpc('send_community_media_message', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your media could not be sent.') };
  }
  return { ok: true, messageId: data as string };
}

/**
 * Uploads a community photo into the community's avatar folder. Admin/owner
 * only — the storage policy enforces the role at upload time.
 */
export async function uploadCommunityAvatar(
  objectPath: string,
  uri: string,
  mimeType: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return 'You need to be signed in to change the community photo.';
  }
  try {
    await uploadObjectViaXhr({
      bucket: COMMUNITY_AVATARS_BUCKET,
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

const communityMediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
const communityAvatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a short-lived signed URL for a community media message. Access is
 * enforced by the storage.objects SELECT policy (community membership). Cached.
 */
export async function resolveCommunityMediaUrl(
  messageId: string,
  mediaPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = communityMediaUrlCache.get(messageId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(COMMUNITY_MEDIA_BUCKET)
    .createSignedUrl(mediaPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The media is no longer available.') };
  }
  if (data?.signedUrl) {
    communityMediaUrlCache.set(messageId, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The media is no longer available.' };
}

/**
 * Resolves a short-lived signed URL for a community photo (keyed by the object
 * path, so it also evicts when the photo is replaced).
 */
export async function resolveCommunityAvatarUrl(
  avatarPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = communityAvatarUrlCache.get(avatarPath);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(COMMUNITY_AVATARS_BUCKET)
    .createSignedUrl(avatarPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The photo is no longer available.') };
  }
  if (data?.signedUrl) {
    communityAvatarUrlCache.set(avatarPath, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The photo is no longer available.' };
}

// ---------------------------------------------------------------------------
// Realtime (one channel per table, many listeners)
// ---------------------------------------------------------------------------

export interface CommunityRealtimeMessageEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newMessage: CommunityMessageRow | null;
  oldMessage: CommunityMessageRow | null;
}

type CommunityChangeListener<T> = (payload: T) => void;

const communityMessageListeners = new Set<CommunityChangeListener<CommunityRealtimeMessageEvent>>();
const communityListeners = new Set<
  CommunityChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>
>();
const communityMemberListeners = new Set<
  CommunityChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>
>();

let communityMessagesChannel: RealtimeChannel | null = null;
let communitiesChannel: RealtimeChannel | null = null;
let communityMembersChannel: RealtimeChannel | null = null;

function ensureCommunityMessagesChannel() {
  if (communityMessagesChannel || communityMessageListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  communityMessagesChannel = supabase
    .channel('nexa-realtime-community-messages')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_messages' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const event: CommunityRealtimeMessageEvent = {
          eventType: (payload.eventType ?? 'UPDATE') as CommunityRealtimeMessageEvent['eventType'],
          newMessage: (payload.new ?? null) as CommunityMessageRow | null,
          oldMessage: (payload.old ?? null) as CommunityMessageRow | null,
        };
        for (const listener of communityMessageListeners) {
          listener(event);
        }
      },
    )
    .subscribe();
}

function ensureCommunitiesChannel() {
  if (communitiesChannel || communityListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  communitiesChannel = supabase
    .channel('nexa-realtime-communities')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'communities' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of communityListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function ensureCommunityMembersChannel() {
  if (communityMembersChannel || communityMemberListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  communityMembersChannel = supabase
    .channel('nexa-realtime-community-members')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_members' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of communityMemberListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function teardownCommunityMessagesChannel() {
  if (!communityMessagesChannel) {
    return;
  }
  communityMessagesChannel.unsubscribe();
  communityMessagesChannel = null;
}

function teardownCommunitiesChannel() {
  if (!communitiesChannel) {
    return;
  }
  communitiesChannel.unsubscribe();
  communitiesChannel = null;
}

function teardownCommunityMembersChannel() {
  if (!communityMembersChannel) {
    return;
  }
  communityMembersChannel.unsubscribe();
  communityMembersChannel = null;
}

/** Subscribe to community message events the current user may see. */
export function subscribeToCommunityMessages(
  listener: CommunityChangeListener<CommunityRealtimeMessageEvent>,
): () => void {
  communityMessageListeners.add(listener);
  ensureCommunityMessagesChannel();
  return () => {
    communityMessageListeners.delete(listener);
    if (communityMessageListeners.size === 0) {
      teardownCommunityMessagesChannel();
    }
  };
}

/** Subscribe to community changes (renames, photos, deletions). */
export function subscribeToCommunities(
  listener: CommunityChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>,
): () => void {
  communityListeners.add(listener);
  ensureCommunitiesChannel();
  return () => {
    communityListeners.delete(listener);
    if (communityListeners.size === 0) {
      teardownCommunitiesChannel();
    }
  };
}

/** Subscribe to community member changes (additions, removals, role changes). */
export function subscribeToCommunityMembers(
  listener: CommunityChangeListener<RealtimePostgresChangesPayload<Record<string, unknown>>>,
): () => void {
  communityMemberListeners.add(listener);
  ensureCommunityMembersChannel();
  return () => {
    communityMemberListeners.delete(listener);
    if (communityMemberListeners.size === 0) {
      teardownCommunityMembersChannel();
    }
  };
}

/** Mapped role helper: exposed for admin panels to compare roles. */
export function isCommunityAdmin(role: CommunityRole | string | null | undefined): boolean {
  return role === 'admin' || role === 'owner';
}
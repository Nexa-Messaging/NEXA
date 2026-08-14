import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { uploadObjectViaXhr } from '@/lib/uploadObject';
import { StoryFeedRow, StoryReplyFeed, StoryViewer } from '@/types/database';

/** Private bucket that holds story media, path "<userId>/<timestamp>-<file>". */
export const STORIES_BUCKET = 'stories-media';

export type StoryKind = 'photo' | 'video' | 'text';

export interface StoryResult<T> {
  data: T | null;
  error: string | null;
}

/** Storage object path: "<userId>/<ts>-<rand>-<safeFileName>". */
export function buildStoryPath(userId: string, fileName: string): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${userId}/${Date.now()}-${rand}-${safe}`;
}

export interface StoryUploadInput {
  kind: 'image' | 'video';
  mimeType: string;
  /** Local file uri on the device. */
  uri: string;
  /** Playback duration in seconds (video only). */
  durationSeconds?: number;
  /** File size in bytes when known. */
  sizeBytes?: number;
  width?: number;
  height?: number;
}

/** Uploads story media into the caller's own folder. Error string or null. */
export async function uploadStoryMedia(
  objectPath: string,
  input: StoryUploadInput,
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return 'You need to be signed in to post a story.';
  }
  try {
    await uploadObjectViaXhr({
      bucket: STORIES_BUCKET,
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

export interface StoryDraft {
  kind: StoryKind;
  /** Present for photo/video stories (uploaded before the row is created). */
  media?: StoryUploadInput & { path: string };
  /** Caption (media) or story text (text stories). */
  body?: string;
  /** Lifetime override in seconds (defaults to 24h). Clamped server-side. */
  lifetimeSeconds?: number;
}

/** Posts a story, returns its id. */
export async function postStory(
  draft: StoryDraft,
): Promise<{ ok: true; storyId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_kind: string;
    p_media_path?: string;
    p_mime?: string;
    p_width?: number;
    p_height?: number;
    p_duration?: number;
    p_size?: number;
    p_body?: string;
    p_lifetime_seconds?: number;
  } = { p_kind: draft.kind };
  if (draft.media) {
    args.p_media_path = draft.media.path;
    args.p_mime = draft.media.mimeType;
    if (draft.media.width != null) {
      args.p_width = draft.media.width;
    }
    if (draft.media.height != null) {
      args.p_height = draft.media.height;
    }
    if (draft.media.durationSeconds != null) {
      args.p_duration = draft.media.durationSeconds;
    }
    if (draft.media.sizeBytes != null) {
      args.p_size = draft.media.sizeBytes;
    }
  }
  if (draft.body) {
    args.p_body = draft.body;
  }
  if (draft.lifetimeSeconds != null) {
    args.p_lifetime_seconds = draft.lifetimeSeconds;
  }
  const { data, error } = await supabase.rpc('create_story', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your story could not be posted.') };
  }
  return { ok: true, storyId: data as string };
}

/** Active stories the caller may see (own + friends), with profile + view info. */
export async function fetchStories(): Promise<StoryResult<StoryFeedRow[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_stories');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load stories.') };
  }
  return { data: ((data as unknown as StoryFeedRow[]) ?? []) as StoryFeedRow[], error: null };
}

/** Marks a story as viewed by the caller. Error text or null on success. */
export async function recordStoryView(storyId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('record_story_view', { p_story: storyId });
  return error ? fallbackMessage(error, 'Could not record the view.') : null;
}

export async function reactToStory(storyId: string, emoji: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('react_to_story', { p_story: storyId, p_emoji: emoji });
  return error ? fallbackMessage(error, 'Could not add the reaction.') : null;
}

export async function removeStoryReaction(storyId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('remove_story_reaction', { p_story: storyId });
  return error ? fallbackMessage(error, 'Could not remove the reaction.') : null;
}

export async function sendStoryReply(
  storyId: string,
  body: string,
): Promise<
  | { ok: true; replyId: string; messageId: string | null }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('send_story_reply', {
    p_story: storyId,
    p_body: body,
  });
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your reply could not be sent.') };
  }
  const rows = ((data as unknown as { reply_id: string; message_id: string | null }[]) ?? []) as {
    reply_id: string;
    message_id: string | null;
  }[];
  const first = rows[0];
  if (!first) {
    return { ok: false, error: 'Your reply could not be sent.' };
  }
  return { ok: true, replyId: first.reply_id, messageId: first.message_id };
}

/** Viewers of one of the caller's stories (author only). */
export async function fetchStoryViewers(storyId: string): Promise<StoryResult<StoryViewer[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('story_viewers', { p_story: storyId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the viewers.') };
  }
  return { data: ((data as unknown as StoryViewer[]) ?? []) as StoryViewer[], error: null };
}

/** Replies to one of the caller's stories (author only). */
export async function fetchStoryReplies(storyId: string): Promise<StoryResult<StoryReplyFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_story_replies', { p_story: storyId });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the replies.') };
  }
  return { data: ((data as unknown as StoryReplyFeed[]) ?? []) as StoryReplyFeed[], error: null };
}

/** Deletes one of the caller's own stories (media file removed, row tombstones). */
export async function deleteStory(storyId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_story', { p_story: storyId });
  return error ? fallbackMessage(error, 'Could not delete the story.') : null;
}

const storyUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a short-lived signed URL for a story's media. Access is enforced by
 * the storage.objects SELECT policy (owner or friends). Cached ~45s (60s URLs).
 */
export async function resolveStoryMediaUrl(
  storyId: string,
  mediaPath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = storyUrlCache.get(storyId);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  if (cached) {
    storyUrlCache.delete(storyId);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(STORIES_BUCKET).createSignedUrl(mediaPath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The media is no longer available.') };
  }
  if (data?.signedUrl) {
    storyUrlCache.set(storyId, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The media is no longer available.' };
}

// ---------------------------------------------------------------------------
// Realtime (single stories channel, many listeners)
// ---------------------------------------------------------------------------

type StoryChangeListener = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

const storyListeners = new Set<StoryChangeListener>();
let storiesChannel: RealtimeChannel | null = null;

function ensureStoriesChannel() {
  if (storiesChannel || storyListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  storiesChannel = supabase
    .channel('nexa-realtime-stories')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stories' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of storyListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function teardownStoriesChannel() {
  if (!storiesChannel) {
    return;
  }
  storiesChannel.unsubscribe();
  storiesChannel = null;
}

/** Subscribe to story changes the current user may see. Returns an unsubscribe fn. */
export function subscribeToStories(listener: StoryChangeListener): () => void {
  storyListeners.add(listener);
  ensureStoriesChannel();
  return () => {
    storyListeners.delete(listener);
    if (storyListeners.size === 0) {
      teardownStoriesChannel();
    }
  };
}
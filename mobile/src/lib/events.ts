import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { uploadObjectViaXhr } from '@/lib/uploadObject';
import { CommunityEventFeed, EventResponse } from '@/types/database';

/** Private bucket that holds event images, path "<communityId>/<senderId>/<file>". */
export const EVENT_IMAGES_BUCKET = 'event-images';

export interface EventResult<T> {
  data: T | null;
  error: string | null;
}

/** Storage object path: "<communityId>/<senderId>/<ts>-<rand>-<safeFileName>". */
export function buildEventImagePath(communityId: string, senderId: string, fileName: string): string {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${communityId}/${senderId}/${Date.now()}-${rand}-${safe}`;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Events of a community with the caller's response and response tallies. */
export async function fetchCommunityEvents(
  communityId: string,
): Promise<EventResult<CommunityEventFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_community_events', {
    p_community: communityId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the events.') };
  }
  return { data: ((data as unknown as CommunityEventFeed[]) ?? []) as CommunityEventFeed[], error: null };
}

// ---------------------------------------------------------------------------
// Mutations (all server-authoritative via RPC)
// ---------------------------------------------------------------------------

export interface EventDraft {
  title: string;
  description?: string;
  startsAt: string;
  location?: string;
  /** Path of an already-uploaded image in the event-images bucket. */
  imagePath?: string;
}

export async function createCommunityEvent(
  communityId: string,
  draft: EventDraft,
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_community: string;
    p_title: string;
    p_description?: string;
    p_starts_at: string;
    p_location?: string;
    p_image_path?: string;
  } = {
    p_community: communityId,
    p_title: draft.title,
    p_starts_at: draft.startsAt,
  };
  if (draft.description) {
    args.p_description = draft.description;
  }
  if (draft.location) {
    args.p_location = draft.location;
  }
  if (draft.imagePath) {
    args.p_image_path = draft.imagePath;
  }
  const { data, error } = await supabase.rpc('create_community_event', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your event could not be created.') };
  }
  return { ok: true, eventId: data as string };
}

export async function respondToEvent(eventId: string, response: EventResponse): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('respond_to_event', {
    p_event: eventId,
    p_response: response,
  });
  return error ? fallbackMessage(error, 'Your response could not be saved.') : null;
}

export async function toggleEventReminder(
  eventId: string,
): Promise<{ on: boolean; error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('toggle_event_reminder', { p_event: eventId });
  if (error) {
    return { on: false, error: fallbackMessage(error, 'Your reminder could not be saved.') };
  }
  return { on: data as boolean, error: null };
}

export async function updateCommunityEvent(
  eventId: string,
  patch: Partial<Omit<EventDraft, 'imagePath'>> & { imagePath?: string },
): Promise<string | null> {
  const supabase = getSupabase();
  const args: {
    p_event: string;
    p_title?: string;
    p_description?: string;
    p_starts_at?: string;
    p_location?: string;
    p_image_path?: string;
  } = { p_event: eventId };
  if (patch.title !== undefined) {
    args.p_title = patch.title;
  }
  if (patch.description !== undefined) {
    args.p_description = patch.description;
  }
  if (patch.startsAt !== undefined) {
    args.p_starts_at = patch.startsAt;
  }
  if (patch.location !== undefined) {
    args.p_location = patch.location;
  }
  if (patch.imagePath !== undefined) {
    args.p_image_path = patch.imagePath;
  }
  const { error } = await supabase.rpc('update_community_event', args);
  return error ? fallbackMessage(error, 'The event could not be updated.') : null;
}

export async function deleteCommunityEvent(eventId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_community_event', { p_event: eventId });
  return error ? fallbackMessage(error, 'The event could not be deleted.') : null;
}

// ---------------------------------------------------------------------------
// Media (uploads + signed URLs)
// ---------------------------------------------------------------------------

/**
 * Uploads an event image into the caller's folder inside the community's image
 * path. Returns an error string on failure, null on success.
 */
export async function uploadEventImage(
  objectPath: string,
  input: {
    uri: string;
    mimeType: string;
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
    return 'You need to be signed in to add an event photo.';
  }
  try {
    await uploadObjectViaXhr({
      bucket: EVENT_IMAGES_BUCKET,
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

const eventImageUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a short-lived signed URL for an event image. Access is enforced by
 * the storage.objects SELECT policy (community membership). Cached.
 */
export async function resolveEventImageUrl(
  imagePath: string,
): Promise<{ url: string | null; error: string | null }> {
  const cached = eventImageUrlCache.get(imagePath);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, error: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .createSignedUrl(imagePath, 60);
  if (error) {
    return { url: null, error: fallbackMessage(error, 'The image is no longer available.') };
  }
  if (data?.signedUrl) {
    eventImageUrlCache.set(imagePath, { url: data.signedUrl, expiresAt: Date.now() + 45_000 });
    return { url: data.signedUrl, error: null };
  }
  return { url: null, error: 'The image is no longer available.' };
}

// ---------------------------------------------------------------------------
// Realtime (single events channel, many listeners)
// ---------------------------------------------------------------------------

type EventChangeListener = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

const eventListeners = new Set<EventChangeListener>();
let eventsChannel: RealtimeChannel | null = null;

function ensureEventsChannel() {
  if (eventsChannel || eventListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  eventsChannel = supabase
    .channel('nexa-realtime-community-events')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_events' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of eventListeners) {
          listener(payload);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_event_rsvps' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          for (const listener of eventListeners) {
            listener(payload);
          }
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_event_reminders' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
          for (const listener of eventListeners) {
            listener(payload);
          }
        }
      },
    )
    .subscribe();
}

function teardownEventsChannel() {
  if (!eventsChannel) {
    return;
  }
  eventsChannel.unsubscribe();
  eventsChannel = null;
}

/** Subscribe to event changes in communities the current user belongs to. */
export function subscribeToCommunityEvents(listener: EventChangeListener): () => void {
  eventListeners.add(listener);
  ensureEventsChannel();
  return () => {
    eventListeners.delete(listener);
    if (eventListeners.size === 0) {
      teardownEventsChannel();
    }
  };
}
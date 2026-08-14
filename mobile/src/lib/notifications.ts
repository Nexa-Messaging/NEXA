import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { router } from 'expo-router';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { NotificationFeed } from '@/types/database';

export interface NotificationResult<T> {
  data: T | null;
  error: string | null;
}

/** Navigation metadata embedded in a notification's `data` payload. */
export interface NotificationTarget {
  target?: string;
  conversation_id?: string;
  message_id?: string;
  chat_id?: string;
  channel_id?: string;
  community_id?: string;
  poll_id?: string;
  event_id?: string;
  story_id?: string;
  user_id?: string;
  username?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The caller's notifications, newest first. Also materializes due reminders. */
export async function fetchNotifications(): Promise<NotificationResult<NotificationFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_notifications');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your notifications.') };
  }
  return { data: ((data as unknown as NotificationFeed[]) ?? []) as NotificationFeed[], error: null };
}

/** Count of unread notifications for the caller. */
export async function fetchUnreadNotificationCount(): Promise<NotificationResult<number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('unread_notification_count');
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load your notifications.') };
  }
  return { data: (data as number) ?? 0, error: null };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Marks a single notification read (no-op elsewhere). */
export async function markNotificationRead(id: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
  return error ? fallbackMessage(error, 'Could not update the notification.') : null;
}

/** Marks every notification of the caller as read. */
export async function markAllNotificationsRead(): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_all_notifications_read');
  return error ? fallbackMessage(error, 'Could not update your notifications.') : null;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Opens the screen a notification points at. Centralized here so no screen
 * needs to know how to interpret a notification's payload.
 */
export function openNotification(item: NotificationFeed): void {
  const data = (item.data ?? {}) as NotificationTarget;
  switch (data.target) {
    case 'message':
      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId: data.conversation_id ?? '' },
      });
      return;
    case 'group':
      router.push({ pathname: '/group/[chatId]', params: { chatId: data.chat_id ?? '' } });
      return;
    case 'channel':
      router.push({ pathname: '/channel/[channelId]', params: { channelId: data.channel_id ?? '' } });
      return;
    case 'polls':
      router.push({ pathname: '/polls/[communityId]', params: { communityId: data.community_id ?? '' } });
      return;
    case 'event':
      router.push({
        pathname: '/event/[eventId]',
        params: { eventId: data.event_id ?? '', communityId: data.community_id ?? '' },
      });
      return;
    case 'profile':
      if (data.username) {
        router.push({ pathname: '/users/[username]', params: { username: data.username } });
      } else {
        router.push('/friends');
      }
      return;
    default:
      router.push('/friends');
  }
}

// ---------------------------------------------------------------------------
// Realtime (single notifications channel, many listeners)
// ---------------------------------------------------------------------------

type NotificationChangeListener = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) => void;

const notificationListeners = new Set<NotificationChangeListener>();
let notificationsChannel: RealtimeChannel | null = null;

function ensureNotificationsChannel() {
  if (notificationsChannel || notificationListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  notificationsChannel = supabase
    .channel('nexa-realtime-notifications')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of notificationListeners) {
          listener(payload);
        }
      },
    )
    .subscribe();
}

function teardownNotificationsChannel() {
  if (!notificationsChannel) {
    return;
  }
  notificationsChannel.unsubscribe();
  notificationsChannel = null;
}

/**
 * Subscribes to the caller's notification changes. RLS on `notifications`
 * restricts the stream to the caller's own rows.
 */
export function subscribeToNotifications(listener: NotificationChangeListener): () => void {
  notificationListeners.add(listener);
  ensureNotificationsChannel();
  return () => {
    notificationListeners.delete(listener);
    if (notificationListeners.size === 0) {
      teardownNotificationsChannel();
    }
  };
}
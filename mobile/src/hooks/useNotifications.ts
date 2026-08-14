import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@/lib/notifications';
import { NotificationFeed } from '@/types/database';

/**
 * Powers the notifications tab and the unread tab badge: the caller's
 * notification feed + live unread count, refreshed on realtime changes, with
 * single/all mark-as-read helpers.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationFeed[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    const [listResult, countResult] = await Promise.all([
      fetchNotifications(),
      fetchUnreadNotificationCount(),
    ]);
    if (listResult.error || countResult.error) {
      setError(listResult.error ?? countResult.error);
    } else {
      setItems(listResult.data ?? []);
      setUnreadCount(countResult.data ?? 0);
      setError(null);
    }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  }, [refresh]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubscribe = subscribeToNotifications(() => {
      void refresh();
    });
    return unsubscribe;
  }, [user, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      let decrement = false;
      setItems((current) =>
        current.map((item) => {
          if (item.id === id && !item.is_read) {
            decrement = true;
            return { ...item, is_read: true };
          }
          return item;
        }),
      );
      if (decrement) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      const errorMessage = await markNotificationRead(id);
      if (errorMessage) {
        setError(errorMessage);
        void refresh();
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    const errorMessage = await markAllNotificationsRead();
    if (errorMessage) {
      setError(errorMessage);
      void refresh();
    }
  }, [refresh]);

  return { items, unreadCount, loading, refreshing, setRefreshing, error, refresh, load, markRead, markAllRead };
}
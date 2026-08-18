import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchPendingFriendRequestCount, subscribeToFriendships } from '@/lib/friends';
import { subscribeToNotifications } from '@/lib/notifications';

/**
 * Live count of friend requests waiting on the current user — the Friends tab
 * badge. Counts real pending requests from `friendships` (not notification
 * read-state), so it clears only when a request is accepted or rejected.
 * Refreshed (debounced) on friendships realtime events; the notifications
 * channel is a belt-and-braces source for request events. Both channels are
 * module singletons shared app-wide.
 */
export function usePendingFriendRequestCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const result = await fetchPendingFriendRequestCount();
    if (result.error == null && result.data != null) {
      setCount(result.data);
    }
  }, [user]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void refresh();
    }, 400);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const offFriendships = subscribeToFriendships(() => scheduleRefresh());
    const offNotifications = subscribeToNotifications(() => scheduleRefresh());
    return () => {
      offFriendships();
      offNotifications();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [user, scheduleRefresh]);

  return count;
}

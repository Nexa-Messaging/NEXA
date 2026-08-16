import { useEffect, useRef, useState } from 'react';

import { subscribeToPresence, startPresenceTracking, stopPresenceTracking } from '@/lib/presence';
import { useAuth } from '@/lib/auth';

/**
 * Tracks whether a specific user is currently online.
 * Returns `true` if the user is online, `false` otherwise.
 */
export function useIsOnline(userId: string | undefined): boolean {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!userId) {
      setOnline(false);
      return;
    }
    return subscribeToPresence(userId, (ids) => {
      setOnline(ids.includes(userId));
    });
  }, [userId]);

  return online;
}

/**
 * Starts tracking the current user's presence on mount.
 * Call this once at the app root (inside the authenticated shell).
 */
export function usePresenceTracker(): void {
  const { user } = useAuth();
  const tracked = useRef(false);

  useEffect(() => {
    if (!user?.id || tracked.current) return;
    tracked.current = true;
    startPresenceTracking(user.id);

    return () => {
      stopPresenceTracking();
      tracked.current = false;
    };
  }, [user?.id]);
}

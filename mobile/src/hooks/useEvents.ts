import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchCommunityEvents, subscribeToCommunityEvents } from '@/lib/events';
import { CommunityEventFeed } from '@/types/database';

/**
 * Powers a community's event list: upcoming + past events with the caller's
 * RSVP, reminder flag and response tallies, kept fresh via realtime.
 */
export function useEvents(communityId: string) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CommunityEventFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onEventChange = useCallback(
    (changedEventId: string | null) => {
      if (changedEventId) {
        setEvents((current) => current.filter((entry) => entry.event_id !== changedEventId));
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!user || !communityId) {
      return;
    }
    const result = await fetchCommunityEvents(communityId);
    if (result.error) {
      setError(result.error);
    } else {
      const rows = result.data ?? [];
      // skip trashed rows (an old event still populating after a delete)
      setEvents(
        rows
          .filter((row) => row.title?.trim())
          .sort(
            (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
          ),
      );
      setError(null);
    }
  }, [user, communityId]);

  const load = useCallback(async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  }, [refresh]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, communityId]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubscribe = subscribeToCommunityEvents((payload) => {
      const changedEventId = String(
        ((payload.new as Record<string, unknown> | null)?.event_id ??
          (payload.old as Record<string, unknown> | null)?.event_id) ??
          '',
      );
      onEventChange(changedEventId || null);
      void refresh();
    });
    return unsubscribe;
  }, [user, refresh, onEventChange]);

  return { events, loading, refreshing, setRefreshing, error, refresh, load };
}

export type { EventResponse } from '@/types/database';
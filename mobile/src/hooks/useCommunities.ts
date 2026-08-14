import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import {
  fetchCommunities,
  subscribeToCommunities,
  subscribeToCommunityMembers,
  subscribeToCommunityMessages,
} from '@/lib/communities';
import { RealtimeStatus, subscribeToRealtimeStatus } from '@/lib/messaging';
import { CommunityListEntry } from '@/types/database';

/**
 * Powers the Circles (Communities) tab: the signed-in user's communities plus
 * their discoverable class community, refreshed from the server and updated
 * live whenever communities, memberships or channel messages change.
 */
export function useCommunities() {
  const { user } = useAuth();
  const [items, setItems] = useState<CommunityListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await fetchCommunities();
    if (result.error) {
      setError(result.error);
    } else {
      setItems(result.data ?? []);
      setError(null);
    }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  }, [refresh]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void refresh();
    }, 400);
  }, [refresh]);

  useEffect(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const offCommunities = subscribeToCommunities(() => scheduleRefresh());
    const offMembers = subscribeToCommunityMembers(() => scheduleRefresh());
    const offMessages = subscribeToCommunityMessages(() => scheduleRefresh());
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return () => {
      offCommunities();
      offMembers();
      offMessages();
      offStatus();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [user, scheduleRefresh]);

  return { items, loading, refreshing, setRefreshing, error, realtime, refresh, load };
}
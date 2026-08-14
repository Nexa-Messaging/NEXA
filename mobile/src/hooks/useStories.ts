import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchStories, subscribeToStories } from '@/lib/stories';
import { StoryFeedRow } from '@/types/database';

/** One author's stories grouped for the feed rail (chronological order). */
export interface StoryFeedEntry {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  stories: StoryFeedRow[];
  /** Count of stories the caller hasn't viewed yet. */
  unseenCount: number;
}

function groupStories(rows: StoryFeedRow[]): StoryFeedEntry[] {
  const byUser = new Map<string, StoryFeedRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }
  const entries: StoryFeedEntry[] = [];
  for (const [userId, stories] of byUser) {
    const [first] = stories;
    let unseenCount = 0;
    for (const story of stories) {
      if (!story.viewed) {
        unseenCount += 1;
      }
    }
    entries.push({
      user_id: userId,
      display_name: first.display_name,
      username: first.username,
      avatar_url: first.avatar_url,
      stories: stories.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
      unseenCount,
    });
  }
  return entries;
}

/**
 * Powers the stories rail on Home: story feed rows grouped by author, loaded
 * from the server and kept fresh as stories are created, viewed or deleted in
 * realtime.
 */
export function useStories() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<StoryFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await fetchStories();
    if (result.error) {
      setError(result.error);
    } else {
      setEntries(groupStories(result.data ?? []));
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
    const unsubscribe = subscribeToStories(() => {
      void refresh();
    });
    return unsubscribe;
  }, [user, refresh]);

  return { entries, loading, refreshing, setRefreshing, error, refresh, load };
}
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchCommunityPolls, subscribeToCommunityPolls } from '@/lib/polls';
import { CommunityPollFeed } from '@/types/database';

/** One poll with its options, grouped from the one-row-per-option feed. */
export interface PollFeedEntry {
  poll_id: string;
  question: string;
  is_anonymous: boolean;
  expires_at: string | null;
  created_by: string;
  creator_display_name: string;
  creator_username: string;
  created_at: string;
  my_role: string;
  my_vote_option_id: string | null;
  total_votes: number;
  is_expired: boolean;
  options: {
    option_id: string;
    option_text: string;
    option_position: number;
    option_votes: number;
  }[];
}

export function groupPollFeed(rows: CommunityPollFeed[]): PollFeedEntry[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const byPoll = new Map<string, PollFeedEntry>();
  for (const row of rows) {
    let entry = byPoll.get(row.poll_id);
    if (!entry) {
      entry = {
        poll_id: row.poll_id,
        question: row.question,
        is_anonymous: row.is_anonymous,
        expires_at: row.expires_at,
        created_by: row.created_by,
        creator_display_name: row.creator_display_name,
        creator_username: row.creator_username,
        created_at: row.created_at,
        my_role: row.my_role,
        my_vote_option_id: row.my_vote_option_id,
        total_votes: row.total_votes,
        is_expired: row.is_expired,
        options: [],
      };
      byPoll.set(row.poll_id, entry);
    }
    entry.options.push({
      option_id: row.option_id,
      option_text: row.option_text,
      option_position: row.option_position,
      option_votes: row.option_votes,
    });
  }
  return [...byPoll.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/**
 * Powers a community's poll list: poll feed entries with per-option results,
 * loaded from the server and refreshed as polls are created, voted on or
 * deleted in realtime.
 */
export function usePolls(communityId: string) {
  const { user } = useAuth();
  const [polls, setPolls] = useState<PollFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !communityId) {
      return;
    }
    const result = await fetchCommunityPolls(communityId);
    if (result.error) {
      setError(result.error);
    } else {
      setPolls(groupPollFeed(result.data ?? []));
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
    const unsubscribe = subscribeToCommunityPolls((payload) => {
      const changedPollId = String(
        ((payload.new as Record<string, unknown> | null)?.poll_id ??
          (payload.old as Record<string, unknown> | null)?.poll_id) ??
          '',
      );
      if (changedPollId) {
        setPolls((current) =>
          current.filter((entry) => entry.poll_id !== changedPollId),
        );
      }
      void refresh();
    });
    return unsubscribe;
  }, [user, refresh]);

  return { polls, loading, refreshing, setRefreshing, error, refresh, load };
}
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { fallbackMessage } from '@/lib/messaging';
import { getSupabase } from '@/lib/supabase';
import { CommunityPollFeed, CommunityPollVoter } from '@/types/database';

export interface PollResult<T> {
  data: T | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Polls of a community with results (one feed row per option). */
export async function fetchCommunityPolls(
  communityId: string,
): Promise<PollResult<CommunityPollFeed[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_community_polls', {
    p_community: communityId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the polls.') };
  }
  return { data: ((data as unknown as CommunityPollFeed[]) ?? []) as CommunityPollFeed[], error: null };
}

/** Voter breakdown for a non-anonymous poll (poll author or admin/owner). */
export async function fetchCommunityPollVoters(
  pollId: string,
): Promise<PollResult<CommunityPollVoter[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_community_poll_voters', {
    p_poll: pollId,
  });
  if (error) {
    return { data: null, error: fallbackMessage(error, 'Could not load the voters.') };
  }
  return { data: ((data as unknown as CommunityPollVoter[]) ?? []) as CommunityPollVoter[], error: null };
}

// ---------------------------------------------------------------------------
// Mutations (all server-authoritative via RPC)
// ---------------------------------------------------------------------------

export async function createCommunityPoll(
  communityId: string,
  question: string,
  options: string[],
  anonymous: boolean,
  expiresAt?: string,
): Promise<{ ok: true; pollId: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const args: {
    p_community: string;
    p_question: string;
    p_options: string[];
    p_anonymous?: boolean;
    p_expires_at?: string;
  } = {
    p_community: communityId,
    p_question: question,
    p_options: options,
    p_anonymous: anonymous,
  };
  if (expiresAt) {
    args.p_expires_at = expiresAt;
  }
  const { data, error } = await supabase.rpc('create_community_poll', args);
  if (error) {
    return { ok: false, error: fallbackMessage(error, 'Your poll could not be created.') };
  }
  return { ok: true, pollId: data as string };
}

export async function voteCommunityPoll(pollId: string, optionId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('vote_community_poll', {
    p_poll: pollId,
    p_option: optionId,
  });
  return error ? fallbackMessage(error, 'Your vote could not be recorded.') : null;
}

export async function deleteCommunityPoll(pollId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_community_poll', { p_poll: pollId });
  return error ? fallbackMessage(error, 'The poll could not be deleted.') : null;
}

// ---------------------------------------------------------------------------
// Realtime (single poll channel, many listeners)
// ---------------------------------------------------------------------------

type PollChangeListener = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

const pollListeners = new Set<PollChangeListener>();
let pollsChannel: RealtimeChannel | null = null;

function ensurePollsChannel() {
  if (pollsChannel || pollListeners.size === 0) {
    return;
  }
  const supabase = getSupabase();
  pollsChannel = supabase
    .channel('nexa-realtime-community-polls')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_polls' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        for (const listener of pollListeners) {
          listener(payload);
        }
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'community_poll_votes' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const pollId = String(
          ((payload.new as Record<string, unknown> | null)?.poll_id ??
            (payload.old as Record<string, unknown> | null)?.poll_id) ?? '',
        );
        if (pollId) {
          for (const listener of pollListeners) {
            listener(payload);
          }
        }
      },
    )
    .subscribe();
}

function teardownPollsChannel() {
  if (!pollsChannel) {
    return;
  }
  pollsChannel.unsubscribe();
  pollsChannel = null;
}

/** Subscribe to poll changes in communities the current user belongs to. */
export function subscribeToCommunityPolls(listener: PollChangeListener): () => void {
  pollListeners.add(listener);
  ensurePollsChannel();
  return () => {
    pollListeners.delete(listener);
    if (pollListeners.size === 0) {
      teardownPollsChannel();
    }
  };
}
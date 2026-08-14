import { useCallback, useEffect, useState } from 'react';

import {
  FriendshipStatus,
  getFriendStatus,
  sendFriendRequest,
  respondToFriendRequest,
  cancelFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
} from '@/lib/friends';

/**
 * Loads and mutates the friendship between the current user and `otherUserId`.
 * Every action re-reads the status afterwards so the UI stays truthful.
 */
export function useFriendStatus(
  otherUserId: string | null,
  onChanged?: () => void,
) {
  const [status, setStatus] = useState<FriendshipStatus | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!otherUserId) {
      setStatus('none');
      return;
    }
    const result = await getFriendStatus(otherUserId);
    if (result.error) {
      setError(result.error);
    } else {
      setStatus(result.data ?? 'none');
      setError(null);
    }
  }, [otherUserId]);

  useEffect(() => {
    setStatus('loading');
    setError(null);
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: (id: string) => Promise<string | null>) => {
      if (!otherUserId || busy) {
        return;
      }
      setBusy(true);
      setError(null);
      const actionError = await action(otherUserId);
      if (actionError) {
        setError(actionError);
      } else {
        await reload();
        onChanged?.();
      }
      setBusy(false);
    },
    [otherUserId, busy, reload, onChanged],
  );

  return {
    status,
    isLoading: status === 'loading',
    error,
    busy,
    reload,
    sendRequest: () => run(sendFriendRequest),
    accept: () => run((id) => respondToFriendRequest(id, true)),
    reject: () => run((id) => respondToFriendRequest(id, false)),
    cancel: () => run(cancelFriendRequest),
    remove: () => run(removeFriend),
    block: () => run(blockUser),
    unblock: () => run(unblockUser),
  };
}
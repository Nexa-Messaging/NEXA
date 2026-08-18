import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { subscribeToGroupMembers, subscribeToGroupMessages } from '@/lib/groups';
import {
  fetchUnreadConversationCount,
  subscribeToConversations,
  subscribeToMessages,
} from '@/lib/messaging';

/**
 * Live count of distinct conversations (1:1 + groups) with unread messages —
 * the Chat tab badge. Fetches the lightweight `unread_conversation_count` RPC
 * instead of the full inbox lists, and refreshes it (debounced) whenever
 * messages, conversations or memberships change. The underlying realtime
 * channels are module singletons shared with the Chats list hook, so no extra
 * sockets are opened.
 */
export function useUnreadConversationCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    const result = await fetchUnreadConversationCount();
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
    const offMessages = subscribeToMessages(() => scheduleRefresh());
    const offConversations = subscribeToConversations(() => scheduleRefresh());
    const offGroupMessages = subscribeToGroupMessages(() => scheduleRefresh());
    const offGroupMembers = subscribeToGroupMembers(() => scheduleRefresh());
    return () => {
      offMessages();
      offConversations();
      offGroupMessages();
      offGroupMembers();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [user, scheduleRefresh]);

  return count;
}

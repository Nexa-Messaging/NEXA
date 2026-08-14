import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchGroupChats, subscribeToGroupChats, subscribeToGroupMembers, subscribeToGroupMessages } from '@/lib/groups';
import {
  fetchConversations,
  markMessagesDelivered,
  RealtimeStatus,
  subscribeToConversations,
  subscribeToMessages,
  subscribeToRealtimeStatus,
} from '@/lib/messaging';
import { ConversationSummary, MessageRow } from '@/types/database';

/** One row in the Chats tab, regardless of whether it is 1:1 or a group. */
export interface ChatListItem {
  kind: 'direct' | 'group';
  id: string;
  name: string;
  avatarPath: string | null;
  lastMessage: string | null;
  lastAt: string;
  unreadCount: number;
  memberCount: number;
  /** Present for groups: the caller's role in the chat. */
  myRole: string | null;
}

function toChatListItem(conversation: ConversationSummary): ChatListItem {
  return {
    kind: 'direct',
    id: conversation.conversation_id,
    name: conversation.display_name,
    avatarPath: conversation.avatar_url,
    lastMessage: conversation.last_message,
    lastAt: conversation.last_at,
    unreadCount: conversation.unread_count,
    memberCount: 2,
    myRole: null,
  };
}

function toGroupChatListItem(group: {
  chat_id: string;
  name: string;
  avatar_path: string | null;
  last_message: string | null;
  last_at: string;
  unread_count: number;
  member_count: number;
  my_role: string;
}): ChatListItem {
  return {
    kind: 'group',
    id: group.chat_id,
    name: group.name,
    avatarPath: group.avatar_path,
    lastMessage: group.last_message,
    lastAt: group.last_at,
    unreadCount: group.unread_count,
    memberCount: group.member_count,
    myRole: group.my_role,
  };
}

function mergeSorted(direct: ChatListItem[], groups: ChatListItem[]): ChatListItem[] {
  return [...direct, ...groups].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/**
 * Powers the Chats tab: 1:1 conversations and group chats merged into one
 * list, refreshed from the server and updated live whenever messages,
 * conversations, group messages, group chats or memberships change.
 */
export function useConversations() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }
    const [directResult, groupsResult] = await Promise.all([
      fetchConversations(),
      fetchGroupChats(),
    ]);
    if (directResult.error && groupsResult.error) {
      setError('Could not load your chats.');
    } else {
      setError(null);
    }
    const direct = directResult.error ? [] : (directResult.data ?? []).map(toChatListItem);
    const groups = groupsResult.error ? [] : (groupsResult.data ?? []).map(toGroupChatListItem);
    setItems(mergeSorted(direct, groups));
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    // Incoming 1:1 messages from the other participant are marked delivered as
    // soon as this device receives them (the open chat marks them read too).
    const onMessage = (event: { eventType: string; newMessage: MessageRow | null }) => {
      if (
        event.eventType === 'INSERT' &&
        event.newMessage &&
        event.newMessage.sender_id !== user.id
      ) {
        void markMessagesDelivered(event.newMessage.conversation_id);
      }
      scheduleRefresh();
    };
    const offMessages = subscribeToMessages(onMessage);
    const offConversations = subscribeToConversations(() => scheduleRefresh());
    const offGroupMessages = subscribeToGroupMessages(() => scheduleRefresh());
    const offGroupChats = subscribeToGroupChats(() => scheduleRefresh());
    const offGroupMembers = subscribeToGroupMembers(() => scheduleRefresh());
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return () => {
      offMessages();
      offConversations();
      offGroupMessages();
      offGroupChats();
      offGroupMembers();
      offStatus();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [user, scheduleRefresh]);

  return { items, loading, refreshing, setRefreshing, error, realtime, refresh, load };
}
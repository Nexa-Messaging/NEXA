import { useEffect, useRef, useState } from 'react';

import { emitTypingStart, emitTypingStop, subscribeToTyping } from '@/lib/typing';
import { useAuth } from '@/lib/auth';

/**
 * Manages typing indicator state for a conversation.
 *
 * Returns:
 * - `typingName`: display name of the person currently typing, or null
 * - `onTyping`: call on every onChangeText to broadcast typing events
 * - `onSendOrClear`: call when the user sends or cancels to broadcast stop
 */
export function useTypingIndicator(conversationId: string | undefined) {
  const { user, profile } = useAuth();
  const [typingName, setTypingName] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myName = profile?.display_name || user?.email?.split('@')[0] || 'Someone';

  // Subscribe to typing events from others
  useEffect(() => {
    if (!conversationId) return;

    return subscribeToTyping(conversationId, (name) => {
      setTypingName(name);
      // Auto-clear after timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingName(null), 3500);
    });
  }, [conversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const onTyping = () => {
    if (!conversationId || !user) return;
    emitTypingStart(conversationId, user.id, myName);
  };

  const onSendOrClear = () => {
    if (!conversationId || !user) return;
    emitTypingStop(conversationId, user.id, myName);
  };

  return { typingName, onTyping, onSendOrClear };
}

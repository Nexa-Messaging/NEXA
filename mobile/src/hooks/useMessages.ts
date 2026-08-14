import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import {
  buildMediaPath,
  fetchMessageById,
  fetchMessages,
  genUuid,
  markMessagesDelivered,
  markMessagesRead,
  MediaUploadInput,
  RealtimeStatus,
  sendMediaMessage as rpcSendMediaMessage,
  sendMessage as rpcSendMessage,
  subscribeToMessages,
  subscribeToRealtimeStatus,
  uploadMessageMedia,
} from '@/lib/messaging';
import { MessageRow } from '@/types/database';

export type PendingStatus = 'sending' | 'uploading' | 'failed';

export interface PendingMessage {
  /** Local client id, replaced once the server row is known. */
  id: string;
  /** Server idempotency key — generated per send, reconciled over realtime. */
  clientId?: string;
  conversationId: string;
  body: string;
  replyToId: string | null;
  replyText?: string;
  createdAt: string;
  status: PendingStatus;
  /** Upload progress fraction (0..1) while status is 'uploading'. */
  uploadProgress?: number;
  media?: MediaUploadInput & { path: string };
}

export interface SendMediaArgs {
  kind: 'image' | 'video' | 'voice';
  mimeType: string;
  uri: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

function insertSorted(rows: MessageRow[], next: MessageRow): MessageRow[] {
  const exists = rows.some((row) => row.id === next.id);
  const base = exists ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next];
  return base.sort((a, b) => a.seq - b.seq);
}

function localId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Messaging state for one open conversation: canonical server rows, a local
 * pending/failed queue (text + media), realtime receipts and realtime status.
 */
export function useMessages(conversationId: string | undefined) {
  const { user } = useAuth();
  const meId = user?.id;
  const focusedRef = useRef(false);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const [sendError, setSendError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!conversationId) {
      return;
    }
    const result = await fetchMessages(conversationId);
    if (result.error) {
      setError(result.error);
    } else {
      setMessages(result.data ?? []);
      setError(null);
    }
  }, [conversationId]);

  const load = useCallback(async () => {
    setLoading(true);
    await reload();
    setLoading(false);
  }, [reload]);

  const markDelivered = useCallback(async () => {
    if (conversationId) {
      await markMessagesDelivered(conversationId);
    }
  }, [conversationId]);

  const markRead = useCallback(async () => {
    if (conversationId) {
      await markMessagesRead(conversationId);
    }
  }, [conversationId]);

  /** Mark incoming messages read when the chat is on screen, delivered otherwise. */
  const ackIncoming = useCallback(() => {
    void (focusedRef.current ? markRead() : markDelivered());
  }, [markRead, markDelivered]);

  const applyServerRow = useCallback((row: MessageRow) => {
    setMessages((prev) => insertSorted(prev, row));
  }, []);

  useEffect(() => {
    setMessages([]);
    setPending([]);
    setError(null);
    setSendError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const offMessages = subscribeToMessages((event) => {
      const row = event.newMessage ?? event.oldMessage;
      if (!row || row.conversation_id !== conversationId) {
        return;
      }
      if (event.eventType === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }
      applyServerRow(row);
      if (event.eventType === 'INSERT') {
        const clientId = (row as unknown as { client_id?: string | null }).client_id;
        if (clientId) {
          // Our own send arriving back over realtime: drop the matching local
          // pending bubble so the message never renders twice.
          setPending((prev) => prev.filter((p) => p.clientId !== clientId));
        }
        // Only acknowledge messages sent by the other participant.
        if (meId && row.sender_id !== meId) {
          ackIncoming();
        }
      }
    });
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return () => {
      offMessages();
      offStatus();
    };
  }, [conversationId, meId, ackIncoming, applyServerRow]);

  const setPendingStatus = useCallback((targetId: string, status: PendingStatus) => {
    setPending((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, status } : item)),
    );
  }, []);

  const performSend = useCallback(
    async (target: PendingMessage) => {
      setSendError(null);

      if (!target.media) {
        setPendingStatus(target.id, 'sending');
        const result = await rpcSendMessage(
          target.conversationId,
          target.body,
          target.replyToId,
          target.clientId,
        );
        if (result.ok) {
          setPending((prev) => prev.filter((item) => item.id !== target.id));
          const canonical = await fetchMessageById(result.messageId);
          if (canonical.data) {
            applyServerRow(canonical.data);
          }
        } else {
          setPendingStatus(target.id, 'failed');
          setSendError(result.error);
        }
        return;
      }

      // Media: upload first (with progress), then register the message.
      setPendingStatus(target.id, 'uploading');
      const uploadError = await uploadMessageMedia(target.media.path, target.media, (fraction) => {
        setPending((prev) =>
          prev.map((item) =>
            item.id === target.id ? { ...item, uploadProgress: fraction } : item,
          ),
        );
      });
      if (uploadError) {
        setPendingStatus(target.id, 'failed');
        setSendError(uploadError);
        return;
      }

      setPendingStatus(target.id, 'sending');
      const result = await rpcSendMediaMessage(
        target.conversationId,
        {
          kind: target.media.kind,
          path: target.media.path,
          mimeType: target.media.mimeType,
          width: target.media.width,
          height: target.media.height,
          durationSeconds: target.media.durationSeconds,
          sizeBytes: target.media.sizeBytes,
        },
        target.body,
        target.replyToId,
        target.clientId,
      );
      if (result.ok) {
        setPending((prev) => prev.filter((item) => item.id !== target.id));
        const canonical = await fetchMessageById(result.messageId);
        if (canonical.data) {
          applyServerRow(canonical.data);
        }
      } else {
        setPendingStatus(target.id, 'failed');
        setSendError(result.error);
      }
    },
    [applyServerRow, setPendingStatus],
  );

  const send = useCallback(
    (body: string, replyToId?: string | null, replyText?: string) => {
      if (!conversationId || !meId || !body.trim()) {
        return;
      }
      const trimmed = body.trim();
      const target: PendingMessage = {
        id: localId(),
        clientId: genUuid(),
        conversationId,
        body: trimmed,
        replyToId: replyToId ?? null,
        replyText,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setPending((prev) => [...prev, target]);
      void performSend(target);
    },
    [conversationId, meId, performSend],
  );

  const sendMedia = useCallback(
    (
      media: SendMediaArgs,
      caption: string,
      replyToId?: string | null,
      replyText?: string,
    ) => {
      if (!conversationId || !meId) {
        return;
      }
      const path = buildMediaPath(conversationId, meId, 'file');
      const target: PendingMessage = {
        id: localId(),
        clientId: genUuid(),
        conversationId,
        body: caption.trim(),
        replyToId: replyToId ?? null,
        replyText,
        createdAt: new Date().toISOString(),
        status: 'uploading',
        uploadProgress: 0,
        media: { ...media, path },
      };
      setPending((prev) => [...prev, target]);
      void performSend(target);
    },
    [conversationId, meId, performSend],
  );

  const retry = useCallback(
    (target: PendingMessage) => {
      void performSend(target);
    },
    [performSend],
  );

  const discard = useCallback((localIdToRemove: string) => {
    setPending((prev) => prev.filter((item) => item.id !== localIdToRemove));
  }, []);

  /** Called by the screen when the chat gains/loses focus. */
  const setFocused = useCallback(
    (focused: boolean) => {
      focusedRef.current = focused;
      if (focused) {
        void markRead();
        void reload();
      }
    },
    [markRead, reload],
  );

  return {
    messages,
    pending,
    loading,
    error,
    realtime,
    sendError,
    clearSendError: () => setSendError(null),
    send,
    sendMedia,
    retry,
    discard,
    setFocused,
    refresh: reload,
  };
}

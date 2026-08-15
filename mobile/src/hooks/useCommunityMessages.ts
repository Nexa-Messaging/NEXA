import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import {
  buildCommunityMediaPath,
  fetchChannelMessages,
  markChannelRead,
  sendCommunityMediaMessage as rpcSendCommunityMediaMessage,
  sendCommunityMessage as rpcSendCommunityMessage,
  subscribeToCommunityMessages,
  uploadCommunityMedia,
} from '@/lib/communities';
import { RealtimeStatus, subscribeToRealtimeStatus } from '@/lib/messaging';
import { CommunityMessageFeed, CommunityMessageRow } from '@/types/database';
import { randomToken } from '@/utils/random';

export type PendingStatus = 'sending' | 'uploading' | 'failed';

export interface PendingCommunityMessage {
  /** Local client id, replaced once the server row is known. */
  id: string;
  channelId: string;
  body: string;
  replyToId: string | null;
  replyText?: string;
  createdAt: string;
  status: PendingStatus;
  /** Upload progress fraction (0..1) while status is 'uploading'. */
  uploadProgress?: number;
  media?: SendCommunityMediaArgs & { path: string };
}

export interface SendCommunityMediaArgs {
  kind: 'image' | 'video' | 'voice';
  mimeType: string;
  uri: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface SenderProfile {
  sender_display_name?: string | null;
  sender_username?: string | null;
  sender_avatar_url?: string | null;
}

function insertSorted(
  rows: CommunityMessageFeed[],
  next: CommunityMessageFeed,
): CommunityMessageFeed[] {
  const exists = rows.some((row) => row.id === next.id);
  const base = exists ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next];
  return base.sort((a, b) => a.seq - b.seq);
}

function localId(): string {
  return `${Date.now()}-${randomToken(10)}`;
}

/**
 * Channel messaging state for one open channel: canonical server rows (with
 * sender profiles), a local pending/failed queue (text + media) and realtime
 * events. `resolveSender` supplies profile info for realtime rows that arrive
 * before the member list does; defaults to the sender id so messages render.
 */
export function useCommunityMessages(
  channelId: string | undefined,
  resolveSender?: (senderId: string) => SenderProfile | undefined,
  communityId?: string | undefined,
) {
  const { user } = useAuth();
  const meId = user?.id;
  const focusedRef = useRef(false);
  const resolveSenderRef = useRef(resolveSender);
  resolveSenderRef.current = resolveSender;

  const [messages, setMessages] = useState<CommunityMessageFeed[]>([]);
  const [pending, setPending] = useState<PendingCommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const [sendError, setSendError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!channelId) {
      return;
    }
    const result = await fetchChannelMessages(channelId);
    if (result.error) {
      setError(result.error);
    } else {
      setMessages(result.data ?? []);
      setError(null);
    }
  }, [channelId]);

  const load = useCallback(async () => {
    setLoading(true);
    await reload();
    setLoading(false);
  }, [reload]);

  const markRead = useCallback(async () => {
    if (channelId) {
      await markChannelRead(channelId);
    }
  }, [channelId]);

  /** Marks incoming messages read while the channel is on screen. */
  const ackIncoming = useCallback(() => {
    void (focusedRef.current ? markRead() : undefined);
  }, [markRead]);

  const applyServerRow = useCallback((row: CommunityMessageRow) => {
    const profile = resolveSenderRef.current?.(row.sender_id);
    const feed: CommunityMessageFeed = {
      ...row,
      sender_display_name: profile?.sender_display_name ?? row.sender_id,
      sender_username: profile?.sender_username ?? '@',
      sender_avatar_url: profile?.sender_avatar_url ?? null,
    };
    setMessages((prev) => insertSorted(prev, feed));
  }, []);

  useEffect(() => {
    setMessages([]);
    setPending([]);
    setError(null);
    setSendError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!channelId) {
      return;
    }
    const offMessages = subscribeToCommunityMessages((event) => {
      const row = event.newMessage ?? event.oldMessage;
      if (!row || row.channel_id !== channelId) {
        return;
      }
      if (event.eventType === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
        return;
      }
      applyServerRow(row);
      if (event.eventType === 'INSERT' && meId && row.sender_id !== meId) {
        ackIncoming();
      }
    });
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return () => {
      offMessages();
      offStatus();
    };
  }, [channelId, meId, ackIncoming, applyServerRow]);

  const setPendingStatus = useCallback((targetId: string, status: PendingStatus) => {
    setPending((prev) =>
      prev.map((item) => (item.id === targetId ? { ...item, status } : item)),
    );
  }, []);

  const performSend = useCallback(
    async (target: PendingCommunityMessage) => {
      if (!channelId) {
        return;
      }
      setSendError(null);

      if (!target.media) {
        setPendingStatus(target.id, 'sending');
        const result = await rpcSendCommunityMessage(channelId, target.body, target.replyToId);
        if (result.ok) {
          setPending((prev) => prev.filter((item) => item.id !== target.id));
          void reload();
        } else {
          setPendingStatus(target.id, 'failed');
          setSendError(result.error);
        }
        return;
      }

      // Media: upload first (with progress), then register the message.
      setPendingStatus(target.id, 'uploading');
      const uploadError = await uploadCommunityMedia(
        target.media.path,
        target.media,
        (fraction) => {
          setPending((prev) =>
            prev.map((item) =>
              item.id === target.id ? { ...item, uploadProgress: fraction } : item,
            ),
          );
        },
      );
      if (uploadError) {
        setPendingStatus(target.id, 'failed');
        setSendError(uploadError);
        return;
      }

      setPendingStatus(target.id, 'sending');
      const result = await rpcSendCommunityMediaMessage(
        channelId,
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
      );
      if (result.ok) {
        setPending((prev) => prev.filter((item) => item.id !== target.id));
        void reload();
      } else {
        setPendingStatus(target.id, 'failed');
        setSendError(result.error);
      }
    },
    [channelId, reload, setPendingStatus],
  );

  const send = useCallback(
    (body: string, replyToId?: string | null, replyText?: string) => {
      if (!channelId || !meId || !body.trim()) {
        return;
      }
      const trimmed = body.trim();
      const target: PendingCommunityMessage = {
        id: localId(),
        channelId,
        body: trimmed,
        replyToId: replyToId ?? null,
        replyText,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setPending((prev) => [...prev, target]);
      void performSend(target);
    },
    [channelId, meId, performSend],
  );

  const sendMedia = useCallback(
    (
      media: SendCommunityMediaArgs,
      caption: string,
      replyToId?: string | null,
      replyText?: string,
    ) => {
      if (!channelId || !communityId || !meId) {
        return;
      }
      const path = buildCommunityMediaPath(communityId, meId, 'file');
      const target: PendingCommunityMessage = {
        id: localId(),
        channelId,
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
    [channelId, communityId, meId, performSend],
  );

  const retry = useCallback(
    (target: PendingCommunityMessage) => {
      void performSend(target);
    },
    [performSend],
  );

  const discard = useCallback((localIdToRemove: string) => {
    setPending((prev) => prev.filter((item) => item.id !== localIdToRemove));
  }, []);

  /** Called by the screen when the channel gains/loses focus. */
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
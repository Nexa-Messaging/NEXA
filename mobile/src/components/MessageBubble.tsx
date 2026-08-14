import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { VoiceNotePlayer } from '@/components/VoiceNotePlayer';
import { colors, radius, spacing } from '@/constants/theme';
import { PendingCommunityMessage } from '@/hooks/useCommunityMessages';
import { PendingGroupMessage } from '@/hooks/useGroupMessages';
import { PendingMessage } from '@/hooks/useMessages';
import { isMediaKind } from '@/lib/messaging';
import { CommunityMessageFeed, GroupMessageFeed, MessageRow } from '@/types/database';
import { formatMessageTime } from '@/utils/format';

export type ChatItem =
  | MessageRow
  | GroupMessageFeed
  | CommunityMessageFeed
  | PendingMessage
  | PendingGroupMessage
  | PendingCommunityMessage;

export interface MessageBubbleProps {
  item: ChatItem;
  isMine: boolean;
  /** Resolved reply text (quoted bubble), empty when there is no reply. */
  replyText?: string | null;
  /** Who is reacting; used to highlight "my" reaction chips. */
  meId: string;
  /** Shown above the bubble for other senders in group chats. */
  senderName?: string | null;
  /** Signed URL for server media rows, resolved by the chat screen. */
  mediaUrl?: string | null;
  onLongPress: () => void;
  onRetry?: () => void;
  onReact?: (emoji: string, hasMine: boolean) => void;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  mine: boolean;
}

interface MediaContent {
  kind: 'image' | 'video' | 'voice';
  source: string | null;
  durationSeconds?: number;
  progress?: number;
  pending: boolean;
}

export function groupReactions(
  reactions: unknown,
  meId: string,
): ReactionGroup[] {
  const list = Array.isArray(reactions) ? (reactions as { user_id: string; emoji: string }[]) : [];
  const map = new Map<string, ReactionGroup>();
  for (const reaction of list) {
    if (!reaction || typeof reaction.emoji !== 'string') {
      continue;
    }
    const entry = map.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    entry.count += 1;
    if (reaction.user_id === meId) {
      entry.mine = true;
    }
    map.set(reaction.emoji, entry);
  }
  return [...map.values()];
}

/**
 * One message bubble: reply quote, media (photo/video/voice) or text body,
 * timestamp, delivery receipts for the sender and a reaction chip row.
 */
export function MessageBubble({
  item,
  isMine,
  replyText,
  meId,
  senderName,
  mediaUrl,
  onLongPress,
  onRetry,
  onReact,
}: MessageBubbleProps) {
  const isPending = 'status' in item;
  const isFailed = isPending && item.status === 'failed';
  const isDeleted = !isPending && item.deleted_at != null;
  const body = isPending ? item.body : item.body;
  const createdAt = isPending ? item.createdAt : item.created_at;
  const reactions = isPending || isDeleted ? [] : groupReactions(item.reactions, meId);

  const media = (() => {
    if (isPending) {
      const pendingMedia = item.media;
      if (!pendingMedia) {
        return null;
      }
      return {
        kind: pendingMedia.kind,
        source: pendingMedia.uri,
        durationSeconds: pendingMedia.durationSeconds,
        progress: item.uploadProgress,
        pending: true,
      } satisfies MediaContent;
    }
    if (isDeleted || !isMediaKind(item.message_type) || !item.media_path) {
      return null;
    }
    return {
      kind: item.message_type,
      source: mediaUrl ?? null,
      durationSeconds: item.media_duration ?? undefined,
      pending: false,
    } satisfies MediaContent;
  })();

  const receipt = (() => {
    if (isPending) {
      return item.status === 'sending' || item.status === 'uploading' ? (
        <ActivityIndicator size={10} color={colors.textMuted} style={styles.receipt} />
      ) : null;
    }
    // Group messages do not carry read/delivered receipts (unread is tracked
    // with a per-member watermark instead).
    if (!('read_at' in item)) {
      return null;
    }
    if (item.read_at) {
      return (
        <Ionicons
          name="checkmark-done"
          size={14}
          color={colors.primary}
          style={styles.receipt}
        />
      );
    }
    if (item.delivered_at) {
      return (
        <Ionicons name="checkmark-done" size={14} color={colors.textMuted} style={styles.receipt} />
      );
    }
    return <Ionicons name="checkmark" size={14} color={colors.textMuted} style={styles.receipt} />;
  })();

  const bubbleStyle = isMine ? styles.bubbleMine : styles.bubbleTheirs;
  const textColor = isMine ? colors.surface : colors.text;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {!isMine && senderName ? (
        <AppText
          variant="caption"
          weight="semibold"
          color={colors.primary}
          numberOfLines={1}
          style={styles.senderName}
        >
          {senderName}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onLongPress={onLongPress}
        delayLongPress={300}
        style={[styles.bubble, bubbleStyle, isFailed && styles.bubbleFailed]}
      >
        {replyText ? (
          <View style={[styles.replyBox, isMine ? styles.replyMine : styles.replyTheirs]}>
            <AppText
              variant="caption"
              weight="semibold"
              color={isMine ? colors.primarySoft : colors.primary}
              numberOfLines={1}
            >
              Reply
            </AppText>
            <AppText
              variant="caption"
              color={isMine ? colors.surface : colors.textSecondary}
              numberOfLines={2}
            >
              {replyText}
            </AppText>
          </View>
        ) : null}

        {media ? <MediaBlock media={media} isMine={isMine} /> : null}

        {isDeleted ? (
          <AppText variant="body" color={isMine ? colors.primaryMuted : colors.textMuted}>
            This message was deleted
          </AppText>
        ) : body ? (
          <AppText variant="body" color={textColor}>
            {body}
          </AppText>
        ) : null}

        {isFailed ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <AppText variant="caption" color={colors.danger} weight="semibold">
              Tap to retry
            </AppText>
          </Pressable>
        ) : null}

        <View style={styles.meta}>
          {isMine ? receipt : null}
          <AppText
            variant="caption"
            color={isMine ? colors.primaryMuted : colors.textMuted}
            style={styles.time}
          >
            {formatMessageTime(createdAt)}
          </AppText>
        </View>
      </Pressable>

      {reactions.length > 0 ? (
        <View style={styles.reactionsRow}>
          {reactions.map((group) => (
            <Pressable
              key={group.emoji}
              accessibilityRole="button"
              onPress={() => onReact?.(group.emoji, group.mine)}
              style={[styles.reaction, group.mine && styles.reactionMine]}
            >
              <AppText variant="caption">{group.emoji}</AppText>
              <AppText variant="caption" weight="semibold" style={styles.reactionCount}>
                {group.count}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MediaBlock({ media, isMine }: { media: MediaContent; isMine: boolean }) {
  if (media.kind === 'image') {
    if (media.source) {
      return (
        <View style={styles.mediaWrap}>
          <Image
            source={{ uri: media.source }}
            style={styles.mediaImage}
            contentFit="cover"
            transition={150}
          />
          {media.pending ? <ProgressOverlay progress={media.progress} /> : null}
        </View>
      );
    }
    return <MediaPlaceholder isMine={isMine} loading />;
  }

  if (media.kind === 'video') {
    if (media.source) {
      return (
        <View style={styles.mediaWrap}>
          <VideoBubble uri={media.source} />
          {media.pending ? <ProgressOverlay progress={media.progress} /> : null}
        </View>
      );
    }
    return <MediaPlaceholder isMine={isMine} icon="videocam-outline" />;
  }

  if (media.source) {
    return (
      <View style={styles.voiceWrap}>
        <VoiceNotePlayer
          uri={media.source}
          durationSeconds={media.durationSeconds}
          isMine={isMine}
        />
      </View>
    );
  }
  return <MediaPlaceholder isMine={isMine} icon="mic-outline" />;
}

function VideoBubble({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={styles.mediaVideo} nativeControls contentFit="cover" />;
}

function MediaPlaceholder({
  isMine,
  icon,
  loading = false,
}: {
  isMine: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
}) {
  const tint = isMine ? colors.primaryMuted : colors.textMuted;
  return (
    <View style={[styles.mediaPlaceholder, isMine ? styles.placeholderMine : styles.placeholderTheirs]}>
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : icon ? (
        <Ionicons name={icon} size={28} color={tint} />
      ) : null}
      <AppText variant="caption" color={tint}>
        Loading…
      </AppText>
    </View>
  );
}

function ProgressOverlay({ progress = 0 }: { progress?: number }) {
  const fraction = Math.min(1, Math.max(0, progress ?? 0));
  return (
    <View style={styles.overlay}>
      <AppText variant="label" weight="semibold" color={colors.surface}>
        {Math.round(fraction * 100)}%
      </AppText>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: spacing.xxs,
    maxWidth: '78%',
  },
  rowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  senderName: {
    marginBottom: spacing.xxs,
    marginLeft: spacing.xs,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: colors.danger,
  },
  replyBox: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.xs,
    paddingLeft: spacing.sm,
  },
  replyMine: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  replyTheirs: {
    backgroundColor: colors.surfaceMuted,
  },
  mediaWrap: {
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  mediaImage: {
    width: 240,
    height: 180,
    borderRadius: radius.md,
  },
  mediaVideo: {
    width: 240,
    height: 200,
    borderRadius: radius.md,
    backgroundColor: '#000',
  },
  voiceWrap: {
    marginBottom: spacing.xxs,
  },
  mediaPlaceholder: {
    width: 240,
    height: 160,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  placeholderMine: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  placeholderTheirs: {
    backgroundColor: colors.surfaceMuted,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(22, 22, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    width: '70%',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xxs,
  },
  receipt: {
    marginRight: 2,
  },
  time: {
    fontSize: 11,
  },
  reactionsRow: {
    flexDirection: 'row',
    marginTop: spacing.xxs,
    marginBottom: spacing.xxs,
    flexWrap: 'wrap',
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginRight: spacing.xxs,
  },
  reactionMine: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  reactionCount: {
    marginLeft: 2,
    color: colors.textSecondary,
  },
});

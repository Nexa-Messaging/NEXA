import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui/AppText';
import { VoiceNotePlayer } from '@/components/VoiceNotePlayer';
import { StoryReplyPreview } from '@/components/stories/StoryReplyPreview';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
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
  replyText?: string | null;
  meId: string;
  senderName?: string | null;
  mediaUrl?: string | null;
  onLongPress: () => void;
  onRetry?: () => void;
  onReact?: (emoji: string, hasMine: boolean) => void;
  /** Double-tap / swipe-right to reply — passes the message ID. */
  onReply?: (messageId: string) => void;
  /** Tap the reply-quote to scroll to the original message. */
  onScrollToReply?: (replyToId: string) => void;
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

function getMessageId(item: ChatItem): string | undefined {
  if ('id' in item && typeof item.id === 'string') return item.id;
  return undefined;
}

function getReplyToId(item: ChatItem): string | null {
  if (!('reply_to_id' in item)) return null;
  return (item as { reply_to_id?: string | null }).reply_to_id ?? null;
}

function getEditedAt(item: ChatItem): string | null {
  if (!('edited_at' in item)) return null;
  return (item as { edited_at?: string | null }).edited_at ?? null;
}

function getStoryId(item: ChatItem): string | null {
  if (!('story_id' in item)) return null;
  return (item as { story_id?: string | null }).story_id ?? null;
}

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
  onReply,
  onScrollToReply,
}: MessageBubbleProps) {
  const { colors } = useAppTheme();
  const isPending = 'status' in item;
  const isFailed = isPending && item.status === 'failed';
  const isDeleted = !isPending && item.deleted_at != null;
  const body = isPending ? item.body : item.body;
  const createdAt = isPending ? item.createdAt : item.created_at;
  const reactions = isPending || isDeleted ? [] : groupReactions(item.reactions, meId);
  const replyToId = getReplyToId(item);
  const editedAt = getEditedAt(item);
  const storyId = getStoryId(item);
  const msgId = getMessageId(item);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (msgId) onReply?.(msgId);
    });

  const handleReplyBoxPress = useCallback(() => {
    if (replyToId) onScrollToReply?.(replyToId);
  }, [replyToId, onScrollToReply]);

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
        <ActivityIndicator size={10} color={colors.primaryMuted} style={styles.receipt} />
      ) : null;
    }
    if (!('read_at' in item)) {
      return null;
    }
    if (item.read_at) {
      return (
        <Ionicons
          name="checkmark-done"
          size={14}
          color={colors.headerText}
          style={styles.receipt}
        />
      );
    }
    if (item.delivered_at) {
      return (
        <Ionicons name="checkmark-done" size={14} color={colors.primaryMuted} style={styles.receipt} />
      );
    }
    return <Ionicons name="checkmark" size={14} color={colors.primaryMuted} style={styles.receipt} />;
  })();

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {!isMine && senderName ? (
        <AppText
          variant="caption"
          weight="bold"
          color={colors.primary}
          numberOfLines={1}
          style={styles.senderName}
        >
          {senderName}
        </AppText>
      ) : null}
      <GestureDetector gesture={doubleTap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            media
              ? media.kind === 'voice'
                ? 'Voice message, double tap and hold for options'
                : `${media.kind} message, double tap and hold for options`
              : undefined
          }
          onLongPress={onLongPress}
          delayLongPress={300}
          style={[
            styles.bubble,
            isMine ? styles.bubbleMineWrap : styles.bubbleTheirs,
            !isMine && { backgroundColor: colors.surface, borderColor: colors.border },
            isFailed && styles.bubbleFailed,
          ]}
        >
          {isMine ? (
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.bubbleMine]}
            />
          ) : null}

          {replyText ? (
            <Pressable
              onPress={handleReplyBoxPress}
              style={[
                styles.replyBox,
                isMine ? styles.replyMine : null,
                !isMine && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <AppText
                variant="caption"
                weight="bold"
                color={isMine ? colors.headerText : colors.primary}
                numberOfLines={1}
              >
                Reply
              </AppText>
              <AppText
                variant="caption"
                color={isMine ? colors.headerText : colors.textSecondary}
                numberOfLines={2}
              >
                {replyText}
              </AppText>
            </Pressable>
          ) : null}

          {storyId ? <StoryReplyPreview storyId={storyId} /> : null}

          {media ? <MediaBlock media={media} isMine={isMine} /> : null}

          {isDeleted ? (
            <AppText variant="body" color={isMine ? colors.headerText : colors.textMuted}>
              This message was deleted
            </AppText>
          ) : body ? (
            <View style={styles.bodyRow}>
              <AppText variant="body" color={isMine ? colors.headerText : colors.text}>
                {body}
              </AppText>
              {editedAt ? (
                <AppText
                  variant="caption"
                  color={isMine ? 'rgba(255,255,255,0.55)' : colors.textMuted}
                  style={styles.editedTag}
                >
                  (edited)
                </AppText>
              ) : null}
            </View>
          ) : null}

          {isFailed ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <AppText variant="caption" tone="danger" weight="bold">
                Tap to retry
              </AppText>
            </Pressable>
          ) : null}

          <View style={styles.meta}>
            {isMine ? receipt : null}
            <AppText
              variant="caption"
              color={isMine ? colors.headerText : colors.textMuted}
              style={styles.time}
            >
              {formatMessageTime(createdAt)}
            </AppText>
          </View>
        </Pressable>
      </GestureDetector>

      {reactions.length > 0 ? (
        <View style={styles.reactionsRow}>
          {reactions.map((group) => (
            <Pressable
              key={group.emoji}
              accessibilityRole="button"
              onPress={() => onReact?.(group.emoji, group.mine)}
              style={[
                styles.reaction,
                { backgroundColor: colors.surface, borderColor: colors.border },
                group.mine && [styles.reactionMine, { backgroundColor: colors.pinkSoft }],
              ]}
            >
              <AppText variant="caption">{group.emoji}</AppText>
              <AppText variant="caption" weight="bold" style={[styles.reactionCount, { color: colors.textSecondary }]}>
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
  const { colors } = useAppTheme();
  const tint = isMine ? colors.headerText : colors.textMuted;
  return (
    <View
      style={[
        styles.mediaPlaceholder,
        isMine ? styles.placeholderMine : null,
        !isMine && { backgroundColor: colors.surfaceMuted },
      ]}
    >
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
  const { colors } = useAppTheme();
  const fraction = Math.min(1, Math.max(0, progress ?? 0));
  return (
    <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
      <AppText variant="label" weight="bold" color={colors.headerText}>
        {Math.round(fraction * 100)}%
      </AppText>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { backgroundColor: colors.headerText, width: `${fraction * 100}%` }]}
        />
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
    overflow: 'hidden',
  },
  bubbleMineWrap: {
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  senderName: {
    marginBottom: spacing.xxs,
    marginLeft: spacing.xs,
  },
  bubbleMine: {
    borderBottomRightRadius: radius.sm,
  },
  bubbleTheirs: {
    borderWidth: 1,
    borderBottomLeftRadius: radius.sm,
    ...shadows.soft,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  editedTag: {
    fontSize: 10,
    marginLeft: 4,
    fontStyle: 'italic',
    marginTop: 2,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
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
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginRight: spacing.xxs,
    ...shadows.soft,
  },
  reactionMine: {
    borderColor: colors.pink,
  },
  reactionCount: {
    marginLeft: 2,
  },
});

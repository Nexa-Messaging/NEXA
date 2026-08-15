import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';

import { Avatar } from '@/components/Avatar';
import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, spacing } from '@/constants/theme';
import { StoryFeedEntry } from '@/hooks/useStories';
import {
  deleteStory,
  fetchStoryReplies,
  fetchStoryViewers,
  reactToStory,
  recordStoryView,
  removeStoryReaction,
  resolveStoryMediaUrl,
  sendStoryReply,
} from '@/lib/stories';
import { StoryFeedRow, StoryReplyFeed, StoryViewer } from '@/types/database';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😢', '😮', '🔥'];

export interface StoryViewerModalProps {
  visible: boolean;
  entries: StoryFeedEntry[];
  /** Which user to open the viewer on (null defaults to the first entry). */
  initialUserId: string | null;
  meId: string;
  onClose: () => void;
  /** Called when a story is deleted so the feed can refresh. */
  onStoriesChanged: () => void;
}

function durationFor(story: StoryFeedRow | undefined): number {
  if (!story) {
    return 5;
  }
  if (story.kind === 'video' && story.media_duration != null && story.media_duration > 0.5) {
    return story.media_duration;
  }
  if (story.kind === 'photo') {
    return 6;
  }
  return 5;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) {
    return 'now';
  }
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h`;
  }
  return `${Math.floor(hrs / 24)}d`;
}

/** Picks a vibrant, immersive background gradient for text stories. */
const TEXT_STORY_GRADIENTS = [
  gradients.brand,
  gradients.sunset,
  gradients.ocean,
  gradients.candy,
  gradients.meadow,
] as const;

function textGradientFor(storyId: string): readonly [string, string, ...string[]] {
  const key = storyId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TEXT_STORY_GRADIENTS[key % TEXT_STORY_GRADIENTS.length];
}

/**
 * Full-screen Snapchat-style story viewer: progress bars, tap zones for
 * next/previous, hold-free pause on the center tap, emoji reactions, replies
 * (which open a DM with the author) and, for own stories, a viewers list and
 * delete. Views are recorded once per story.
 */
export function StoryViewerModal({
  visible,
  entries,
  initialUserId,
  meId,
  onClose,
  onStoriesChanged,
}: StoryViewerModalProps) {
  const [userId, setUserId] = useState<string | null>(initialUserId);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [localReactions, setLocalReactions] = useState<Record<string, string | null>>({});
  const localViewed = useRef<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[] | null>(null);
  const [replies, setReplies] = useState<StoryReplyFeed[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const latestValue = useRef(0);
  const totalMs = useRef(5000);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      latestValue.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const entry = entries.find((item) => item.user_id === userId) ?? null;
  const story = entry?.stories[storyIndex] ?? null;

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (!story) {
      if (entries.length === 0) {
        onClose();
        return;
      }
      const first = entries[0];
      setUserId(first.user_id);
      setStoryIndex(0);
    }
  }, [visible, story, entries, onClose]);

  const stopAnimation = useCallback(() => {
    animation.current?.stop();
    animation.current = null;
  }, []);

  const startAnimation = useCallback(
    (fromFraction: number, ms: number, onDone: () => void) => {
      stopAnimation();
      progress.setValue(fromFraction);
      latestValue.current = fromFraction;
      const anim = Animated.timing(progress, {
        toValue: 1,
        duration: ms,
        useNativeDriver: false,
      });
      animation.current = anim;
      anim.start(({ finished }) => {
        animation.current = null;
        if (finished) {
          onDone();
        }
      });
    },
    [progress, stopAnimation],
  );

  const goNext = useCallback(() => {
    if (!entry) {
      return;
    }
    setPaused(false);
    if (storyIndex + 1 < entry.stories.length) {
      setStoryIndex((current) => current + 1);
      return;
    }
    const idx = entries.findIndex((item) => item.user_id === userId);
    if (idx >= 0 && idx + 1 < entries.length) {
      setUserId(entries[idx + 1].user_id);
      setStoryIndex(0);
      return;
    }
    onClose();
  }, [entry, entries, userId, storyIndex, onClose]);

  const goPrev = useCallback(() => {
    if (!entry) {
      return;
    }
    setPaused(false);
    if (storyIndex - 1 >= 0) {
      setStoryIndex((current) => current - 1);
      return;
    }
    const idx = entries.findIndex((item) => item.user_id === userId);
    if (idx > 0) {
      const previous = entries[idx - 1];
      setUserId(previous.user_id);
      setStoryIndex(previous.stories.length - 1);
    }
  }, [entry, entries, userId, storyIndex]);

  // (Re)start the auto-advance for the current story.
  useEffect(() => {
    if (!visible || !story) {
      return;
    }
    totalMs.current = durationFor(story) * 1000;
    stopAnimation();
    progress.setValue(0);
    latestValue.current = 0;
    if (!paused) {
      startAnimation(0, totalMs.current, goNext);
    }

    if (story.kind !== 'text' && story.media_path) {
      const id = story.story_id;
      if (!mediaUrls[id]) {
        void resolveStoryMediaUrl(id, story.media_path).then((result) => {
          if (result.url) {
            setMediaUrls((prev) => ({ ...prev, [id]: result.url as string }));
          }
        });
      }
    }
    return () => stopAnimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId, storyIndex, entries]);

  // Pause / resume the current story's timer.
  useEffect(() => {
    if (!visible || !story) {
      return;
    }
    if (paused) {
      stopAnimation();
      return;
    }
    const remaining = Math.max(0, 1 - Math.min(1, latestValue.current));
    if (remaining <= 0.001) {
      goNext();
      return;
    }
    startAnimation(latestValue.current, remaining * totalMs.current, goNext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Record a view once per story.
  useEffect(() => {
    if (!visible || !story || story.user_id === meId) {
      return;
    }
    if (story.viewed || localViewed.current.has(story.story_id)) {
      return;
    }
    localViewed.current.add(story.story_id);
    void recordStoryView(story.story_id).then((error) => {
      if (error) {
        localViewed.current.delete(story.story_id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, story?.story_id, userId, storyIndex]);

  const onTap = (x: number) => {
    const width = Dimensions.get('window').width;
    if (x < width / 3) {
      goPrev();
    } else if (x > (2 * width) / 3) {
      goNext();
    } else {
      setPaused((current) => !current);
    }
  };

  const handleReact = (emoji: string) => {
    if (!story) {
      return;
    }
    const current = localReactions[story.story_id] ?? story.my_reaction ?? null;
    if (current === emoji) {
      setLocalReactions((prev) => ({ ...prev, [story.story_id]: null }));
      void removeStoryReaction(story.story_id);
    } else {
      setLocalReactions((prev) => ({ ...prev, [story.story_id]: emoji }));
      void reactToStory(story.story_id, emoji);
    }
  };

  const handleReply = async () => {
    if (!story || !replyText.trim()) {
      return;
    }
    setSendingReply(true);
    setActionError(null);
    const result = await sendStoryReply(story.story_id, replyText.trim());
    setSendingReply(false);
    if (result.ok) {
      setReplyText('');
      setTimeout(() => setReplyOpen(false), 700);
    } else {
      setActionError(result.error);
    }
  };

  const openInsights = async () => {
    if (!story || insightsOpen) {
      return;
    }
    setInsightsOpen(true);
    setInsightsLoading(true);
    setViewers(null);
    setReplies(null);
    const [viewerResult, replyResult] = await Promise.all([
      fetchStoryViewers(story.story_id),
      fetchStoryReplies(story.story_id),
    ]);
    setViewers(viewerResult.data ?? []);
    setReplies(replyResult.data ?? []);
    setInsightsLoading(false);
  };

  const confirmDelete = () => {
    if (!story) {
      return;
    }
    Alert.alert('Delete story?', 'This removes the story and its media for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
    ]);
  };

  const performDelete = async () => {
    if (!story) {
      return;
    }
    const error = await deleteStory(story.story_id);
    if (error) {
      setActionError(error);
      return;
    }
    onStoriesChanged();
    onClose();
  };

  if (!visible) {
    return null;
  }

  const isMine = story?.user_id === meId;
  const myReaction = story ? localReactions[story.story_id] ?? story.my_reaction ?? null : null;
  const mediaUrl = story ? mediaUrls[story.story_id] ?? null : null;
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            story
              ? `Story by ${entry?.display_name ?? 'user'}, tap the left side for previous, right side for next`
              : 'Story viewer'
          }
          style={styles.fill}
          onPress={(event) => onTap(event.nativeEvent.locationX)}
        >
          <StoryContent story={story} url={mediaUrl} paused={paused} isMine={isMine} />
        </Pressable>

        {/* Top scrim + progress bars + header */}
        <View style={styles.topOverlay} pointerEvents="box-none">
          {entry ? (
            <View style={styles.barsRow}>
              {entry.stories.map((item, index) => (
                <View key={item.story_id} style={styles.barSegment}>
                  {index < storyIndex ? (
                    <View style={[styles.barFill, styles.barDone]} />
                  ) : index === storyIndex ? (
                    <Animated.View style={[styles.barFill, { width: fillWidth }]} />
                  ) : (
                    <View style={styles.barTrack} />
                  )}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close story" hitSlop={12} onPress={onClose} style={styles.headerButton}>
              <Ionicons name="chevron-down" size={26} color={colors.surface} />
            </Pressable>
            {story ? (
              <>
                <Avatar uri={entry?.avatar_url} name={entry?.display_name} size={34} />
                <View style={styles.headerIdentity}>
                  <AppText variant="label" weight="semibold" color={colors.surface} numberOfLines={1}>
                    {entry?.display_name}
                  </AppText>
                  <AppText variant="caption" color={colors.surface} style={styles.headerTime}>
                    {timeAgo(story.created_at)}
                    {isMine ? ` · ${story.view_count} ${story.view_count === 1 ? 'view' : 'views'}` : ''}
                  </AppText>
                </View>
              </>
            ) : null}
            <View style={styles.headerActions}>
              {isMine ? (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="View story insights" hitSlop={8} onPress={() => void openInsights()} style={styles.headerButton}>
                    <Ionicons name="eye-outline" size={22} color={colors.surface} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete story" hitSlop={8} onPress={confirmDelete} style={styles.headerButton}>
                    <Ionicons name="trash-outline" size={22} color={colors.surface} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reply to story"
                  hitSlop={8}
                  onPress={() => {
                    setActionError(null);
                    setReplyOpen((current) => !current);
                  }}
                  style={styles.headerButton}
                >
                  <Ionicons name="chatbubble-outline" size={22} color={colors.surface} />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Caption for media stories */}
        {story && !isMine && story.kind !== 'text' && story.body ? (
          <View style={styles.captionOverlay} pointerEvents="none">
            <AppText variant="body" color={colors.surface} style={styles.captionText}>
              {story.body}
            </AppText>
          </View>
        ) : null}

        {/* Bottom controls */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          {isMine ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void openInsights()} style={styles.insightsButton}>
              <Ionicons name="people-outline" size={16} color={colors.surface} />
              <AppText variant="caption" weight="semibold" color={colors.surface}>
                Seen by {story ? story.view_count : 0}
              </AppText>
            </Pressable>
          ) : (
            <View style={styles.reactionRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  onPress={() => handleReact(emoji)}
                  style={[styles.reactionChip, myReaction === emoji && styles.reactionChipActive]}
                >
                  <AppText variant="label">{emoji}</AppText>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Reply composer */}
        {replyOpen && story && !isMine ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.replyComposer}
          >
            {actionError ? (
              <AppText variant="caption" color={colors.danger} style={styles.replyError}>
                {actionError}
              </AppText>
            ) : null}
            <View style={styles.replyRow}>
              <TextInput
                style={styles.replyInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder={`Reply to ${entry?.display_name ?? 'story'}…`}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
                accessibilityLabel="Story reply"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send reply"
                disabled={sendingReply || !replyText.trim()}
                onPress={() => void handleReply()}
                style={[styles.sendButton, (!replyText.trim() || sendingReply) && styles.sendButtonDisabled]}
              >
                {sendingReply ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Ionicons name="arrow-back" size={18} color={colors.surface} style={styles.sendArrow} />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {/* Insights sheet (own stories) */}
        {insightsOpen ? (
          <Modal visible transparent animationType="slide" onRequestClose={() => setInsightsOpen(false)}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setInsightsOpen(false)}>
              <Pressable style={styles.sheet} onPress={() => {}}>
                <AppText variant="label" weight="semibold" color={colors.textSecondary} align="center">
                  SEEN BY {story ? story.view_count : 0}
                </AppText>
                {insightsLoading ? (
                  <ActivityIndicator color={colors.primary} style={styles.sheetLoading} />
                ) : (
                  <View style={styles.sheetList}>
                    {(viewers ?? []).map((viewer) => (
                      <View key={viewer.viewer_id} style={styles.viewerRow}>
                        <Avatar uri={viewer.avatar_url} name={viewer.display_name} size={36} />
                        <View style={styles.viewerIdentity}>
                          <AppText variant="body" weight="semibold" numberOfLines={1}>
                            {viewer.display_name}
                          </AppText>
                          <AppText variant="caption" color={colors.textSecondary}>
                            @{viewer.username} · {timeAgo(viewer.viewed_at)}
                          </AppText>
                        </View>
                      </View>
                    ))}
                    {(viewers ?? []).length === 0 ? (
                      <AppText variant="body" color={colors.textSecondary} align="center" style={styles.sheetEmpty}>
                        No one has viewed this story yet.
                      </AppText>
                    ) : null}

                    <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.sheetRepliesTitle}>
                      REPLIES
                    </AppText>
                    {(replies ?? []).length === 0 ? (
                      <AppText variant="body" color={colors.textSecondary} align="center" style={styles.sheetEmpty}>
                        No replies yet.
                      </AppText>
                    ) : (
                      (replies ?? []).map((reply) => (
                        <View key={reply.reply_id} style={styles.viewerRow}>
                          <Avatar uri={reply.avatar_url} name={reply.display_name} size={36} />
                          <View style={styles.viewerIdentity}>
                            <AppText variant="body" weight="semibold" numberOfLines={1}>
                              {reply.display_name}
                            </AppText>
                            <AppText variant="body" color={colors.textSecondary}>
                              {reply.body}
                            </AppText>
                            <AppText variant="caption" color={colors.textMuted}>
                              {timeAgo(reply.created_at)}
                            </AppText>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    </Modal>
  );
}

function StoryContent({
  story,
  url,
  paused,
  isMine,
}: {
  story: StoryFeedRow | null;
  url: string | null;
  paused: boolean;
  isMine: boolean;
}) {
  if (!story) {
    return null;
  }
  if (story.kind === 'text') {
    return (
      <LinearGradient
        colors={textGradientFor(story.story_id)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.textStory}
      >
        <View style={styles.textStoryBlob}>
          <Ionicons name="sparkles" size={30} color="rgba(255,255,255,0.5)" />
        </View>
        <AppText variant="display" weight="bold" color={colors.surface} align="center" style={styles.textStoryBody}>
          {story.body}
        </AppText>
      </LinearGradient>
    );
  }
  if (!url) {
    return (
      <View style={styles.loadingArea}>
        <ActivityIndicator size="large" color={colors.surface} />
      </View>
    );
  }
  if (story.kind === 'video') {
    return <StoryVideo key={story.story_id} uri={url} paused={paused} />;
  }
  return (
    <Image
      source={{ uri: url }}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      transition={150}
    />
  );
}

function StoryVideo({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, player]);

  return (
    <View style={styles.videoArea}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14102A',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(10, 8, 24, 0.25)',
  },
  barsRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  barSegment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginHorizontal: 2,
    overflow: 'hidden',
  },
  barTrack: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  barDone: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    height: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIdentity: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  headerTime: {
    marginTop: 1,
    color: 'rgba(255,255,255,0.75)',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  reactionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    margin: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  reactionChipActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  insightsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  captionOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 96,
    alignItems: 'center',
  },
  captionText: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  replyComposer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(20,20,28,0.85)',
  },
  replyError: {
    marginBottom: spacing.xs,
    alignSelf: 'center',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  replyInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    marginLeft: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendArrow: {
    transform: [{ rotate: '90deg' }],
  },
  textStory: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  textStoryBlob: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    opacity: 0.9,
  },
  textStoryBody: {
    lineHeight: 44,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  sheetLoading: {
    marginTop: spacing.lg,
  },
  sheetList: {
    marginTop: spacing.md,
  },
  sheetEmpty: {
    paddingVertical: spacing.sm,
  },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  viewerIdentity: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  sheetRepliesTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});
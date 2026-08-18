import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { fetchStory, resolveStoryMediaUrl } from '@/lib/stories';
import { StoryRow } from '@/types/database';

/**
 * Compact preview of the story a DM is replying to. Rendered inside the
 * message bubble so the recipient can tell exactly which story was answered.
 * Stories that expired or were deleted before viewing degrade to a muted
 * placeholder instead of breaking the chat.
 */
export function StoryReplyPreview({ storyId }: { storyId: string }) {
  const { colors } = useAppTheme();
  const [story, setStory] = useState<StoryRow | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const token = useRef(0);

  useEffect(() => {
    const current = ++token.current;
    setStory(undefined);
    setUrl(null);
    void fetchStory(storyId).then((result) => {
      if (current !== token.current) {
        return;
      }
      if (result.error || !result.data) {
        setStory((prev) => (prev === undefined ? null : prev));
        return;
      }
      setStory(result.data);
      if (result.data.kind !== 'text' && result.data.media_path) {
        void resolveStoryMediaUrl(storyId, result.data.media_path).then((media) => {
          if (current !== token.current) {
            return;
          }
          if (media.url) {
            setUrl(media.url);
          }
        });
      }
    });
    return () => {
      token.current += 1;
    };
  }, [storyId]);

  const containerStyle = [
    styles.card,
    { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  ];

  if (story === undefined) {
    return (
      <View style={containerStyle}>
        <View style={styles.thumb}>
          <ActivityPlaceholder />
        </View>
        <View style={styles.labelColumn}>
          <AppText variant="caption" weight="bold" color={colors.textMuted}>
            Story
          </AppText>
        </View>
      </View>
    );
  }

  if (story === null) {
    return (
      <View style={containerStyle}>
        <View style={[styles.thumb, styles.expiredThumb]}>
          <Ionicons name="time-outline" size={20} color={colors.textMuted} />
        </View>
        <View style={styles.labelColumn}>
          <AppText variant="caption" weight="bold" color={colors.textMuted}>
            Story expired
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {story.kind === 'text' ? (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.thumb}
        >
          <Ionicons name="sparkles" size={20} color="#fff" />
        </LinearGradient>
      ) : url ? (
        <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" transition={120} />
      ) : (
        <View style={styles.thumb}>
          <ActivityPlaceholder />
        </View>
      )}
      <View style={styles.labelColumn}>
        <AppText variant="caption" weight="bold" color={colors.textSecondary} numberOfLines={1}>
          Story reply
        </AppText>
        {story.kind === 'text' && story.body ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {story.body}
          </AppText>
        ) : (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            Tap the story they replied to
          </AppText>
        )}
      </View>
    </View>
  );
}

function ActivityPlaceholder() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.activity}>
      <Ionicons name="images-outline" size={18} color={colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xs,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(128,128,128,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  expiredThumb: {
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  labelColumn: {
    flex: 1,
    marginLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  activity: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
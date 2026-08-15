import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { StoryFeedEntry } from '@/hooks/useStories';

const AVATAR_SIZE = 64;
const TILE_WIDTH = 78;

export interface StoriesFeedSectionProps {
  meId: string;
  /** Own display name used for the "your story" tile label + initials. */
  ownDisplayName: string | null;
  entries: StoryFeedEntry[];
  onOpenUser: (userId: string) => void;
  onOpenComposer: () => void;
  /** Optional callback to open the friends screen (Home personality card). */
  onBrowseFriends?: () => void;
}

/**
 * Horizontal stories rail shown at the top of Home: "Your story" first (with a
 * "+" affordance when empty), then each friend with active stories. The ring is
 * highlighted until every story from that person has been viewed.
 */
export function StoriesFeedSection({
  meId,
  ownDisplayName,
  entries,
  onOpenUser,
  onOpenComposer,
  onBrowseFriends,
}: StoriesFeedSectionProps) {
  const own = entries.find((entry) => entry.user_id === meId) ?? null;
  const friends = entries.filter((entry) => entry.user_id !== meId);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold">
          Stories
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post a story"
          hitSlop={12}
          style={styles.addButton}
          onPress={onOpenComposer}
        >
          <Ionicons name="add" size={20} color={colors.surface} />
        </Pressable>
      </View>

      {friends.length === 0 && !own ? (
        <Pressable style={styles.emptyCard} onPress={onOpenComposer}>
          <Ionicons name="camera-outline" size={20} color={colors.primary} />
          <AppText variant="body" tone="secondary" style={styles.emptyText}>
            Post your first story — photos, video or text.
          </AppText>
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          <StoryTile
            label={own ? 'Your story' : 'Add story'}
            name={ownDisplayName}
            hasStories={!!own}
            hasUnseen={false}
            isAdd={!own}
            onPress={() => (own ? onOpenUser(meId) : onOpenComposer())}
          />
          {friends.map((entry) => (
            <StoryTile
              key={entry.user_id}
              label={entry.display_name}
              name={entry.display_name}
              avatarUri={entry.avatar_url}
              hasStories
              hasUnseen={entry.unseenCount > 0}
              onPress={() => onOpenUser(entry.user_id)}
            />
          ))}
        </ScrollView>
      )}

      {onBrowseFriends ? (
        <Pressable
          accessibilityRole="button"
          style={styles.friendsCard}
          onPress={onBrowseFriends}
        >
          <View style={styles.friendsIcon}>
            <Ionicons name="people" size={20} color={colors.surface} />
          </View>
          <AppText variant="body" weight="bold" style={styles.friendsText}>
            See your crew
          </AppText>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function StoryTile({
  label,
  name,
  avatarUri,
  hasStories,
  hasUnseen,
  isAdd = false,
  onPress,
}: {
  label: string;
  name: string | null;
  avatarUri?: string | null;
  hasStories: boolean;
  hasUnseen: boolean;
  isAdd?: boolean;
  onPress: () => void;
}) {
  const ringSize = AVATAR_SIZE + 12;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.tile}
      onPress={onPress}
    >
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
          },
          hasStories && hasUnseen ? styles.ringUnseen : styles.ringSeen,
        ]}
      >
        <Avatar uri={avatarUri} name={name} size={AVATAR_SIZE} ring={hasStories && hasUnseen} />
      </View>
      {isAdd ? (
        <View style={styles.addBadge}>
          <Ionicons name="add" size={16} color={colors.surface} />
        </View>
      ) : null}
      <AppText variant="caption" numberOfLines={1} align="center" style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  ring: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringUnseen: {
    borderColor: colors.pink,
  },
  ringSeen: {
    borderColor: colors.border,
  },
  addBadge: {
    position: 'absolute',
    bottom: 22,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.pink,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: spacing.xxs,
    width: '100%',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  friendsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendsIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  friendsText: {
    flex: 1,
  },
});
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StoriesFeedSection } from '@/components/stories/StoriesFeedSection';
import { StoryComposerModal } from '@/components/stories/StoryComposerModal';
import { StoryViewerModal } from '@/components/stories/StoryViewerModal';
import { AppText, Screen } from '@/components/ui';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { useStories } from '@/hooks/useStories';
import { useNotifications } from '@/hooks/useNotifications';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { user, profile } = useAuth();
  const { entries, loading, error, refresh } = useStories();
  const { unreadCount } = useNotifications();
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerUser, setViewerUser] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const meId = user?.id ?? '';

  const openUser = (userId: string) => {
    setViewerUser(userId);
    setViewerOpen(true);
  };

  const onStoriesChanged = () => {
    void refresh();
  };

  const firstName = profile?.display_name?.split(' ')[0] ?? '';

  return (
    <Screen padding={0} blobbed>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroText}>
              <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.heroLabel}>
                GOOD DAY, {firstName ? firstName.toUpperCase() : 'FRIEND'} ✦
              </AppText>
              <AppText variant="display" weight="bold" color={colors.headerText}>
                Home
              </AppText>
              <AppText variant="body" color={colors.headerText} style={styles.heroBody}>
                Drop a story, reply to friends, feel the vibe.
              </AppText>
            </View>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                hitSlop={12}
                style={styles.searchButton}
                onPress={() => router.push('/notifications')}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.headerText} />
                {unreadCount > 0 ? (
                  <View style={styles.heroBadge}>
                    <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.heroBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search"
                hitSlop={12}
                style={styles.searchButton}
                onPress={() => router.push('/search')}
              >
                <Ionicons name="search" size={22} color={colors.headerText} />
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {loading ? null : error ? (
          <AppText variant="caption" tone="danger" style={styles.error}>
            {error}
          </AppText>
        ) : null}

        <StoriesFeedSection
          meId={meId}
          ownDisplayName={profile?.display_name ?? null}
          entries={entries}
          onOpenUser={openUser}
          onOpenComposer={() => setComposerOpen(true)}
          onBrowseFriends={() => router.push('/friends')}
        />
      </ScrollView>

      <StoryViewerModal
        visible={viewerOpen}
        entries={entries}
        initialUserId={viewerUser}
        meId={meId}
        onClose={() => setViewerOpen(false)}
        onStoriesChanged={onStoriesChanged}
      />

      <StoryComposerModal
        visible={composerOpen}
        meId={meId}
        onClose={() => setComposerOpen(false)}
        onPosted={onStoriesChanged}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 0,
    paddingBottom: spacing.xxl,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroText: {
    flex: 1,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  heroBody: {
    marginTop: spacing.xs,
    opacity: 0.95,
    lineHeight: 22,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    ...shadows.soft,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  heroBadgeText: {
    fontSize: 10,
    lineHeight: 13,
  },
  error: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
});
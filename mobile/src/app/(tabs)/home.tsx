import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StoriesFeedSection } from '@/components/stories/StoriesFeedSection';
import { StoryComposerModal } from '@/components/stories/StoryComposerModal';
import { StoryViewerModal } from '@/components/stories/StoryViewerModal';
import { AppText, Screen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useStories } from '@/hooks/useStories';

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const { entries, loading, error, refresh } = useStories();
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

  return (
    <Screen padding={0}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="heading" weight="bold">
            Home
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search"
            hitSlop={12}
            style={styles.searchButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
        </View>

        {loading ? null : error ? (
          <AppText variant="caption" color={colors.danger} style={styles.error}>
            {error}
          </AppText>
        ) : null}

        <StoriesFeedSection
          meId={meId}
          ownDisplayName={profile?.display_name ?? null}
          entries={entries}
          onOpenUser={openUser}
          onOpenComposer={() => setComposerOpen(true)}
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
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  searchButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
});
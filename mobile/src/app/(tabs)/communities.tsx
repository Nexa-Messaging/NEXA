import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { AppButton, AppText, EmptyState, Screen, SectionHeader } from '@/components/ui';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useCommunities } from '@/hooks/useCommunities';
import { joinCommunity, joinMyClassCommunity, resolveCommunityAvatarUrl } from '@/lib/communities';
import { CommunityListEntry } from '@/types/database';
import { formatChatTime } from '@/utils/format';

export default function CommunitiesScreen() {
  const { colors } = useAppTheme();
  const { items, loading, refreshing, setRefreshing, error, realtime, refresh } =
    useCommunities();

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Resolve short-lived signed URLs for visible community photos.
  useEffect(() => {
    for (const entry of items) {
      if (!entry.avatar_path || avatarUrls[entry.community_id]) {
        continue;
      }
      void resolveCommunityAvatarUrl(entry.avatar_path).then((result) => {
        if (result.url) {
          setAvatarUrls((prev) => ({ ...prev, [entry.community_id]: result.url as string }));
        }
      });
    }
  }, [items, avatarUrls]);

  const hasMemberRow = items.some((entry) => entry.is_member);

  const handleJoin = async () => {
    if (joining) {
      return;
    }
    setJoining(true);
    setJoinError(null);
    const result = await joinMyClassCommunity();
    setJoining(false);
    if (!result.ok) {
      setJoinError(result.error);
      return;
    }
    await refresh();
    router.push({
      pathname: '/community/[communityId]',
      params: { communityId: result.communityId },
    });
  };

  const renderItem = ({ item }: { item: CommunityListEntry }) => {
    const avatarPath = avatarUrls[item.community_id] ?? null;
    const classLabel = `${item.school} · ${item.department} · ${item.level}`;
    return (
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && styles.rowPressed]}
        onPress={() => {
          if (item.is_member) {
            router.push({
              pathname: '/community/[communityId]',
              params: { communityId: item.community_id },
            });
          }
        }}
        disabled={!item.is_member}
      >
        <Avatar uri={avatarPath} name={item.name} size={52} ring={item.is_member} />
        <View style={styles.middle}>
          <View style={styles.titleRow}>
            {!item.is_member ? (
              <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            ) : null}
            <AppText variant="body" weight="bold" numberOfLines={1} style={styles.title}>
              {item.name}
            </AppText>
          </View>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {classLabel}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
          </AppText>
        </View>
        <View style={styles.side}>
          <AppText variant="caption" tone="muted" style={styles.time}>
            {formatChatTime(item.last_at)}
          </AppText>
          {item.is_member ? (
            item.unread_count > 0 ? (
              <View style={styles.badge}>
                <AppText
                  variant="caption"
                  weight="bold"
                  color={colors.headerText}
                  style={styles.badgeText}
                >
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </AppText>
              </View>
            ) : null
          ) : (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              style={styles.joinChip}
              onPress={() => {
                const result = joinCommunity(item.community_id);
                void result.then((joinErr) => {
                  if (joinErr) {
                    setJoinError(joinErr);
                  } else {
                    void refresh();
                  }
                });
              }}
            >
              <LinearGradient
                colors={gradients.candy}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <AppText variant="caption" color={colors.headerText} weight="bold">
                Join
              </AppText>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen padding={0} blobbed>
      <LinearGradient
        colors={gradients.sunset}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBand}
      >
        <View style={styles.header}>
          <View>
            <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.headerLabel}>
              YOUR CREW
            </AppText>
            <AppText variant="display" weight="bold" color={colors.headerText}>
              Circles
            </AppText>
          </View>
          <View style={styles.headerSticker}>
            <Ionicons name="color-palette" size={20} color={colors.headerText} />
          </View>
        </View>
      </LinearGradient>

      <RealtimeBanner status={realtime} />

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="label" tone="secondary" style={styles.stateText}>
            Loading communities…
          </AppText>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText
            variant="body"
            tone="secondary"
            align="center"
            style={styles.errorText}
          >
            {error}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void refresh()}>
            <AppText variant="label" color={colors.primary} weight="bold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : !hasMemberRow && items.length === 0 ? (
        <View style={styles.state}>
          <EmptyState
            icon="people-outline"
            title="No class community yet"
            description="Join your class community to chat with your schoolmates, share notes and stay up to date."
            action={
              <AppButton
                title="Join your class"
                variant="sunset"
                size="lg"
                loading={joining}
                disabled={joining}
                onPress={() => void handleJoin()}
              />
            }
          />
          {joinError ? (
            <AppText variant="caption" tone="danger" align="center" style={styles.joinError}>
              {joinError}
            </AppText>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.community_id}
          ListHeaderComponent={<SectionHeader title="Circles around you" />}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            joinError ? (
              <AppText variant="caption" tone="danger" align="center" style={styles.footerError}>
                {joinError}
              </AppText>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBand: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  headerLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  headerSticker: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.7,
  },
  middle: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flexShrink: 1,
    marginLeft: 4,
  },
  side: {
    alignItems: 'flex-end',
  },
  time: {
    marginBottom: spacing.xxs,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
  joinChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    overflow: 'hidden',
    ...shadows.soft,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  stateText: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  joinError: {
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  footerError: {
    paddingTop: spacing.lg,
  },
});
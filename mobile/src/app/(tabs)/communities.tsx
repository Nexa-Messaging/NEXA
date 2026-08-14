import { Ionicons } from '@expo/vector-icons';
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
import { AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useCommunities } from '@/hooks/useCommunities';
import { useAuth } from '@/lib/auth';
import { joinCommunity, joinMyClassCommunity, resolveCommunityAvatarUrl } from '@/lib/communities';
import { CommunityListEntry } from '@/types/database';
import { formatChatTime } from '@/utils/format';

export default function CommunitiesScreen() {
  const { user } = useAuth();
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
        style={styles.row}
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
        <Avatar uri={avatarPath} name={item.name} size={52} />
        <View style={styles.middle}>
          <View style={styles.titleRow}>
            {!item.is_member ? (
              <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            ) : null}
            <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.title}>
              {item.name}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {classLabel}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
          </AppText>
        </View>
        <View style={styles.side}>
          <AppText variant="caption" color={colors.textMuted} style={styles.time}>
            {formatChatTime(item.last_at)}
          </AppText>
          {item.is_member ? (
            item.unread_count > 0 ? (
              <View style={styles.badge}>
                <AppText
                  variant="caption"
                  weight="bold"
                  color={colors.surface}
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
              <AppText variant="caption" color={colors.primary} weight="semibold">
                Join
              </AppText>
            </Pressable>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold">
          Circles
        </AppText>
      </View>

      <RealtimeBanner status={realtime} />

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="label" color={colors.textSecondary} style={styles.stateText}>
            Loading communities…
          </AppText>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText
            variant="body"
            color={colors.textSecondary}
            align="center"
            style={styles.errorText}
          >
            {error}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void refresh()}>
            <AppText variant="label" color={colors.primary} weight="semibold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : !hasMemberRow && items.length === 0 ? (
        <View style={styles.state}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <AppText variant="heading" weight="bold" align="center" style={styles.emptyTitle}>
            No class community yet
          </AppText>
          <AppText
            variant="body"
            color={colors.textSecondary}
            align="center"
            style={styles.emptyBody}
          >
            Join your class community to chat with your schoolmates, share notes and
            stay up to date.
          </AppText>
          {joinError ? (
            <AppText variant="caption" color={colors.danger} align="center" style={styles.joinError}>
              {joinError}
            </AppText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={joining}
            style={[styles.emptyButton, joining ? styles.disabled : null]}
            onPress={() => void handleJoin()}
          >
            {joining ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <AppText variant="label" weight="semibold" color={colors.surface}>
                Join your class
              </AppText>
            )}
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.community_id}
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
              <AppText variant="caption" color={colors.danger} align="center" style={styles.footerError}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primarySoft,
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
  emptyTitle: {
    marginTop: spacing.md,
  },
  emptyBody: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  disabled: {
    opacity: 0.6,
  },
  joinError: {
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  footerError: {
    paddingTop: spacing.lg,
  },
});
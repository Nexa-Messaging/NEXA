import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import {
  fetchCommunityChannels,
  fetchCommunityInfo,
  resolveCommunityAvatarUrl,
  subscribeToCommunityMessages,
} from '@/lib/communities';
import { RealtimeStatus, subscribeToRealtimeStatus } from '@/lib/messaging';
import {
  CommunityChannelSummary,
  CommunityInfo,
  CommunityRole,
} from '@/types/database';

const CHANNEL_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  general: 'chatbubble-ellipses-outline',
  academics: 'school-outline',
  announcements: 'megaphone-outline',
  social: 'people-outline',
};

const ROLE_LABEL: Record<CommunityRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

function channelIcon(kind: string): keyof typeof Ionicons.glyphMap {
  return CHANNEL_ICON[kind] ?? 'chatbubble-ellipses-outline';
}

export default function CommunityScreen() {
  const params = useLocalSearchParams<{ communityId: string }>();
  const communityId = params.communityId;

  const [community, setCommunity] = useState<CommunityInfo | null>(null);
  const [channels, setChannels] = useState<CommunityChannelSummary[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');

  const load = useCallback(async () => {
    if (!communityId) {
      return;
    }
    const [infoResult, channelResult] = await Promise.all([
      fetchCommunityInfo(communityId),
      fetchCommunityChannels(communityId),
    ]);
    if (infoResult.error) {
      setError(infoResult.error);
    } else {
      setCommunity(infoResult.data);
      setChannels(channelResult.error ? [] : (channelResult.data ?? []));
      setError(null);
    }
  }, [communityId]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  // Resolve the community photo whenever it changes.
  useEffect(() => {
    if (!community?.avatar_path) {
      setAvatarUrl(null);
      return;
    }
    let active = true;
    void resolveCommunityAvatarUrl(community.avatar_path).then((result) => {
      if (active && result.url) {
        setAvatarUrl(result.url);
      }
    });
    return () => {
      active = false;
    };
  }, [community?.avatar_path]);

  // Refresh the channel previews when new messages arrive.
  useEffect(() => {
    if (!communityId) {
      return;
    }
    const offMessages = subscribeToCommunityMessages(() => {
      void load();
    });
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return () => {
      offMessages();
      offStatus();
    };
  }, [communityId, load]);

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (!community) {
    return (
      <Screen centered>
        <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
          {error ?? 'This community is no longer available.'}
        </AppText>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="label" color={colors.primary} weight="semibold">
            Go back
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
          {community.name}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Community info"
          hitSlop={12}
          style={styles.backButton}
          onPress={() =>
            router.push({
              pathname: '/community-info/[communityId]',
              params: { communityId },
            })
          }
        >
          <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <RealtimeBanner status={realtime} />

      <View style={styles.hero}>
        <Avatar uri={avatarUrl} name={community.name} size={64} />
        <View style={styles.heroText}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {community.name}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
            {community.school} · {community.department} · {community.level}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            {community.member_count} members ·{' '}
            {ROLE_LABEL[(community.my_role ?? 'member') as CommunityRole] ?? community.my_role}
          </AppText>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <AppText variant="label" color={colors.danger} style={styles.flex}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" hitSlop={10} onPress={() => void load()}>
            <Ionicons name="refresh" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={channels}
        keyExtractor={(item) => item.channel_id}
        ListHeaderComponent={
          <View style={styles.activities}>
            <Pressable
              accessibilityRole="button"
              style={styles.activityCard}
              onPress={() =>
                router.push({ pathname: '/polls/[communityId]', params: { communityId } })
              }
            >
              <View style={styles.activityIcon}>
                <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.middle}>
                <AppText variant="body" weight="semibold">
                  Polls
                </AppText>
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  Ask the community, watch the results
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.activityCard}
              onPress={() =>
                router.push({ pathname: '/events/[communityId]', params: { communityId } })
              }
            >
              <View style={styles.activityIcon}>
                <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.middle}>
                <AppText variant="body" weight="semibold">
                  Events
                </AppText>
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  Plan meetups, track who's coming
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={styles.channelRow}
            onPress={() =>
              router.push({
                pathname: '/channel/[channelId]',
                params: { channelId: item.channel_id },
              })
            }
          >
            <View style={styles.channelIcon}>
              <Ionicons name={channelIcon(item.kind)} size={22} color={colors.primary} />
            </View>
            <View style={styles.middle}>
              <AppText variant="body" weight="semibold" numberOfLines={1}>
                {item.name}
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {item.last_message || 'No messages yet'}
              </AppText>
            </View>
            <View style={styles.side}>
              {item.unread_count > 0 ? (
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
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
            </View>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primary}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.xs,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  activities: {
    marginBottom: spacing.xs,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  side: {
    alignItems: 'flex-end',
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
  chevron: {
    marginTop: spacing.xxs,
  },
  stateText: {
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
});
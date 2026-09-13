import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BondProgress } from '@/components/BondProgress';
import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchBondLeaderboard,
  fetchBond,
  BondLeaderboardEntry,
  BondInfo,
} from '@/lib/bonds';

export default function BondsScreen() {
  const { colors } = useAppTheme();
  useAuth();
  const [leaderboard, setLeaderboard] = useState<BondLeaderboardEntry[]>([]);
  const [myBonds, setMyBonds] = useState<Map<string, BondInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const [lbRes] = await Promise.all([
      fetchBondLeaderboard(20),
    ]);
    if (lbRes.data) {
      setLeaderboard(lbRes.data);
      // Fetch bond details for each friend
      const bondPromises = lbRes.data.map(entry => fetchBond(entry.friend_id));
      const bondResults = await Promise.all(bondPromises);
      const newMyBonds = new Map<string, BondInfo>();
      bondResults.forEach((res, i) => {
        if (res.data) {
          newMyBonds.set(lbRes.data![i].friend_id, res.data);
        }
      });
      setMyBonds(newMyBonds);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <Screen padding={0} blobbed>
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={colors.textSecondary}>Loading bonds…</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={0} blobbed>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Hero */}
        <LinearGradient
          colors={gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.heroLabel}>
            NEXA BONDS ✦
          </AppText>
          <AppText variant="display" weight="bold" color={colors.headerText}>
            Your Bonds
          </AppText>
          <AppText variant="caption" color={colors.headerText} style={{ opacity: 0.8, marginTop: 4 }}>
            Grow bonds through genuine interactions
          </AppText>
        </LinearGradient>

        {/* Top Bond (if any) */}
        {leaderboard.length > 0 && leaderboard[0] && myBonds.has(leaderboard[0].friend_id) && (
          <View style={styles.topBondCard}>
            <Card variant="pop" style={styles.topBondInner}>
              <Pressable
                style={styles.topBondRow}
                onPress={() => router.push({ pathname: '/bond/[friendId]', params: { friendId: leaderboard[0].friend_id } } as any)}
              >
                <View style={styles.rankOne}>
                  <AppText variant="display" weight="bold" color={colors.headerText} style={{ fontSize: 32 }}>
                    🥇
                  </AppText>
                </View>
                <Avatar
                  uri={leaderboard[0].friend_avatar_url}
                  name={leaderboard[0].friend_display_name}
                  size={60}
                  ring
                  moodSize="md"
                />
                <View style={styles.topBondInfo}>
                  <AppText variant="heading" weight="bold">
                    {leaderboard[0].friend_display_name}
                  </AppText>
                  <AppText variant="body" tone="secondary">@{leaderboard[0].friend_username}</AppText>
                  <BondProgress
                    level={myBonds.get(leaderboard[0].friend_id)!.level}
                    xp={myBonds.get(leaderboard[0].friend_id)!.xp}
                    nextLevelXP={myBonds.get(leaderboard[0].friend_id)!.next_level_xp}
                    progressPct={myBonds.get(leaderboard[0].friend_id)!.progress_pct}
                    size="md"
                    showXP
                  />
                </View>
              </Pressable>
            </Card>
          </View>
        )}

        {/* Leaderboard */}
        <View style={styles.section}>
          <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionTitle}>
            LEADERBOARD
          </AppText>

          {leaderboard.length === 0 ? (
            <Card variant="pop" style={styles.emptyCard}>
              <AppText variant="body" color={colors.text} align="center" style={styles.emptyText}>
                No bonds yet. Start chatting with friends to build your first bond!
              </AppText>
              <AppButton
                title="Find friends"
                variant="gradient"
                size="md"
                fullWidth
                style={{ marginTop: spacing.md }}
                onPress={() => router.push('/friends')}
              />
            </Card>
          ) : (
            <View style={styles.leaderboardList}>
              {leaderboard.map((entry, index) => {
                const bondInfo = myBonds.get(entry.friend_id);
                const isTop = index === 0;
                return (
                  <Pressable
                    key={entry.friend_id}
                    style={[styles.leaderboardRow, isTop && styles.leaderboardRowTop]}
                    onPress={() => router.push({ pathname: '/bond/[friendId]', params: { friendId: entry.friend_id } } as any)}
                  >
                    <View style={[styles.rankWrapper, isTop && styles.rankWrapperTop]}>
                      {index < 3 ? (
                        <AppText
                          variant="heading"
                          weight="bold"
                          color={index === 0 ? '#FFC53D' : index === 1 ? '#9B8875' : '#FF8A5C'}
                          style={{ fontSize: index === 0 ? 22 : 18 }}
                        >
                          {['🥇', '🥈', '🥉'][index]}
                        </AppText>
                      ) : (
                        <AppText variant="body" weight="bold" color={colors.textSecondary}>
                          #{index + 1}
                        </AppText>
                      )}
                    </View>
                    <Avatar
                      uri={entry.friend_avatar_url}
                      name={entry.friend_display_name}
                      size={48}
                      moodSize="sm"
                    />
                    <View style={styles.leaderboardInfo}>
                      <AppText variant="body" weight="bold" numberOfLines={1}>
                        {entry.friend_display_name}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        @{entry.friend_username}
                      </AppText>
                      {bondInfo && (
                        <BondProgress
                          level={bondInfo.level}
                          xp={bondInfo.xp}
                          nextLevelXP={bondInfo.next_level_xp}
                          progressPct={bondInfo.progress_pct}
                          size="sm"
                          showXP={false}
                          animated={false}
                        />
                      )}
                    </View>
                    <View style={styles.leaderboardLevel}>
                      <LinearGradient
                        colors={gradients.candy}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.levelBadge}
                      >
                        <AppText variant="caption" weight="bold" color={colors.headerText} style={{ fontSize: 11 }}>
                          LVL {entry.level}
                        </AppText>
                      </LinearGradient>
                      <AppText variant="caption" tone="muted" style={{ marginTop: 2, textAlign: 'right' }}>
                        {entry.xp.toLocaleString()} XP
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <AppText variant="caption" tone="muted" align="center" style={styles.footerNote}>
            Bonds are shared between friends. Cosmetic rewards only — no pressure, just fun.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  topBondCard: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
  },
  topBondInner: {
    padding: spacing.lg,
  },
  topBondRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankOne: {
    width: 48,
    alignItems: 'center',
  },
  topBondInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  leaderboardList: {
    gap: spacing.sm,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E7D8C6',
  },
  leaderboardRowTop: {
    backgroundColor: '#FFF8E8',
    borderRadius: radius.lg,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0,
  },
  rankWrapper: {
    width: 40,
    alignItems: 'center',
  },
  rankWrapperTop: {
    width: 48,
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: spacing.sm,
    minWidth: 0,
  },
  leaderboardLevel: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
    minWidth: 70,
  },
  levelBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  footerNote: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
});
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BondProgress } from '@/components/BondProgress';
import { MilestoneBadge } from '@/components/MilestoneBadge';
import { AppText, Card, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  fetchBond,
  fetchBondLeaderboard,
  fetchBondMilestones,
  fetchClaimedBondRewards,
  claimBondReward,
  fetchBondActivities,
  BondMilestone,
  BondLeaderboardEntry,
  BondInfo,
  BondActivity,
} from '@/lib/bonds';
import { Profile } from '@/types/database';

interface BondScreenProps {
  friendId: string;
  friendProfile: Profile;
}

export default function BondScreen({ friendId, friendProfile }: BondScreenProps) {
  const { colors } = useAppTheme();
  useAuth();
  const [bond, setBond] = useState<BondInfo | null>(null);
  const [milestones, setMilestones] = useState<BondMilestone[]>([]);
  const [claimedRewards, setClaimedRewards] = useState<Set<number>>(new Set());
  const [leaderboard, setLeaderboard] = useState<BondLeaderboardEntry[]>([]);
  const [activities, setActivities] = useState<BondActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    const [bondRes, milestonesRes, claimedRes, leaderboardRes, activitiesRes] = await Promise.all([
      fetchBond(friendId),
      fetchBondMilestones(),
      fetchClaimedBondRewards(friendId),
      fetchBondLeaderboard(10),
      fetchBondActivities(),
    ]);

    if (bondRes.data) setBond(bondRes.data);
    if (milestonesRes.data) setMilestones(milestonesRes.data);
    if (claimedRes.data) setClaimedRewards(new Set(claimedRes.data.map(c => c.level)));
    if (leaderboardRes.data) setLeaderboard(leaderboardRes.data);
    if (activitiesRes.data) setActivities(activitiesRes.data);
    setLoading(false);
  }, [friendId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaimReward = async (level: number) => {
    const result = await claimBondReward(friendId, level);
    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      setClaimedRewards(prev => new Set([...prev, level]));
    }
  };

  if (loading) {
    return (
      <Screen padding={0} blobbed>
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={colors.textSecondary}>Loading bond…</AppText>
        </View>
      </Screen>
    );
  }

  if (!bond) {
    return (
      <Screen padding={0} blobbed>
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={colors.textSecondary} align="center">
            No bond data found.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={0} blobbed>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Hero Header */}
        <LinearGradient
          colors={gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroContent}>
            <Avatar
              uri={friendProfile.avatar_url}
              name={friendProfile.display_name}
              size={80}
              ring
              moodSize="lg"
            />
            <View style={styles.heroInfo}>
              <AppText variant="heading" weight="bold" color={colors.headerText}>
                {friendProfile.display_name}
              </AppText>
              <AppText variant="body" color={colors.headerText} style={{ opacity: 0.9 }}>
                @{friendProfile.username}
              </AppText>
            </View>
          </View>

          <BondProgress
            level={bond.level}
            xp={bond.xp}
            nextLevelXP={bond.next_level_xp}
            progressPct={bond.progress_pct}
            size="lg"
            showXP
          />
        </LinearGradient>

        {/* Milestones */}
        {milestones.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionTitle}>
              MILESTONES
            </AppText>
            <AppText variant="caption" tone="secondary" style={styles.sectionSubtitle}>
              Unlock cosmetic rewards as your bond grows
            </AppText>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.milestonesContainer}
            >
              {milestones.map(ms => {
                const isUnlocked = bond.level >= ms.level;
                const isClaimed = claimedRewards.has(ms.level);
                return (
                  <View key={ms.level} style={styles.milestoneBadge}>
                    <MilestoneBadge
                      milestone={ms}
                      isUnlocked={isUnlocked}
                      isClaimed={isClaimed}
                      size="md"
                      onPress={isUnlocked && !isClaimed ? () => handleClaimReward(ms.level) : undefined}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Bond Activities */}
        {activities.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.sectionTitle}>
              WAYS TO EARN XP
            </AppText>
            <View style={styles.activitiesList}>
              {activities.map(a => (
                <View key={a.id} style={styles.activityRow}>
                  <View style={styles.activityInfo}>
                    <AppText variant="label" weight="semibold">{a.name}</AppText>
                    <AppText variant="caption" tone="secondary">{a.description}</AppText>
                  </View>
                  <View style={styles.activityXP}>
                    <LinearGradient
                      colors={gradients.sunshine}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.xpBadge}
                    >
                      <AppText variant="caption" weight="bold" color={colors.headerText}>
                        +{a.base_xp} XP
                      </AppText>
                    </LinearGradient>
                    <AppText variant="caption" tone="muted" style={{ marginTop: 2, textAlign: 'right' }}>
                      {a.cooldown_seconds}s cooldown
                      {a.daily_cap ? ` • {a.daily_cap}/day` : ''}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="label" weight="bold" color={colors.textSecondary}>
                YOUR TOP BONDS
              </AppText>
            </View>
            <View style={styles.leaderboardList}>
              {leaderboard.map((entry, index) => (
                <Pressable
                  key={entry.friend_id}
                  style={styles.leaderboardRow}
                  onPress={() => router.push({ pathname: '/bond/[friendId]', params: { friendId: entry.friend_id } } as any)}
                >
                  <View style={styles.rankWrapper}>
                    <AppText
                      variant={index < 3 ? 'heading' : 'body'}
                      weight="bold"
                      color={index === 0 ? '#FFC53D' : index === 1 ? '#9B8875' : index === 2 ? '#FF8A5C' : colors.textSecondary}
                    >
                      #{index + 1}
                    </AppText>
                  </View>
                  <Avatar
                    uri={entry.friend_avatar_url}
                    name={entry.friend_display_name}
                    size={44}
                    moodSize="sm"
                  />
                  <View style={styles.leaderboardInfo}>
                    <AppText variant="body" weight="bold">{entry.friend_display_name}</AppText>
                    <View style={styles.leaderboardMeta}>
                      <LinearGradient
                        colors={gradients.candy}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.miniLevelBadge}
                      >
                        <AppText variant="caption" weight="bold" color={colors.headerText} style={{ fontSize: 10 }}>
                          LVL {entry.level}
                        </AppText>
                      </LinearGradient>
                      <AppText variant="caption" tone="secondary">
                        {entry.xp.toLocaleString()} XP
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Info Card */}
        <Card variant="pop" style={styles.infoCard}>
          <AppText variant="label" weight="bold" color={colors.textSecondary} style={styles.infoTitle}>
            HOW IT WORKS
          </AppText>
          <AppText variant="caption" color={colors.text} style={[styles.infoText, { lineHeight: 20 }]}>
            Bonds grow through genuine interactions with friends. Messages, replies, voice notes, photos,
            games, and shared moments all contribute. XP has daily caps and cooldowns to prevent spam.
            Rewards are purely cosmetic — chat themes, reactions, badges, and visual effects.
          </AppText>
        </Card>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heroInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xxs,
  },
  sectionSubtitle: {
    marginBottom: spacing.md,
  },
  milestonesContainer: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  milestoneBadge: {
    minWidth: 100,
  },
  activitiesList: {
    gap: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E7D8C6',
  },
  activityInfo: {
    flex: 1,
  },
  activityXP: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  xpBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  leaderboardList: {
    gap: spacing.sm,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rankWrapper: {
    width: 32,
    alignItems: 'center',
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  leaderboardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  miniLevelBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  infoTitle: {
    marginBottom: spacing.sm,
  },
  infoText: {
    lineHeight: 20,
  },
});
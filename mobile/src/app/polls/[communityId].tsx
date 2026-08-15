import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, AppButton, Screen } from '@/components/ui';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { subscribeToRealtimeStatus, RealtimeStatus } from '@/lib/messaging';
import { deleteCommunityPoll, voteCommunityPoll } from '@/lib/polls';
import { PollFeedEntry, usePolls } from '@/hooks/usePolls';
import { formatDateTime, timeAgoShort } from '@/utils/format';
import { useEffect } from 'react';

function PollCard({
  entry,
  currentUserId,
  voting,
  onVote,
  onDelete,
}: {
  entry: PollFeedEntry;
  currentUserId: string;
  voting: string | null;
  onVote: (optionId: string) => void;
  onDelete: () => void;
}) {
  const total = entry.total_votes;
  const canModify =
    entry.my_role === 'owner' ||
    entry.my_role === 'admin' ||
    entry.created_by === currentUserId;
  const alreadyVoted = !!entry.my_vote_option_id;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <AppText variant="body" weight="bold" style={styles.question} numberOfLines={3}>
            {entry.question}
          </AppText>
          {entry.is_anonymous ? (
            <View style={[styles.chip, styles.chipAnonymous]}>
              <AppText variant="caption" weight="semibold" color={colors.primary}>
                Anonymous
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color={colors.textSecondary}>
          {entry.creator_display_name} · {timeAgoShort(entry.created_at)}
        </AppText>
      </View>

      {entry.expires_at && entry.is_expired ? (
        <AppText variant="caption" color={colors.danger} weight="semibold" style={styles.expired}>
          This poll closed on {formatDateTime(entry.expires_at)}.
        </AppText>
      ) : null}

      <View style={styles.options}>
        {entry.options
          .slice()
          .sort((a, b) => a.option_position - b.option_position)
          .map((option) => {
            const pct = total > 0 ? Math.round((option.option_votes / total) * 100) : 0;
            const selected = option.option_id === entry.my_vote_option_id;
            const pressable = !entry.is_expired && !alreadyVoted;
            return (
              <Pressable
                key={option.option_id}
                accessibilityRole="button"
                accessibilityLabel={option.option_text}
                disabled={!pressable}
                onPress={() => onVote(option.option_id)}
                style={[
                  styles.optionRow,
                  selected && styles.optionRowSelected,
                  pressable && styles.optionRowPressable,
                ]}
              >
                <View style={[styles.optionFill, { width: `${pct}%` }]} />
                <View style={styles.optionContent}>
                  <View style={styles.optionTextRow}>
                    <AppText
                      variant="body"
                      weight={selected ? 'bold' : 'medium'}
                      style={styles.optionText}
                      numberOfLines={2}
                    >
                      {option.option_text}
                    </AppText>
                    {selected ? (
                      <View style={styles.votedBadge}>
                        <AppText variant="caption" weight="bold" color={colors.surface} style={styles.votedBadgeText}>
                          You
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {option.option_votes} vote{option.option_votes === 1 ? '' : 's'} · {pct}%
                  </AppText>
                </View>
                {voting === option.option_id ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.optionSpinner} />
                ) : null}
              </Pressable>
            );
          })}
      </View>

      <View style={styles.cardFooter}>
        <AppText variant="caption" color={colors.textMuted}>
          {total} vote{total === 1 ? '' : 's'}
          {entry.expires_at ? ` · closes ${formatDateTime(entry.expires_at)}` : ''}
        </AppText>
        {canModify ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={onDelete}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <AppText variant="caption" color={colors.danger} weight="semibold">
              Delete
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function CommunityPollsScreen() {
  const params = useLocalSearchParams<{ communityId: string }>();
  const communityId = params.communityId;
  const { user } = useAuth();
  const { polls, loading, refreshing, setRefreshing, error, refresh } = usePolls(communityId);
  const [voting, setVoting] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return offStatus;
  }, []);

  const handleVote = useCallback(
    async (pollId: string, optionId: string) => {
      if (voting) {
        return;
      }
      setVoting(optionId);
      const errorMessage = await voteCommunityPoll(pollId, optionId);
      setVoting(null);
      if (errorMessage) {
        Alert.alert('Could not save your vote', errorMessage);
      } else {
        void refresh();
      }
    },
    [refresh, voting],
  );

  const handleDelete = useCallback(
    (entry: PollFeedEntry) => {
      Alert.alert('Delete poll?', 'This removes the poll and all votes for everyone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const errorMessage = await deleteCommunityPoll(entry.poll_id);
            if (errorMessage) {
              Alert.alert('Delete failed', errorMessage);
            } else {
              void refresh();
            }
          },
        },
      ]);
    },
    [refresh],
  );

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} />
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
          Polls
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New poll"
          hitSlop={12}
          style={styles.backButton}
          onPress={() =>
            router.push({ pathname: '/new-poll/[communityId]', params: { communityId } })
          }
        >
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <RealtimeBanner status={realtime} />

      <FlatList
        data={polls}
        keyExtractor={(item) => item.poll_id}
        renderItem={({ item }) => (
          <PollCard
            entry={item}
            currentUserId={user?.id ?? ''}
            voting={voting}
            onVote={(optionId) => void handleVote(item.poll_id, optionId)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={40} color={colors.textMuted} />
            <AppText variant="body" color={colors.textSecondary} align="center" style={styles.emptyText}>
              No polls yet. Start one to ask your community something.
            </AppText>
          </View>
        }
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
      />

      {error ? (
        <View style={styles.errorBanner}>
          <AppText variant="label" color={colors.danger} style={styles.flex}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" hitSlop={10} onPress={() => void refresh()}>
            <Ionicons name="refresh" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    marginBottom: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxs,
  },
  question: {
    flex: 1,
    lineHeight: 22,
  },
  chip: {
    marginLeft: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  chipAnonymous: {
    backgroundColor: colors.primarySoft,
  },
  expired: {
    marginBottom: spacing.sm,
  },
  options: {
    marginTop: spacing.xs,
  },
  optionRow: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    justifyContent: 'center',
  },
  optionRowSelected: {
    borderColor: colors.primary,
  },
  optionRowPressable: {
    backgroundColor: colors.surfaceMuted,
  },
  optionFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primarySoft,
  },
  optionContent: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  optionTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    lineHeight: 20,
  },
  votedBadge: {
    marginLeft: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  votedBadgeText: {
    fontSize: 10,
    lineHeight: 13,
  },
  optionSpinner: {
    position: 'absolute',
    right: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    marginTop: spacing.sm,
    lineHeight: 22,
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
});
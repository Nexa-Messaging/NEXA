import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { colors, radius, spacing } from '@/constants/theme';
import { subscribeToRealtimeStatus, RealtimeStatus } from '@/lib/messaging';
import { respondToEvent, toggleEventReminder } from '@/lib/events';
import { useEvents } from '@/hooks/useEvents';
import { CommunityEventFeed } from '@/types/database';
import { formatDateTime } from '@/utils/format';

function EventRow({
  event,
  communityId,
  busy,
  onRespond,
  onReminder,
}: {
  event: CommunityEventFeed;
  communityId: string;
  busy: boolean;
  onRespond: (event: CommunityEventFeed, response: 'going' | 'maybe' | 'not_going') => void;
  onReminder: (event: CommunityEventFeed) => void;
}) {
  const past = new Date(event.starts_at).getTime() < Date.now();

  return (
    <Pressable
      accessibilityRole="button"
      style={styles.eventRow}
      onPress={() =>
        router.push({
          pathname: '/event/[eventId]',
          params: { eventId: event.event_id, communityId },
        })
      }
    >
      <View style={styles.eventDateBlock}>
        <AppText variant="heading" weight="bold" color={colors.primary}>
          {new Date(event.starts_at).getDate()}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} weight="semibold">
          {new Date(event.starts_at).toLocaleString('en-US', { month: 'short' })}
        </AppText>
      </View>

      <View style={styles.eventMain}>
        <AppText variant="body" weight="bold" numberOfLines={1}>
          {event.title}
        </AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
          {formatDateTime(event.starts_at)}
        </AppText>
        {event.location ? (
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
            <Ionicons name="location-outline" size={11} color={colors.textMuted} /> {event.location}
          </AppText>
        ) : null}
        <View style={styles.eventMetaRow}>
          <AppText variant="caption" color={colors.textMuted}>
            {event.going_count} going · {event.maybe_count} maybe
          </AppText>
          {past ? (
            <AppText variant="caption" color={colors.textMuted} weight="semibold">
              · Past
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.eventSide}>
        {!past ? (
          <View style={styles.rsvpRow}>
            {(['going', 'maybe', 'not_going'] as const).map((response) => {
              const active = event.my_response === response;
              return (
                <Pressable
                  key={response}
                  accessibilityRole="button"
                  accessibilityLabel={`${response} ${event.title}`}
                  disabled={busy}
                  hitSlop={6}
                  onPress={() => onRespond(event, response)}
                  style={[styles.rsvpChip, active && styles.rsvpChipActive]}
                >
                  <Ionicons
                    name={
                      response === 'going'
                        ? 'checkmark'
                        : response === 'maybe'
                          ? 'time-outline'
                          : 'close'
                    }
                    size={13}
                    color={active ? colors.surface : colors.textMuted}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Ionicons name="checkmark-done-outline" size={18} color={colors.textMuted} />
        )}
        {!past && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle reminder"
            disabled={busy}
            hitSlop={8}
            onPress={() => onReminder(event)}
            style={styles.reminderButton}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={event.reminding ? 'notifications' : 'notifications-outline'}
                size={17}
                color={event.reminding ? colors.primary : colors.textMuted}
              />
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export default function CommunityEventsScreen() {
  const params = useLocalSearchParams<{ communityId: string }>();
  const communityId = params.communityId;
  const { events, loading, refreshing, setRefreshing, error, refresh } = useEvents(communityId);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return offStatus;
  }, []);

  const handleRespond = useCallback(
    async (event: CommunityEventFeed, response: 'going' | 'maybe' | 'not_going') => {
      if (busyEventId) {
        return;
      }
      setBusyEventId(event.event_id);
      const errorMessage = await respondToEvent(event.event_id, response);
      setBusyEventId(null);
      if (errorMessage) {
        Alert.alert('Could not save your RSVP', errorMessage);
      } else {
        void refresh();
      }
    },
    [busyEventId, refresh],
  );

  const handleReminder = useCallback(
    async (event: CommunityEventFeed) => {
      if (busyEventId) {
        return;
      }
      setBusyEventId(event.event_id);
      const result = await toggleEventReminder(event.event_id);
      setBusyEventId(null);
      if (result.error) {
        Alert.alert('Reminder error', result.error);
      } else {
        void refresh();
      }
    },
    [busyEventId],
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
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
          Events
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New event"
          hitSlop={12}
          style={styles.backButton}
          onPress={() =>
            router.push({ pathname: '/new-event/[communityId]', params: { communityId } })
          }
        >
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </Pressable>
      </View>

      <RealtimeBanner status={realtime} />

      <FlatList
        data={events}
        keyExtractor={(item) => item.event_id}
        renderItem={({ item, index }) => (
          <EventRow
            event={item}
            communityId={communityId}
            busy={busyEventId === item.event_id}
            onRespond={handleRespond}
            onReminder={handleReminder}
          />
        )}
        ListHeaderComponent={
          events.length > 0 ? (
            <AppText variant="caption" color={colors.textMuted} style={styles.sectionLabel}>
              Upcoming and past events
            </AppText>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={colors.textMuted} />
            <AppText variant="body" color={colors.textSecondary} align="center" style={styles.emptyText}>
              No events yet. Create one to bring your community together.
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
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => void refresh()}>
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
  sectionLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  eventDateBlock: {
    width: 52,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  eventMain: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  eventMetaRow: {
    flexDirection: 'row',
    marginTop: spacing.xxs,
  },
  eventSide: {
    alignItems: 'flex-end',
  },
  rsvpRow: {
    flexDirection: 'row',
    marginBottom: spacing.xxs,
  },
  rsvpChip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xxs,
  },
  rsvpChipActive: {
    backgroundColor: colors.primary,
  },
  reminderButton: {
    paddingHorizontal: spacing.xs,
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
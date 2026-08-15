import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, AppButton, Screen } from '@/components/ui';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  deleteCommunityEvent,
  resolveEventImageUrl,
  respondToEvent,
  toggleEventReminder,
} from '@/lib/events';
import { subscribeToRealtimeStatus, RealtimeStatus } from '@/lib/messaging';
import { useEvents } from '@/hooks/useEvents';
import { EventResponse } from '@/types/database';
import { formatDateTime } from '@/utils/format';

const RESPONSE_LABELS: Record<EventResponse, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  going: { label: 'Going', icon: 'checkmark' },
  maybe: { label: 'Maybe', icon: 'time-outline' },
  not_going: { label: "Can't go", icon: 'close' },
};

const RESPONSES: EventResponse[] = ['going', 'maybe', 'not_going'];

export default function EventDetailScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ eventId: string; communityId: string }>();
  const eventId = params.eventId;
  const communityId = params.communityId;
  const { user } = useAuth();

  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const { events, loading, error, refresh } = useEvents(communityId);

  useEffect(() => {
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return offStatus;
  }, []);

  const event = events.find((item) => item.event_id === eventId) ?? null;
  const canModify =
    event &&
    (event.my_role === 'owner' ||
      event.my_role === 'admin' ||
      event.created_by === user?.id);

  useEffect(() => {
    if (!event?.image_path) {
      setImageUrl(null);
      return;
    }
    let active = true;
    void resolveEventImageUrl(event.image_path).then((result) => {
      if (active && result.url) {
        setImageUrl(result.url);
      }
    });
    return () => {
      active = false;
    };
  }, [event?.image_path]);

  const handleRespond = useCallback(
    async (response: EventResponse) => {
      if (busy || !event) {
        return;
      }
      setBusy(true);
      const errorMessage = await respondToEvent(event.event_id, response);
      setBusy(false);
      if (errorMessage) {
        Alert.alert('Could not save your RSVP', errorMessage);
      } else {
        void refresh();
      }
    },
    [busy, event, refresh],
  );

  const handleReminder = useCallback(async () => {
    if (busy || !event) {
      return;
    }
    setBusy(true);
    const result = await toggleEventReminder(event.event_id);
    setBusy(false);
    if (result.error) {
      Alert.alert('Reminder error', result.error);
    } else {
      void refresh();
    }
  }, [busy, event, refresh]);

  const handleDelete = useCallback(() => {
    if (!event) {
      return;
    }
    Alert.alert('Delete event?', 'This removes the event, RSVPs and reminders for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const errorMessage = await deleteCommunityEvent(event.event_id);
          if (errorMessage) {
            Alert.alert('Delete failed', errorMessage);
          } else {
            router.back();
          }
        },
      },
    ]);
  }, [event]);

  if (loading || !event) {
    return (
      <Screen centered>
        {error && !event ? (
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
            {error}
          </AppText>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="label" color={colors.primary} weight="semibold">
            Go back
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const past = new Date(event.starts_at).getTime() < Date.now();

  return (
    <Screen padding={0}>
      <RealtimeBanner status={realtime} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" hitSlop={12} style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <AppText variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
            Event
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Event options"
            hitSlop={12}
            disabled={!canModify}
            style={styles.backButton}
            onPress={() => {
              Alert.alert('Event', 'What would you like to do?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Edit',
                  onPress: () =>
                    router.push({
                      pathname: '/new-event/[communityId]',
                      params: {
                        communityId: event.community_id,
                        eventId: event.event_id,
                      },
                    }),
                },
                { text: 'Delete', style: 'destructive', onPress: () => handleDelete() },
              ]);
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={canModify ? colors.text : colors.textMuted} />
          </Pressable>
        </View>

        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.heroImage} /> : null}

        <View style={styles.body}>
          <AppText variant="heading" weight="bold" style={styles.title}>
            {event.title}
          </AppText>
          <AppText variant="body" color={colors.primary} weight="semibold" style={styles.date}>
            {formatDateTime(event.starts_at)}
          </AppText>
          {event.location ? (
            <View style={styles.row}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <AppText variant="body" color={colors.textSecondary} style={styles.rowText}>
                {event.location}
              </AppText>
            </View>
          ) : null}
          {event.description ? (
            <AppText variant="body" color={colors.textSecondary} style={styles.description}>
              {event.description}
            </AppText>
          ) : null}

          {past ? (
            <AppText variant="body" color={colors.textMuted} weight="semibold" style={styles.past}>
              This event has already happened.
            </AppText>
          ) : (
            <>
              <AppText variant="label" weight="medium" color={colors.textSecondary} style={styles.sectionLabel}>
                Will you be there?
              </AppText>
              <View style={styles.responseRow}>
                {RESPONSES.map((response) => {
                  const active = event.my_response === response;
                  const config = RESPONSE_LABELS[response];
                  return (
                    <AppButton
                      key={response}
                      title={config.label}
                      variant={active ? 'primary' : 'outline'}
                      size="sm"
                      loading={busy}
                      onPress={() => void handleRespond(response)}
                      style={styles.responseButton}
                    />
                  );
                })}
              </View>
              <View style={styles.countsRow}>
                {RESPONSES.map((response) => (
                  <View key={response} style={styles.countChip}>
                    <AppText variant="heading" weight="bold" color={colors.primary}>
                      {response === 'going' ? event.going_count : response === 'maybe' ? event.maybe_count : event.not_going_count}
                    </AppText>
                    <AppText variant="caption" color={colors.textSecondary}>
                      {RESPONSE_LABELS[response].label}
                    </AppText>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleReminder()}
                style={styles.reminderRow}
              >
                <Ionicons
                  name={event.reminding ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={event.reminding ? colors.primary : colors.textMuted}
                />
                <AppText
                  variant="body"
                  weight="semibold"
                  color={event.reminding ? colors.primary : colors.textSecondary}
                  style={styles.reminderText}
                >
                  {event.reminding ? 'Reminder on' : 'Remind me about this event'}
                </AppText>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  stateText: {
    lineHeight: 22,
    marginBottom: spacing.sm,
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
  heroImage: {
    width: '100%',
    height: 200,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    lineHeight: 28,
  },
  date: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  rowText: {
    marginLeft: spacing.xs,
  },
  description: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  past: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  responseRow: {
    flexDirection: 'row',
  },
  responseButton: {
    marginRight: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  countsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  countChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.xs,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  reminderText: {
    marginLeft: spacing.xs,
  },
});
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton, AppText, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  UserEventDetail,
  getUserEventDetail,
  rsvpUserEvent,
  toggleUserEventReminder,
  LOCATION_TYPE_CONFIG,
  USER_EVENT_STATUS_CONFIG,
  UserRSVPResponse,
} from '@/lib/events';

export default function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [event, setEvent] = useState<UserEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    getUserEventDetail(eventId).then(({ data, error: err }) => {
      setEvent(data);
      setError(err);
      setLoading(false);
    });
  }, [eventId]);

  const handleRSVP = async (response: UserRSVPResponse) => {
    if (!event) return;
    await rsvpUserEvent(event.event_id, response);
    setEvent({ ...event, my_response: response });
  };

  const handleReminder = async () => {
    if (!event) return;
    const { on } = await toggleUserEventReminder(event.event_id);
    setEvent({ ...event, reminding: on });
  };

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (error || !event) {
    return (
      <Screen centered>
        <AppText variant="body" tone="danger" align="center">
          {error ?? 'Event not found'}
        </AppText>
      </Screen>
    );
  }

  const statusCfg = USER_EVENT_STATUS_CONFIG[event.status];
  const locCfg = LOCATION_TYPE_CONFIG[event.location_type];

  return (
    <Screen padding={0} blobbed>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Cover */}
        {event.cover_url ? (
          <Image source={{ uri: event.cover_url }} style={s.cover} />
        ) : (
          <LinearGradient
            colors={[statusCfg.color, statusCfg.color + '88']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.coverPlaceholder}
          >
            <Ionicons name="calendar" size={48} color="#fff" />
          </LinearGradient>
        )}

        {/* Back button overlay */}
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>

        <View style={s.content}>
          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
            <AppText variant="caption" weight="bold" color={statusCfg.color}>
              {statusCfg.emoji} {statusCfg.label}
            </AppText>
          </View>

          <AppText variant="title" weight="bold">
            {event.title}
          </AppText>

          {/* Date/time */}
          <View style={s.infoRow}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <View>
              <AppText variant="body" weight="semibold">
                {formatFullDate(event.starts_at)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {formatTime(event.starts_at)}
                {event.ends_at ? ` — ${formatTime(event.ends_at)}` : ''}
              </AppText>
            </View>
          </View>

          {/* Location */}
          <View style={s.infoRow}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <View>
              <AppText variant="body" weight="semibold">
                {locCfg.label}
              </AppText>
              {event.location ? (
                <AppText variant="caption" tone="muted">
                  {event.location}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Description */}
          {event.description ? (
            <View style={s.descSection}>
              <AppText variant="label" weight="bold">
                About
              </AppText>
              <AppText variant="body" tone="secondary" style={s.desc}>
                {event.description}
              </AppText>
            </View>
          ) : null}

          {/* RSVP counts */}
          <View style={s.countsRow}>
            <View style={[s.countCard, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <AppText variant="heading" weight="bold">{event.going_count}</AppText>
              <AppText variant="caption" tone="muted">Going</AppText>
            </View>
            <View style={[s.countCard, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="help-circle" size={20} color={colors.warning} />
              <AppText variant="heading" weight="bold">{event.maybe_count}</AppText>
              <AppText variant="caption" tone="muted">Maybe</AppText>
            </View>
            <View style={[s.countCard, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="close-circle" size={20} color={colors.danger} />
              <AppText variant="heading" weight="bold">{event.not_going_count}</AppText>
              <AppText variant="caption" tone="muted">Can't go</AppText>
            </View>
          </View>

          {/* Creator */}
          <View style={s.creatorRow}>
            {event.creator_avatar ? (
              <Image source={{ uri: event.creator_avatar }} style={s.creatorAvatar} />
            ) : (
              <View style={[s.creatorAvatar, { backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }]}>
                <AppText variant="caption" weight="bold" color="#fff">
                  {(event.creator_name ?? 'U')[0]?.toUpperCase()}
                </AppText>
              </View>
            )}
            <View>
              <AppText variant="label" weight="semibold">{event.creator_name ?? 'Unknown'}</AppText>
              <AppText variant="caption" tone="muted">Event creator</AppText>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* RSVP action bar */}
      {event.status !== 'ended' && (
        <View style={[s.actionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => handleReminder()}
            style={[s.reminderBtn, { backgroundColor: event.reminding ? colors.primarySoft : colors.inputBg }]}
          >
            <Ionicons
              name={event.reminding ? 'notifications' : 'notifications-outline'}
              size={20}
              color={event.reminding ? colors.primary : colors.textMuted}
            />
          </Pressable>
          <View style={s.rsvpButtons}>
            {(['going', 'maybe', 'not_going'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => handleRSVP(r)}
                style={[
                  s.rsvpBtn,
                  {
                    backgroundColor: event.my_response === r ? colors.primary : colors.inputBg,
                    borderColor: event.my_response === r ? colors.primary : colors.border,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight={event.my_response === r ? 'bold' : 'regular'}
                  color={event.my_response === r ? '#fff' : colors.textSecondary}
                >
                  {r === 'going' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't go"}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const s = StyleSheet.create({
  scroll: {
    paddingBottom: 100,
  },
  cover: {
    width: '100%',
    height: 220,
  },
  coverPlaceholder: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  descSection: {
    gap: spacing.xs,
  },
  desc: {
    lineHeight: 22,
  },
  countsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  creatorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  reminderBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rsvpButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rsvpBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
});

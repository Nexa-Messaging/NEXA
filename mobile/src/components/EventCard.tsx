import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import {
  UserEventItem,
  LOCATION_TYPE_CONFIG,
  USER_EVENT_STATUS_CONFIG,
} from '@/lib/events';

interface EventCardProps {
  event: UserEventItem;
  onPress?: () => void;
}

export function EventCard({ event, onPress }: EventCardProps) {
  const { colors } = useAppTheme();
  const statusCfg = USER_EVENT_STATUS_CONFIG[event.status];
  const locCfg = LOCATION_TYPE_CONFIG[event.location_type];

  const dateStr = formatDate(event.starts_at);
  const timeStr = formatTime(event.starts_at);

  return (
    <Pressable
      onPress={onPress}
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
    >
      {/* Cover image or gradient placeholder */}
      {event.cover_url ? (
        <Image source={{ uri: event.cover_url }} style={s.cover} />
      ) : (
        <LinearGradient
          colors={[statusCfg.color, statusCfg.color + '99']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.coverPlaceholder}
        >
          <Ionicons name="calendar" size={32} color="#fff" />
        </LinearGradient>
      )}

      <View style={s.body}>
        {/* Status + location type badges */}
        <View style={s.badges}>
          <View style={[s.badge, { backgroundColor: statusCfg.color + '20' }]}>
            <AppText variant="caption" weight="bold" color={statusCfg.color}>
              {statusCfg.emoji} {statusCfg.label}
            </AppText>
          </View>
          <View style={[s.badge, { backgroundColor: colors.inputBg }]}>
            <AppText variant="caption" color={colors.textMuted}>
              {locCfg.emoji} {locCfg.label}
            </AppText>
          </View>
        </View>

        <AppText variant="heading" weight="bold" numberOfLines={2} style={s.title}>
          {event.title}
        </AppText>

        {/* Date/time row */}
        <View style={s.metaRow}>
          <Ionicons name="time-outline" size={14} color={colors.primary} />
          <AppText variant="caption" color={colors.textSecondary}>
            {dateStr} · {timeStr}
          </AppText>
        </View>

        {/* Location row (privacy-safe: only city/region) */}
        {event.location ? (
          <View style={s.metaRow}>
            <Ionicons name="location-outline" size={14} color={colors.primary} />
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {event.location}
            </AppText>
          </View>
        ) : null}

        {/* RSVP counts */}
        <View style={s.counts}>
          {event.going_count > 0 ? (
            <View style={s.countPill}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <AppText variant="caption" color={colors.textMuted}>
                {event.going_count} going
              </AppText>
            </View>
          ) : null}
          {event.maybe_count > 0 ? (
            <View style={s.countPill}>
              <Ionicons name="help-circle" size={14} color="#F59E0B" />
              <AppText variant="caption" color={colors.textMuted}>
                {event.maybe_count} maybe
              </AppText>
            </View>
          ) : null}
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
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            by {event.creator_name ?? 'Unknown'}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.soft,
  },
  cover: {
    width: '100%',
    height: 120,
  },
  coverPlaceholder: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  title: {
    lineHeight: typography.heading * 1.3,
    marginTop: spacing.xxs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  counts: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxs,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  creatorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});

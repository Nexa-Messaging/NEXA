import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { NotificationFeed } from '@/types/database';
import { timeAgoShort } from '@/utils/format';

interface TypeMeta {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

function metaFor(type: string, colors: ReturnType<typeof useAppTheme>['colors']): TypeMeta {
  switch (type) {
    case 'message':
      return { icon: 'chatbubble-ellipses', color: colors.primary, bg: colors.primarySoft };
    case 'friend_request':
    case 'friend_request_accepted':
      return { icon: 'person-add', color: colors.success, bg: colors.successSoft };
    case 'message_reaction':
    case 'story_reaction':
      return { icon: 'heart', color: colors.pink, bg: colors.pinkSoft };
    case 'story_reply':
      return { icon: 'chatbubble', color: colors.primary, bg: colors.primarySoft };
    case 'community_announcement':
      return { icon: 'megaphone', color: colors.coral, bg: colors.coralSoft };
    case 'poll':
      return { icon: 'bar-chart', color: colors.mint, bg: colors.mintSoft };
    case 'event_reminder':
      return { icon: 'calendar', color: colors.sky, bg: colors.skySoft };
    case 'mention':
      return { icon: 'at', color: colors.sun, bg: colors.sunSoft };
    default:
      return { icon: 'notifications', color: colors.textMuted, bg: colors.surfaceMuted };
  }
}

export interface NotificationCardProps {
  item: NotificationFeed;
  onPress?: () => void;
  style?: ViewStyle;
}

/** One row in the notifications list: sticker icon chip, title/body and unread state. */
export function NotificationCard({ item, onPress, style }: NotificationCardProps) {
  const { colors } = useAppTheme();
  const meta = metaFor(item.type, colors);
  const unread = !item.is_read;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        unread && { borderColor: colors.primaryMuted, backgroundColor: colors.surfaceElevated },
        pressed && styles.cardPressed,
        style,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="body" weight={unread ? 'bold' : 'semibold'} numberOfLines={1} style={styles.title}>
            {item.title}
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.time}>
            {timeAgoShort(item.created_at)}
          </AppText>
        </View>
        {item.body ? (
          <AppText variant="caption" tone="secondary" numberOfLines={2} style={styles.body}>
            {item.body}
          </AppText>
        ) : null}
      </View>
      {unread ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.soft,
  },
  cardPressed: {
    opacity: 0.8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    lineHeight: 20,
  },
  time: {
    marginLeft: spacing.xs,
  },
  body: {
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    marginLeft: spacing.xs,
  },
});
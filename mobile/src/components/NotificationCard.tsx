import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { NotificationFeed, NotificationType } from '@/types/database';
import { timeAgoShort } from '@/utils/format';

interface TypeMeta {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  message: { icon: 'chatbubble-ellipses', color: colors.primary, bg: colors.primarySoft },
  friend_request: { icon: 'person-add', color: colors.success, bg: '#E2F6EF' },
  friend_request_accepted: { icon: 'people', color: colors.success, bg: '#E2F6EF' },
  message_reaction: { icon: 'heart', color: colors.pink, bg: colors.pinkSoft },
  story_reaction: { icon: 'heart', color: colors.pink, bg: colors.pinkSoft },
  story_reply: { icon: 'chatbubble', color: colors.primary, bg: colors.primarySoft },
  community_announcement: { icon: 'megaphone', color: colors.coral, bg: colors.coralSoft },
  poll: { icon: 'bar-chart', color: colors.mint, bg: colors.mintSoft },
  event_reminder: { icon: 'calendar', color: colors.sky, bg: colors.skySoft },
  mention: { icon: 'at', color: colors.sun, bg: colors.sunSoft },
};

const FALLBACK_META: TypeMeta = { icon: 'notifications', color: colors.textMuted, bg: colors.surfaceMuted };

function metaFor(type: string): TypeMeta {
  return TYPE_META[type as NotificationType] ?? FALLBACK_META;
}

export interface NotificationCardProps {
  item: NotificationFeed;
  onPress?: () => void;
  style?: ViewStyle;
}

/** One row in the notifications list: sticker icon chip, title/body and unread state. */
export function NotificationCard({ item, onPress, style }: NotificationCardProps) {
  const { colors } = useAppTheme();
  const meta = metaFor(item.type);
  const unread = !item.is_read;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        unread && styles.cardUnread,
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    ...shadows.soft,
  },
  cardUnread: {
    borderColor: colors.primaryMuted,
    backgroundColor: '#FDFCFF',
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
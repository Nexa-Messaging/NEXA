import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { NotificationFeed, NotificationType } from '@/types/database';
import { timeAgoShort } from '@/utils/format';

interface TypeMeta {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const TYPE_META: Record<string, TypeMeta> = {
  message: { icon: 'chatbubble-ellipses', color: colors.primary },
  friend_request: { icon: 'person-add', color: colors.success },
  friend_request_accepted: { icon: 'people', color: colors.success },
  message_reaction: { icon: 'heart', color: colors.danger },
  story_reaction: { icon: 'heart', color: colors.danger },
  story_reply: { icon: 'chatbubble', color: colors.primary },
  community_announcement: { icon: 'megaphone', color: colors.warning },
  poll: { icon: 'bar-chart', color: colors.success },
  event_reminder: { icon: 'calendar', color: colors.primary },
  mention: { icon: 'at', color: colors.primary },
};

const FALLBACK_META: TypeMeta = { icon: 'notifications', color: colors.textMuted };

function metaFor(type: string): TypeMeta {
  return TYPE_META[type as NotificationType] ?? FALLBACK_META;
}

export interface NotificationCardProps {
  item: NotificationFeed;
  onPress?: () => void;
  style?: ViewStyle;
}

/** One row in the notifications list: type icon, title/body and read state. */
export function NotificationCard({ item, onPress, style }: NotificationCardProps) {
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
      <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1A` }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="body" weight={unread ? 'bold' : 'semibold'} numberOfLines={1} style={styles.title}>
            {item.title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} style={styles.time}>
            {timeAgoShort(item.created_at)}
          </AppText>
        </View>
        {item.body ? (
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={2} style={styles.body}>
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
  },
  cardUnread: {
    borderColor: colors.primarySoft,
    backgroundColor: '#FBFBFF',
  },
  cardPressed: {
    opacity: 0.8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
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
    backgroundColor: colors.primary,
    marginLeft: spacing.xs,
  },
});
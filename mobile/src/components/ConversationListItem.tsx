import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { ChatListItem } from '@/hooks/useConversations';
import { formatChatTime } from '@/utils/format';

export interface ConversationListItemProps {
  item: ChatListItem;
  onPress: () => void;
}

/**
 * One row in the Chats list: avatar + name, last-message preview, a time
 * label and an unread badge. Renders both 1:1 conversations and group chats.
 */
export function ConversationListItem({ item, onPress }: ConversationListItemProps) {
  const { colors } = useAppTheme();
  const preview = item.lastMessage ?? (item.kind === 'group' ? 'Group created' : 'No messages yet — say hi!');
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Avatar uri={item.avatarPath} name={item.name} size={52} ring={item.kind === 'group'} />

      <View style={styles.middle}>
        <AppText variant="body" weight="bold" numberOfLines={1}>
          {item.name}
        </AppText>
        <AppText
          variant="caption"
          color={item.unreadCount > 0 ? colors.text : colors.textSecondary}
          weight={item.unreadCount > 0 ? 'semibold' : 'regular'}
          numberOfLines={1}
          style={styles.preview}
        >
          {preview}
        </AppText>
      </View>

      <View style={styles.side}>
        <AppText variant="caption" tone="muted" style={styles.time}>
          {formatChatTime(item.lastAt)}
        </AppText>
        {item.unreadCount > 0 ? (
          <View style={styles.badge}>
            <AppText
              variant="caption"
              weight="bold"
              color={colors.headerText}
              style={styles.badgeText}
            >
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.7,
  },
  middle: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  preview: {
    marginTop: 2,
  },
  side: {
    alignItems: 'flex-end',
  },
  time: {
    marginBottom: spacing.xxs,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    ...shadows.soft,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
});

export const groupBadgeGradient = gradients.brand;
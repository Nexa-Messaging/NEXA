import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
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
  const preview = item.lastMessage ?? (item.kind === 'group' ? 'Group created' : 'No messages yet — say hi!');
  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={onPress}>
      <Avatar uri={item.avatarPath} name={item.name} size={52} />

      <View style={styles.middle}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>
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
        <AppText variant="caption" color={colors.textMuted} style={styles.time}>
          {formatChatTime(item.lastAt)}
        </AppText>
        {item.unreadCount > 0 ? (
          <View style={styles.badge}>
            <AppText
              variant="caption"
              weight="bold"
              color={colors.surface}
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
    borderBottomColor: colors.border,
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
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
});
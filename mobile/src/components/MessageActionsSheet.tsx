import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';

export const QUICK_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏'] as const;

export interface MessageActionsSheetProps {
  visible: boolean;
  /** Whether the target message is the current user's own. */
  isMine: boolean;
  canDelete: boolean;
  /** Whether editing is still allowed (≤10 min old + own). */
  canEdit: boolean;
  /** Plain text of the message, used for copy/edit preview. */
  messageText?: string;
  onClose: () => void;
  onReply: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onReport?: () => void;
  onReact: (emoji: string) => void;
}

/**
 * Bottom sheet opened by long-pressing a message: reply, react (quick emoji
 * row), copy, edit (own messages within 10 min), delete for the sender's own
 * messages and report for other people's.
 */
export function MessageActionsSheet({
  visible,
  isMine,
  canDelete,
  canEdit,
  messageText = '',
  onClose,
  onReply,
  onDelete,
  onEdit,
  onReport,
  onReact,
}: MessageActionsSheetProps) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(messageText);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <AppText variant="label" weight="semibold" color={colors.textSecondary} align="center">
            MESSAGE ACTIONS
          </AppText>

          <View style={styles.row}>
            <ActionItem icon="arrow-undo-outline" label="Reply" onPress={onReply} />
            <ActionItem
              icon="copy-outline"
              label="Copy"
              onPress={handleCopy}
            />
            {isMine && canEdit && onEdit ? (
              <ActionItem icon="pencil-outline" label="Edit" onPress={onEdit} />
            ) : null}
          </View>

          <View style={styles.row}>
            {isMine && canDelete && onDelete ? (
              <ActionItem icon="trash-outline" label="Delete" danger onPress={onDelete} />
            ) : !isMine && onReport ? (
              <ActionItem icon="flag-outline" label="Report" onPress={onReport} />
            ) : null}
          </View>

          <View style={styles.divider} />
          <AppText variant="caption" color={colors.textMuted} style={styles.emojiLabel}>
            React
          </AppText>
          <View style={styles.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                onPress={() => onReact(emoji)}
                style={styles.emoji}
              >
                <AppText variant="heading">{emoji}</AppText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionItem({
  icon,
  label,
  danger = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable accessibilityRole="button" style={styles.action} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} />
      <AppText variant="body" weight="semibold" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.xxs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  emojiLabel: {
    marginBottom: spacing.sm,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
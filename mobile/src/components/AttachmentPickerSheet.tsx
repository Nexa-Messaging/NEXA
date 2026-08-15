import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';

export interface AttachmentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onVoiceNote: () => void;
}

/**
 * Bottom sheet opened from the composer's attach button: photo, video or a
 * voice note. The screen owns the actual picker/recorder flows.
 */
export function AttachmentPickerSheet({
  visible,
  onClose,
  onPickImage,
  onPickVideo,
  onVoiceNote,
}: AttachmentPickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <AppText variant="label" weight="semibold" color={colors.textSecondary} align="center">
            ADD ATTACHMENT
          </AppText>
          <View style={styles.row}>
            <ActionItem icon="image-outline" label="Photo" onPress={onPickImage} />
            <ActionItem icon="videocam-outline" label="Video" onPress={onPickVideo} />
            <ActionItem icon="mic-outline" label="Voice" onPress={onVoiceNote} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.action} onPress={onPress}>
      <Ionicons name={icon} size={24} color={colors.primary} />
      <AppText variant="body" weight="semibold" color={colors.text} style={styles.actionLabel}>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.xxs,
  },
  actionLabel: {
    marginTop: spacing.xs,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface MediaPreview {
  kind: 'image' | 'video';
  uri: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface MediaPreviewModalProps {
  visible: boolean;
  media: MediaPreview | null;
  caption: string;
  onChangeCaption: (text: string) => void;
  onSend: () => void;
  onClose: () => void;
}

/**
 * Full-screen "before you send" preview for a picked photo/video: the media
 * plus an optional caption. Sending hands control back to the chat screen.
 */
export function MediaPreviewModal({
  visible,
  media,
  caption,
  onChangeCaption,
  onSend,
  onClose,
}: MediaPreviewModalProps) {
  const { colors } = useAppTheme();
  const player = useVideoPlayer(media && media.kind === 'video' ? media.uri : null);
  const canSend = !!media;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" hitSlop={12} onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={24} color={colors.surface} />
          </Pressable>
          <AppText variant="label" weight="semibold" color={colors.surface} style={styles.headerTitle}>
            Preview
          </AppText>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.mediaArea}>
          {media?.kind === 'video' ? (
            <VideoView player={player} style={styles.preview} nativeControls contentFit="contain" />
          ) : (
            <Image source={media ? { uri: media.uri } : undefined} style={styles.preview} contentFit="contain" />
          )}
        </View>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={caption}
            onChangeText={onChangeCaption}
            placeholder="Add a caption…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            accessibilityLabel="Media caption"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send media"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.surface} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F18',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    letterSpacing: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  preview: {
    width: '100%',
    maxWidth: 460,
    height: '85%',
    borderRadius: radius.md,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.text,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    marginLeft: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
});

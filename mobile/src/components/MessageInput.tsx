import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Reply-quote preview bar (null hides it). */
  replyingTo?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  /** Edit-mode preview bar (null hides it). */
  editing?: { text: string } | null;
  onCancelEdit?: () => void;
  /** Opens the attachment picker (photos, videos, voice notes). */
  onAttach?: () => void;
  disabled?: boolean;
}

/**
 * Composer: an attach button, a multiline field with an optional reply-quote
 * bar and a gradient send button that is only active with text.
 */
export function MessageInput({
  value,
  onChangeText,
  onSend,
  replyingTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onAttach,
  disabled = false,
}: MessageInputProps) {
  const { colors } = useAppTheme();
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View style={styles.container}>
      {replyingTo ? (
        <View style={styles.replyBar}>
          <View style={styles.replyTextWrap}>
            <AppText variant="caption" weight="bold" color={colors.primary}>
              Replying to {replyingTo.name}
            </AppText>
            <AppText
              variant="caption"
              tone="secondary"
              numberOfLines={1}
              style={styles.replyText}
            >
              {replyingTo.text}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={10} onPress={onCancelReply}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <View style={styles.replyBar}>
          <View style={styles.replyTextWrap}>
            <AppText variant="caption" weight="bold" color={colors.sun}>
              Editing message
            </AppText>
            <AppText
              variant="caption"
              tone="secondary"
              numberOfLines={1}
              style={styles.replyText}
            >
              {editing.text}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" hitSlop={10} onPress={onCancelEdit}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        {onAttach ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onAttach}
            style={styles.attachButton}
          >
            <Ionicons name="add" size={24} color={colors.primary} />
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={editing ? 'Edit message…' : 'Message…'}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
          blurOnSubmit={false}
          returnKeyType="default"
          onSubmitEditing={() => {
            if (canSend) onSend();
          }}
          accessibilityLabel="Message input"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => {
            Keyboard.dismiss();
            onSend();
          }}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          {canSend ? (
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <Ionicons name="arrow-up" size={20} color={colors.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.sm,
  },
  replyTextWrap: {
    flex: 1,
  },
  replyText: {
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
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
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.card,
  },
  sendButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
});
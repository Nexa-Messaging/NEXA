import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface SectionHeaderProps {
  title: string;
  /** Optional trailing action button. */
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
}

/**
 * Section heading with an optional trailing action — used for the energetic
 * "chunk" headers on Home, Chats and Circles.
 */
export function SectionHeader({ title, actionLabel, onAction, actionIcon }: SectionHeaderProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <AppText variant="heading" weight="bold">
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          onPress={onAction}
          style={styles.action}
        >
          {actionIcon ? (
            <Ionicons name={actionIcon} size={16} color={colors.primary} />
          ) : null}
          <AppText variant="label" weight="bold" color={colors.primary}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
});
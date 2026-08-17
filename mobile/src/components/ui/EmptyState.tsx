import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  /** Extra content (e.g. a CTA button) rendered under the description. */
  action?: React.ReactNode;
}

/**
 * Playful empty state: a "sticker" icon badge over a soft blob, expressive
 * title and description. Used across feeds when there is nothing to show.
 */
export function EmptyState({ icon = 'sparkles-outline', title, description, action }: EmptyStateProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <AppText variant="heading" weight="bold" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="body" tone="secondary" align="center" style={styles.description}>
          {description}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: radius.blob,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  description: {
    marginTop: spacing.xs,
    lineHeight: 22,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.lg,
    width: '100%',
  },
});
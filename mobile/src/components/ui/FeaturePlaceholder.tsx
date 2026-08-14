import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { colors, fontWeights, radius, spacing } from '@/constants/theme';

export interface FeaturePlaceholderProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Screen name, e.g. "Chats". */
  title: string;
  description: string;
  /** Short label describing which phase will bring this feature. */
  phase?: string;
}

/**
 * Standard placeholder layout for screens whose real functionality arrives in
 * a later development phase. No fake data or mock logic is rendered.
 */
export function FeaturePlaceholder({ icon, title, description, phase }: FeaturePlaceholderProps) {
  return (
    <Screen centered>
      <View style={[styles.container, styles.card]}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={40} color={colors.primary} />
        </View>
        <AppText variant="heading" weight="bold" align="center">
          {title}
        </AppText>
        <AppText variant="body" color={colors.textSecondary} align="center" style={styles.description}>
          {description}
        </AppText>
        {phase ? (
          <View style={styles.phaseTag}>
            <AppText variant="caption" color={colors.primary} weight="semibold">
              {phase}
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  description: {
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  phaseTag: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
});
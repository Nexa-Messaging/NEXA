import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

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
  const { colors } = useAppTheme();
  return (
    <Screen blobbed centered>
      <View
        style={[styles.container, styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={40} color={colors.primary} />
        </View>
        <AppText variant="heading" weight="bold" align="center">
          {title}
        </AppText>
        <AppText variant="body" tone="secondary" align="center" style={styles.description}>
          {description}
        </AppText>
        {phase ? (
          <View style={[styles.phaseTag, { backgroundColor: colors.primarySoft }]}>
            <AppText variant="caption" color={colors.primary} weight="bold">
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
    borderRadius: radius.xxl,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.blob,
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
  },
});
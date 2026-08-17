import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radius, shadows } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface CardProps {
  children: React.ReactNode;
  /** Soft layered surface with a gentle coloured shadow. */
  variant?: 'flat' | 'pop' | 'soft';
  /** Optional gradient header band at the top of the card. */
  gradient?: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
}

/**
 * Layered surface card with soft shadows and an optional gradient header —
 * the shared building block for NEXA's sticker-like surfaces.
 */
export function Card({ children, variant = 'flat', gradient, style }: CardProps) {
  const { colors } = useAppTheme();
  const variantStyles = {
    flat: { backgroundColor: colors.surface, ...shadows.card },
    pop: { backgroundColor: colors.surface, ...shadows.pop },
    soft: { backgroundColor: colors.surfaceMuted, ...shadows.soft },
  } as const;
  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      {gradient ? (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBand}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  headerBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
});
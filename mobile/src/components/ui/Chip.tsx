import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export type ChipTone = 'primary' | 'pink' | 'mint' | 'sun' | 'sky' | 'neutral';

const TONE_BG: Record<ChipTone, string> = {
  primary: colors.primarySoft,
  pink: colors.pinkSoft,
  mint: colors.mintSoft,
  sun: colors.sunSoft,
  sky: colors.skySoft,
  neutral: colors.surfaceMuted,
};

const TONE_TEXT: Record<ChipTone, string> = {
  primary: colors.primary,
  pink: colors.pink,
  mint: '#0FA98B',
  sun: '#C8860A',
  sky: '#1E9FE0',
  neutral: colors.textSecondary,
};

export interface ChipProps extends Omit<PressableProps, 'style'> {
  label: string;
  tone?: ChipTone;
  /** Fill the chip with a vibrant gradient instead of a soft tint. */
  gradient?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Small sticker-like tag. Gradient chips give the playful graffiti pop,
 * soft-tinted chips stay calm for secondary actions.
 */
export function Chip({
  label,
  tone = 'primary',
  gradient = false,
  style,
  ...rest
}: ChipProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        gradient ? null : { backgroundColor: TONE_BG[tone] },
        pressed && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {gradient ? (
        <LinearGradient
          colors={gradientsBrand(tone)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <AppText variant="caption" weight="bold" color={gradient ? colors.surface : TONE_TEXT[tone]} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

function gradientsBrand(_tone: ChipTone): readonly [string, string, ...string[]] {
  return [colors.primary, colors.pink];
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.8,
  },
});
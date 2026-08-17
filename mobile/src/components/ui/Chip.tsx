import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { radius } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export type ChipTone = 'primary' | 'pink' | 'mint' | 'sun' | 'sky' | 'neutral';

function toneBg(colors: ReturnType<typeof useAppTheme>['colors'], tone: ChipTone): string {
  switch (tone) {
    case 'primary':
      return colors.primarySoft;
    case 'pink':
      return colors.pinkSoft;
    case 'mint':
      return colors.mintSoft;
    case 'sun':
      return colors.sunSoft;
    case 'sky':
      return colors.skySoft;
    case 'neutral':
      return colors.surfaceMuted;
  }
}

function toneText(colors: ReturnType<typeof useAppTheme>['colors'], tone: ChipTone): string {
  switch (tone) {
    case 'primary':
      return colors.primary;
    case 'pink':
      return colors.pink;
    case 'mint':
      return colors.success;
    case 'sun':
      return colors.warning;
    case 'sky':
      return colors.sky;
    case 'neutral':
      return colors.textSecondary;
  }
}

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
        gradient ? null : { backgroundColor: toneBg(colors, tone) },
        pressed && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {gradient ? (
        <LinearGradient
          colors={gradientsBrand(colors)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <AppText
        variant="caption"
        weight="bold"
        color={gradient ? colors.headerText : toneText(colors, tone)}
        style={styles.label}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function gradientsBrand(colors: ReturnType<typeof useAppTheme>['colors']): readonly [string, string, ...string[]] {
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
import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';

import { colors, fontWeights, tracking, typography } from '@/constants/theme';

export type TextVariant = keyof typeof typography;
export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'primary'
  | 'danger'
  | 'success'
  | 'surface';

const TONE_COLORS: Record<TextTone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.success,
  surface: colors.surface,
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Semantic tone. Overrides `color` when provided. */
  tone?: TextTone;
  color?: string;
  weight?: keyof typeof fontWeights;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

/**
 * Base `Text` component wired to the app design tokens: expressive type scale,
 * friendly letter-spacing, semantic tones.
 */
export function AppText({
  variant = 'body',
  tone,
  color = colors.text,
  weight,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const resolvedColor = tone ? TONE_COLORS[tone] : color;
  return (
    <Text
      style={[
        styles.base,
        {
          fontSize: typography[variant],
          letterSpacing: tracking[variant],
          color: resolvedColor,
        },
        variant === 'display' ? styles.display : null,
        weight ? { fontWeight: fontWeights[weight] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontVariant: ['tabular-nums'],
  },
  display: {
    lineHeight: 44,
  },
});
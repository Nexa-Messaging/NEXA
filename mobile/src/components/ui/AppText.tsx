import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';

import { colors, fontWeights, typography } from '@/constants/theme';

export type TextVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  weight?: keyof typeof fontWeights;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

/**
 * Base `Text` component wired to the app design tokens.
 */
export function AppText({
  variant = 'body',
  color = colors.text,
  weight,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[
        styles.base,
        { fontSize: typography[variant], color, textAlign: align },
        weight ? { fontWeight: fontWeights[weight] } : null,
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
});
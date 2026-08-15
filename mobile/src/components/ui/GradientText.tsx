import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';

import { gradients, tracking, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export type GradientTextVariant = keyof typeof typography;

export interface GradientTextProps extends TextProps {
  /** Colors stop tuple for the gradient. Defaults to the NEXA brand. */
  colors?: readonly [string, string, ...string[]];
  variant?: GradientTextVariant;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

/**
 * Text filled with a vibrant gradient — used for hero headlines and playful
 * accents. Renders transparent text over a `LinearGradient` background.
 */
export function GradientText({
  colors: stopColors = gradients.brand,
  variant = 'heading',
  weight = '800',
  align,
  style,
  children,
  ...rest
}: GradientTextProps) {
  const { colors } = useAppTheme();
  return (
    <Text
      style={[
        {
          fontSize: typography[variant],
          fontWeight: weight,
          letterSpacing: tracking[variant],
          textAlign: align,
        },
        style,
      ]}
      {...rest}
    >
      <LinearGradient colors={stopColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={styles.fill}>{children}</Text>
      </LinearGradient>
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: {
    color: 'transparent',
  },
});
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'gradient'
  | 'sunset';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_COLORS: Record<
  ButtonVariant,
  { background?: string; gradient?: readonly [string, string, ...string[]]; text: string; border?: string }
> = {
  primary: { background: colors.primary, text: colors.surface },
  secondary: { background: colors.primarySoft, text: colors.primary },
  outline: { background: 'transparent', text: colors.primary, border: colors.primary },
  ghost: { background: 'transparent', text: colors.primary },
  danger: { background: '#FDE9ED', text: colors.danger },
  gradient: { gradient: gradients.brand, text: colors.surface },
  sunset: { gradient: gradients.sunset, text: colors.surface },
};

const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 50, lg: 58 };
const SIZE_FONT: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };
const SIZE_PADDING: Record<ButtonSize, number> = { sm: spacing.md, md: spacing.lg, lg: spacing.xl };

/**
 * Reusable button with variants, sizes, loading and disabled states.
 * Gradient variants give the signature NEXA pops of colour.
 */
export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: AppButtonProps) {
  const config = VARIANT_COLORS[variant];
  const isDisabled = disabled || loading;
  const textColor = isDisabled ? colors.textMuted : config.text;

  const label = loading ? (
    <ActivityIndicator color={textColor} size={size === 'lg' ? 'large' : 'small'} />
  ) : (
    <AppText
      variant="body"
      color={textColor}
      weight="bold"
      style={{ fontSize: SIZE_FONT[size], letterSpacing: 0.2 }}
    >
      {title}
    </AppText>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: config.border,
          height: SIZE_HEIGHT[size],
          paddingHorizontal: SIZE_PADDING[size],
          opacity: pressed && !isDisabled ? 0.88 : isDisabled ? 0.55 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
      {...rest}
    >
      {config.gradient ? (
        <LinearGradient
          colors={config.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : config.background ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: config.background }]} />
      ) : null}
      {label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.card,
  },
  fullWidth: {
    width: '100%',
  },
});
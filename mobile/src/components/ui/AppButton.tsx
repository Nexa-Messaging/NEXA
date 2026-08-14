import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

import { colors, fontWeights, radius, spacing, typography } from '@/constants/theme';
import { AppText } from '@/components/ui/AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_COLORS: Record<ButtonVariant, { background: string; text: string; border?: string }> = {
  primary: { background: colors.primary, text: colors.surface },
  secondary: { background: colors.primarySoft, text: colors.primary },
  outline: { background: 'transparent', text: colors.primary, border: colors.primary },
  ghost: { background: 'transparent', text: colors.primary },
  danger: { background: '#FDECEA', text: colors.danger },
};

const SIZE_HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };
const SIZE_FONT: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 17 };
const SIZE_PADDING: Record<ButtonSize, number> = { sm: spacing.md, md: spacing.lg, lg: spacing.lg };

/**
 * Reusable button with variants, sizes, loading and disabled states.
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: config.background,
          borderColor: config.border,
          height: SIZE_HEIGHT[size],
          paddingHorizontal: SIZE_PADDING[size],
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <AppText
          variant="body"
          color={textColor}
          weight="semibold"
          style={[{ fontSize: SIZE_FONT[size] }, styles.label]}
        >
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  label: {
    fontWeight: fontWeights.semibold,
  },
  fullWidth: {
    width: '100%',
  },
});
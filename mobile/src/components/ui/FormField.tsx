import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { radius, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** Renders a secure field with a show/hide toggle. */
  secure?: boolean;
  /** Optional helper text shown below the field (e.g. format rules). */
  hint?: string;
}

/**
 * Labeled text input wired to the design system, with inline error and helper
 * text and an optional show/hide toggle for password fields.
 */
export function FormField({
  label,
  error,
  secure = false,
  hint,
  style,
  onFocus,
  onBlur,
  editable,
  ...rest
}: FormFieldProps) {
  const { colors } = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  const borderColor = error ? colors.danger : isFocused ? colors.primary : colors.border;
  const backgroundColor = isFocused ? colors.surface : colors.inputBg;

  return (
    <View style={styles.container}>
      <AppText variant="label" weight="semibold" color={colors.textSecondary}>
        {label}
      </AppText>

      <View style={[styles.inputRow, { borderColor, backgroundColor }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          editable={editable}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: editable === false }}
          {...rest}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            onPress={() => setHidden((value) => !value)}
            style={styles.toggle}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <AppText variant="caption" tone="danger" style={styles.message}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted" style={styles.message}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    height: 54,
    fontSize: typography.body,
  },
  toggle: {
    paddingLeft: spacing.sm,
  },
  message: {
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
});
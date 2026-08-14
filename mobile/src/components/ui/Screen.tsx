import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, radius } from '@/constants/theme';

export interface ScreenProps {
  children: React.ReactNode;
  /** Content is rendered inside a scroll view. Defaults to `false`. */
  scroll?: boolean;
  /** Center content vertically (ignored when `scroll` is true). */
  centered?: boolean;
  /** Padding applied around content. Set to 0 to manage padding manually. */
  padding?: number;
  /** Card-style white rounded container for screen content. */
  card?: boolean;
  style?: ViewStyle;
}

/**
 * Shared screen container: safe area, background color, optional scrolling,
 * vertical centering and a card container.
 */
export function Screen({
  children,
  scroll = false,
  centered = false,
  padding = layout.screenPadding,
  card = false,
  style,
}: ScreenProps) {
  const content = (
    <View
      style={[
        card && styles.card,
        padding !== 0 ? { padding } : null,
        style,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[centered ? styles.centered : styles.grow]}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.flex, centered ? styles.centered : undefined]}>{content}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide error boundary. Catches render/lifecycle errors from any screen so
 * the app shows a recoverable fallback instead of a frozen white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnostics without crashing the app.
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <AppText variant="heading" weight="bold" align="center" style={styles.title}>
              Something went wrong
            </AppText>
            <AppText variant="body" color={colors.textSecondary} align="center" style={styles.body}>
              NEXA hit an unexpected error. Please try again — if it keeps
              happening, restart the app.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={this.handleRetry}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <AppText variant="label" color="#FFFFFF" weight="bold">
                Try again
              </AppText>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    marginBottom: spacing.sm,
  },
  body: {
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
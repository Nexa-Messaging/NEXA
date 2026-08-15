import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PushNavigation } from '@/components/PushNavigation';
import { Screen } from '@/components/ui';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <RootNavigator />
        <PushNavigation />
      </ErrorBoundary>
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

/**
 * Swaps between the public (auth) stack and the authenticated stack.
 * `Stack.Protected` guarantees unauthenticated users can never render an
 * authenticated screen and are redirected out as soon as the session changes.
 */
function RootNavigator() {
  const { isLoading, isConfigured, isAuthenticated } = useAuth();

  if (!isConfigured) {
    return (
      <Screen centered>
        <View style={styles.messageCard}>
          <AppText variant="heading" weight="bold" align="center" style={{ marginBottom: spacing.sm }}>
            Supabase is not configured
          </AppText>
          <AppText variant="body" color={colors.textSecondary} align="center" style={{ lineHeight: 22 }}>
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to
            your .env file, run the migration in supabase/migrations, then
            restart the app.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen centered>
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="label" color={colors.textSecondary} style={{ marginTop: spacing.md }}>
          Loading NEXA…
        </AppText>
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="users/[username]" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="new-chat" />
        <Stack.Screen name="new-group" />
        <Stack.Screen name="search" />
        <Stack.Screen name="chat/[conversationId]" />
        <Stack.Screen name="group/[chatId]" />
        <Stack.Screen name="group-info/[chatId]" />
        <Stack.Screen name="community/[communityId]" />
        <Stack.Screen name="community-info/[communityId]" />
        <Stack.Screen name="channel/[channelId]" />
        <Stack.Screen name="polls/[communityId]" />
        <Stack.Screen name="new-poll/[communityId]" />
        <Stack.Screen name="events/[communityId]" />
        <Stack.Screen name="event/[eventId]" />
        <Stack.Screen name="new-event/[communityId]" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  messageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
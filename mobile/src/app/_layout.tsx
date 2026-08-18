import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PushNavigation } from '@/components/PushNavigation';
import { Screen } from '@/components/ui';
import { SplashScreen } from '@/components/ui/SplashScreen';
import { AppText } from '@/components/ui/AppText';
import { radius, spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider, useAppTheme } from '@/lib/theme';
import { usePresenceTracker } from '@/hooks/usePresence';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <RootNavigator />
          <PushNavigation />
        </ErrorBoundary>
        <ThemedStatusBar />
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const { resolvedMode } = useAppTheme();
  return <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />;
}

/**
 * Swaps between the public (auth) stack and the authenticated stack.
 * `Stack.Protected` guarantees unauthenticated users can never render an
 * authenticated screen and are redirected out as soon as the session changes.
 */
function RootNavigator() {
  const { isLoading, isConfigured, isAuthenticated } = useAuth();
  const { colors } = useAppTheme();
  const [splashDone, setSplashDone] = useState(false);
  usePresenceTracker();

  if (!isConfigured) {
    return (
      <Screen centered>
        <View style={[styles.messageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          <Stack.Screen
            name="edit-profile"
            options={{ animation: 'fade_from_bottom' }}
          />
          <Stack.Screen name="users/[username]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="new-chat" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="new-group" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="chat/[conversationId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="group/[chatId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="group-info/[chatId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="community/[communityId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="community-info/[communityId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="channel/[channelId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="polls/[communityId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="new-poll/[communityId]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="events/[communityId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="event/[eventId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="new-event/[communityId]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="settings/appearance" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
      </Stack>

      {!splashDone ? (
        <SplashScreen ready={!isLoading} onDone={() => setSplashDone(true)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  messageCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
});
import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { installNotificationHandler, navigateFromPushResponse } from '@/lib/push';

/**
 * Renders nothing. Owns the push deep-link routing: when auth has settled and
 * a notification was tapped (warm tap while running, or cold-start resume),
 * it navigates to the screen the payload points at.
 *
 * expo-notifications has no web implementation of the response hook below, so
 * this whole tree is skipped on web (the app still works; only push routing
 * and foreground presentation are native-only features).
 */
export function PushNavigation() {
  if (Platform.OS === 'web') {
    return null;
  }
  return <PushNavigationNative />;
}

function PushNavigationNative() {
  const { isAuthenticated, isLoading } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    installNotificationHandler();
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !lastResponse) {
      return;
    }
    navigateFromPushResponse(lastResponse);
  }, [isLoading, isAuthenticated, lastResponse]);

  return null;
}
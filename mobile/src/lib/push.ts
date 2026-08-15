import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { openNotificationTarget, NotificationTarget } from '@/lib/notifications';
import { getSupabase } from '@/lib/supabase';

const PUSH_ASKED_KEY = 'nexa_push_permission_asked';

/** Latest token registered for this device; kept so sign-out can remove it. */
let registeredToken: { data: string } | null = null;

let handlerInstalled = false;

const handledPushResponses = new Set<string>();

/**
 * Tells Expo how to present a notification while the app is foregrounded.
 * Idempotent: safe to call at app startup and again after sign-in.
 */
export function installNotificationHandler(): void {
  if (handlerInstalled || Platform.OS === 'web') {
    return;
  }
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Routes a tapped push notification (warm tap or cold-start resume) to the
 * screen its payload describes. Response identifiers are deduplicated so a
 * resumed notification is only navigated once.
 */
export function navigateFromPushResponse(response: Notifications.NotificationResponse): void {
  const data = (response.notification.request.content.data ?? {}) as NotificationTarget;
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (handledPushResponses.has(key)) {
    return;
  }
  handledPushResponses.add(key);
  if (handledPushResponses.size > 64) {
    handledPushResponses.clear();
  }
  openNotificationTarget(data);
}

/** Reads the payload of the last notification the user tapped (cold start). */
export async function resumeFromPendingPush(): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    navigateFromPushResponse(response);
  }
}

/**
 * Requests permission (once per install) and registers the device's Expo push
 * token with the backend for the signed-in user. Never throws and never nags:
 * a declined permission prompt is remembered and won't be re-shown on the next
 * sign-in.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    let settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) {
      const asked = await AsyncStorage.getItem(PUSH_ASKED_KEY);
      if (asked !== null) {
        // User has already decided not to allow notifications. Respect that.
        return;
      }
      settings = await Notifications.requestPermissionsAsync();
      await AsyncStorage.setItem(PUSH_ASKED_KEY, settings.granted ? 'granted' : 'denied');
      if (!settings.granted) {
        return;
      }
    }

    // Requires `extra.eas.projectId` in app.json (set automatically by EAS
    // Build, or configured manually). Without it, Expo cannot mint a token.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token?.data) {
      return;
    }
    registeredToken = token;

    const supabase = getSupabase();
    const { error } = await supabase.rpc('register_device_token', {
      p_token: token.data,
      p_platform: Platform.OS === 'android' ? 'android' : 'ios',
    });
    if (error) {
      console.warn('Push token registration failed:', error.message);
    }
  } catch (error) {
    // Push infrastructure is best-effort; a failure must never break sign-in.
    console.warn('Push token registration skipped:', error);
  }
}

/** Removes this device's token so a signed-out user stops receiving pushes. */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !registeredToken) {
    return;
  }
  const token = registeredToken;
  registeredToken = null;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('unregister_device_token', { p_token: token.data });
    if (error) {
      console.warn('Push token unregister failed:', error.message);
    }
  } catch (error) {
    console.warn('Push token unregister skipped:', error);
  }
}
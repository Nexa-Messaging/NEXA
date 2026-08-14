import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';
import { RealtimeStatus } from '@/lib/messaging';

export interface RealtimeBannerProps {
  status: RealtimeStatus;
}

/**
 * Thin banner shown while realtime has not stabilised. Hidden once connected.
 */
export function RealtimeBanner({ status }: RealtimeBannerProps) {
  if (status === 'connected') {
    return null;
  }

  let text = 'Connecting…';
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-outline';
  let color = colors.warning;
  if (status === 'error' || status === 'disconnected') {
    text = 'Reconnecting… Live updates paused';
    icon = 'cloud-offline-outline';
    color = colors.warning;
  }

  return (
    <View style={styles.banner}>
      <Ionicons name={icon} size={14} color={color} />
      <AppText variant="caption" color={color} weight="semibold" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDF6E3',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    marginLeft: spacing.xxs,
  },
});
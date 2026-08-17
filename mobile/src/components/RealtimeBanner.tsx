import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { RealtimeStatus } from '@/lib/messaging';

export interface RealtimeBannerProps {
  status: RealtimeStatus;
}

/**
 * Thin banner shown while realtime has not stabilised. Hidden once connected.
 */
export function RealtimeBanner({ status }: RealtimeBannerProps) {
  const { colors } = useAppTheme();
  if (status === 'connected') {
    return null;
  }

  let text = 'Connecting…';
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-outline';
  let color: string = colors.warning;
  if (status === 'error' || status === 'disconnected') {
    text = 'Reconnecting… Live updates paused';
    icon = 'cloud-offline-outline';
    color = colors.coral;
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.sunSoft }]}>
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: {
    marginLeft: spacing.xxs,
  },
});
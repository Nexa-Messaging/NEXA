import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { gradients, radius, shadows } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { Mood, isMoodActive } from '@/lib/moods';

interface MoodBadgeProps {
  mood: Mood | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  /** Position the badge absolutely at bottom-right of parent (for avatar overlay). */
  overlay?: boolean;
}

const SIZE_CONFIG = {
  sm: { emojiSize: 16, labelSize: 10, paddingH: 8, paddingV: 3, gap: 4 },
  md: { emojiSize: 20, labelSize: 12, paddingH: 10, paddingV: 4, gap: 5 },
  lg: { emojiSize: 24, labelSize: 14, paddingH: 12, paddingV: 5, gap: 6 },
} as const;

export function MoodBadge({ mood, size = 'md', showLabel = true, overlay = false }: MoodBadgeProps) {
  const { colors } = useAppTheme();
  const cfg = SIZE_CONFIG[size];

  if (!isMoodActive(mood)) {
    return null;
  }

  const gradient = gradients.candy;

  const badgeStyle = [
    styles.badge,
    {
      paddingHorizontal: cfg.paddingH,
      paddingVertical: cfg.paddingV,
      gap: cfg.gap,
    },
    overlay && styles.overlay,
  ];

  return (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={badgeStyle}
    >
      <View style={styles.inner}>
        <AppText variant="body" style={{ fontSize: cfg.emojiSize, lineHeight: cfg.emojiSize + 4 }}>
          {mood.emoji}
        </AppText>
        {showLabel && (
          <AppText
            variant="caption"
            weight="bold"
            color={colors.headerText}
            style={{ fontSize: cfg.labelSize, lineHeight: cfg.labelSize + 2 }}
            numberOfLines={1}
          >
            {mood.label}
          </AppText>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    ...shadows.soft,
  },
  overlay: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    zIndex: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
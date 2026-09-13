import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { gradients, radius, shadows } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { BondMilestone } from '@/lib/bonds';

interface MilestoneBadgeProps {
  milestone: BondMilestone;
  isUnlocked: boolean;
  isClaimed: boolean;
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
}

const SIZE_CONFIG = {
  sm: { iconSize: 20, fontSize: 10, padding: 8, radius: radius.md },
  md: { iconSize: 28, fontSize: 12, padding: 12, radius: radius.lg },
  lg: { iconSize: 40, fontSize: 14, padding: 16, radius: radius.xl },
} as const;

const REWARD_ICONS: Record<string, string> = {
  reaction: '🤝',
  chat_theme: '🎨',
  visual_effect: '✨',
  badge: '🏅',
};

export function MilestoneBadge({
  milestone,
  isUnlocked,
  isClaimed,
  size = 'md',
  onPress,
}: MilestoneBadgeProps) {
  const { colors } = useAppTheme();
  const cfg = SIZE_CONFIG[size];
  const icon = REWARD_ICONS[milestone.reward_type] ?? '🎁';
  const isLocked = !isUnlocked;

  const gradient = isLocked
    ? ['#9B8875', '#7A6E5E'] as const
    : isClaimed
    ? ['#2ED9B3', '#38B8FF'] as const
    : gradients.sunshine;

  return (
    <Pressable
      style={[
        styles.badge,
        {
          padding: cfg.padding,
          borderRadius: cfg.radius,
          backgroundColor: isLocked ? undefined : undefined,
        },
      ]}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={isLocked ? `Locked: ${milestone.name}` : isClaimed ? `Claimed: ${milestone.name}` : `Unlocked: ${milestone.name}`}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientBg, { borderRadius: cfg.radius }]}
      >
        <View style={styles.content}>
          <AppText variant="body" style={{ fontSize: cfg.iconSize, lineHeight: cfg.iconSize + 8 }}>
            {isLocked ? '🔒' : icon}
          </AppText>
          <AppText
            variant="caption"
            weight="bold"
            color={isLocked ? colors.textMuted : colors.headerText}
            style={{ fontSize: cfg.fontSize, textAlign: 'center', marginTop: 2 }}
            numberOfLines={2}
          >
            {milestone.name}
          </AppText>
          {isClaimed && (
            <AppText variant="caption" color={colors.headerText} style={{ fontSize: cfg.fontSize - 2, marginTop: 1, opacity: 0.9 }}>
              Claimed
            </AppText>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...shadows.soft,
    minWidth: 90,
    alignItems: 'center',
  },
  gradientBg: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
});
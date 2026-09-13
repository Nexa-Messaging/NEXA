import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { gradients, radius } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

interface BondProgressProps {
  level: number;
  xp: number;
  nextLevelXP: number;
  progressPct: number;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showXP?: boolean;
}

const SIZE_CONFIG = {
  sm: { height: 6, fontSize: 10, gap: 4 },
  md: { height: 10, fontSize: 12, gap: 6 },
  lg: { height: 14, fontSize: 14, gap: 8 },
} as const;

export function BondProgress({
  level,
  xp,
  nextLevelXP,
  progressPct,
  animated = true,
  size = 'md',
  showXP = true,
}: BondProgressProps) {
  const { colors } = useAppTheme();
  const cfg = SIZE_CONFIG[size];
  const currentLevelXP = (level - 1) * (level - 1) * 100;
  const xpInLevel = xp - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;

  const progressAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (animated) {
      Animated.timing(progressAnim, {
        toValue: progressPct / 100,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } else {
      progressAnim.setValue(progressPct / 100);
    }
  }, [progressPct, animated, progressAnim]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { gap: cfg.gap }]}>
        <View style={styles.levelWrapper}>
          <LinearGradient
            colors={gradients.candy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.levelBadge,
              { paddingHorizontal: size === 'sm' ? 8 : 12, paddingVertical: size === 'sm' ? 2 : 4 },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              color={colors.headerText}
              style={{ fontSize: cfg.fontSize + 2 }}
            >
              LVL {level}
            </AppText>
          </LinearGradient>
        </View>

        {showXP && (
          <AppText
            variant="caption"
            weight="semibold"
            color={colors.textSecondary}
            style={{ fontSize: cfg.fontSize, marginTop: size === 'sm' ? 2 : 0 }}
          >
            {xpInLevel.toLocaleString()} / {xpNeeded.toLocaleString()} XP
          </AppText>
        )}
      </View>

      <View style={[styles.track, { height: cfg.height }]}>
        <Animated.View
          style={[
            styles.fill,
            { height: cfg.height },
            { backgroundColor: 'transparent' },
          ]}
        >
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.gradientFill,
              { height: cfg.height, borderRadius: cfg.height / 2 },
            ]}
          >
            <Animated.View
              style={{
                flex: 1,
                transform: [
                  { scaleX: progressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
                ],
              }}
            />
          </LinearGradient>
        </Animated.View>
      </View>

      <AppText variant="caption" tone="muted" style={{ fontSize: cfg.fontSize - 1, textAlign: 'right', marginTop: 2 }}>
        {progressPct.toFixed(1)}% to level {level + 1}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelWrapper: {
    flexShrink: 0,
  },
  levelBadge: {
    borderRadius: radius.pill,
    ...{ shadowColor: '#6D5CF5', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  },
  track: {
    borderRadius: 999,
    backgroundColor: '#E7D8C6',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  gradientFill: {
    borderRadius: 999,
  },
});
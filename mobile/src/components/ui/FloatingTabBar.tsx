import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';

export interface TabBarItem {
  name: string;
  title: string;
  icon: (focused: boolean) => React.ReactNode;
}

export interface FloatingTabBarProps {
  items: TabBarItem[];
  active: string;
  /** Per-tab unread badge counts, keyed by tab `name`. Hidden when absent/zero. */
  badges?: Record<string, number>;
  onSelect: (name: string) => void;
}

/**
 * Floating soft-graffiti bottom bar: a gradient pill highlights the active
 * tab, each tab keeps its label readable, and the whole bar floats above the
 * content with a soft shadow (instead of a hard-edged default tab bar).
 */
export function FloatingTabBar({ items, active, badges, onSelect }: FloatingTabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar}>
        {items.map((item) => {
          const focused = item.name === active;
          const badge = badges?.[item.name] ?? 0;
          return (
            <Pressable
              key={item.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={item.title}
              style={styles.tab}
              onPress={() => onSelect(item.name)}
            >
              {focused ? (
                <LinearGradient
                  colors={gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activePill}
                />
              ) : null}
              <View style={styles.iconWrap}>
                {item.icon(focused)}
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <AppText variant="caption" weight="bold" color={colors.surface} style={styles.badgeText}>
                      {badge > 99 ? '99+' : badge}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText
                variant="caption"
                weight={focused ? 'bold' : 'medium'}
                color={focused ? colors.primary : colors.textMuted}
                style={styles.label}
              >
                {item.title}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: spacing.md,
    marginBottom: Platform.OS === 'ios' ? spacing.xs : spacing.sm,
    paddingVertical: spacing.xxs,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.pop,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.xxl,
    overflow: 'visible',
  },
  activePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: spacing.xs,
    right: spacing.xs,
    borderRadius: radius.pill,
    opacity: 0.14,
  },
  iconWrap: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 13,
  },
  label: {
    marginTop: 2,
    fontSize: 11,
  },
});
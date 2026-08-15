import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { ColorMode } from '@/constants/themeTokens';
import { useAppTheme } from '@/lib/theme';

const OPTIONS: { value: ColorMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System Default', icon: 'phone-portrait-outline' },
];

export default function AppearanceScreen() {
  const { mode, setMode, colors: c } = useAppTheme();

  return (
    <Screen padding={0}>
      <LinearGradient
        colors={gradients.ocean}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBand}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={22} color={c.surface} />
          </Pressable>
          <AppText variant="heading" weight="bold" color={c.surface} style={styles.headerTitle}>
            Appearance
          </AppText>
          <View style={styles.backButton} />
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <AppText variant="label" weight="semibold" color={c.textSecondary} style={styles.sectionLabel}>
          THEME
        </AppText>
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setMode(option.value)}
              style={[styles.option, { backgroundColor: c.surface, borderColor: active ? c.primary : c.border }]}
            >
              <Ionicons
                name={option.icon}
                size={22}
                color={active ? c.primary : c.textSecondary}
                style={styles.optionIcon}
              />
              <AppText
                variant="body"
                weight={active ? 'bold' : 'regular'}
                color={active ? c.primary : c.text}
                style={styles.optionLabel}
              >
                {option.label}
              </AppText>
              {active ? (
                <Ionicons name="checkmark-circle" size={22} color={c.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={c.textMuted} />
              )}
            </Pressable>
          );
        })}
      </View>

      <AppText variant="caption" color={c.textMuted} style={styles.hint}>
        {"System Default follows your device's appearance setting."}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBand: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    marginHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  optionIcon: {
    marginRight: spacing.sm,
  },
  optionLabel: {
    flex: 1,
  },
  hint: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    lineHeight: 18,
  },
});

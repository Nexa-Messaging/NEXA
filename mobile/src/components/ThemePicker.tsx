import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useUserTheme } from '@/lib/userTheme';
import { USER_THEMES, UserTheme } from '@/lib/themes';

export function ThemePicker() {
  const { colors } = useAppTheme();
  const { theme: active, setThemeId } = useUserTheme();

  return (
    <View style={s.container}>
      <AppText variant="heading" weight="bold" style={s.sectionTitle}>
        Theme
      </AppText>
      <FlatList
        data={USER_THEMES as unknown as UserTheme[]}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const isActive = active.id === item.id;
          return (
            <Pressable
              onPress={() => setThemeId(item.id)}
              style={[
                s.card,
                {
                  borderColor: isActive ? item.primary : colors.border,
                  backgroundColor: isActive ? item.primarySoft : colors.surface,
                },
                isActive && shadows.card,
              ]}
            >
              <LinearGradient
                colors={item.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.preview}
              >
                <View style={s.previewInner}>
                  <View style={[s.bubble, { backgroundColor: item.bubbleMine, borderRadius: item.bubbleStyle === 'square' ? 4 : 16 }]} />
                  <View style={[s.bubble, { backgroundColor: item.bubbleTheirs, borderRadius: item.bubbleStyle === 'square' ? 4 : 16, alignSelf: 'flex-end' }]} />
                </View>
              </LinearGradient>

              <View style={s.labelRow}>
                <AppText variant="label" weight={isActive ? 'bold' : 'regular'} numberOfLines={1}>
                  {item.emoji} {item.name}
                </AppText>
                {isActive ? (
                  <Ionicons name="checkmark-circle" size={16} color={item.primary} />
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  list: {
    paddingHorizontal: spacing.xxs,
    gap: spacing.sm,
  },
  card: {
    width: 130,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  preview: {
    height: 80,
    padding: spacing.sm,
    justifyContent: 'flex-end',
  },
  previewInner: {
    gap: 4,
  },
  bubble: {
    height: 14,
    width: '70%',
    borderRadius: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
});

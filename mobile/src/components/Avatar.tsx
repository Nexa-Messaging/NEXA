import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, fontWeights } from '@/constants/theme';

export interface AvatarProps {
  uri?: string | null;
  /** Display name used to derive the initials fallback. */
  name?: string | null;
  size?: number;
  accessibilityLabel?: string;
}

export function initialsFrom(name?: string | null): string {
  if (!name) {
    return '';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/**
 * Renders a circular avatar image, falling back to an initial-letter circle
 * (with a neutral icon when no name is available) so the UI never shows an
 * empty hole when a user has no photo.
 */
export function Avatar({ uri, name, size = 64, accessibilityLabel }: AvatarProps) {
  const radius = size / 2;
  const initials = initialsFrom(name);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={accessibilityLabel ?? `${name ?? 'User'} avatar`}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius },
      ]}
      accessibilityLabel={accessibilityLabel ?? `${name ?? 'User'} avatar placeholder`}
    >
      {initials ? (
        <AppText
          variant="heading"
          color={colors.primary}
          weight="bold"
          style={{ fontSize: size * 0.34 }}
        >
          {initials}
        </AppText>
      ) : (
        <Ionicons name="person" size={size * 0.45} color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, gradients } from '@/constants/theme';

export interface AvatarProps {
  uri?: string | null;
  /** Display name used to derive the initials fallback. */
  name?: string | null;
  size?: number;
  /** Show a thin gradient ring around the avatar (stories look). */
  ring?: boolean;
  accessibilityLabel?: string;
}

const RING_GRADIENTS: readonly (readonly [string, string, ...string[]])[] = [
  gradients.brand,
  gradients.sunset,
  gradients.meadow,
  gradients.ocean,
  gradients.candy,
  gradients.sunshine,
];

export function initialsFrom(name?: string | null): string {
  if (!name) {
    return '';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Picks a stable gradient (by name hash) so each person gets a personality. */
export function gradientForName(name?: string | null): readonly [string, string, ...string[]] {
  const key = (name ?? '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return RING_GRADIENTS[key % RING_GRADIENTS.length];
}

/**
 * Circular avatar with a per-name gradient fallback ("sticker initials") and
 * an optional gradient ring, so the feed is colourful even without photos.
 */
export function Avatar({ uri, name, size = 64, ring = false, accessibilityLabel }: AvatarProps) {
  const radius = size / 2;
  const initials = initialsFrom(name);
  const fallbackGradient = gradientForName(name);
  const label = accessibilityLabel ?? `${name ?? 'User'} avatar`;

  const avatarContent = uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      transition={150}
      accessibilityLabel={label}
    />
  ) : (
    <LinearGradient
      colors={fallbackGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}
      accessibilityLabel={label}
    >
      {initials ? (
        <AppText
          variant="heading"
          color={colors.surface}
          weight="bold"
          style={{ fontSize: size * 0.34 }}
        >
          {initials}
        </AppText>
      ) : (
        <Ionicons name="person" size={size * 0.45} color={colors.surface} />
      )}
    </LinearGradient>
  );

  if (!ring) {
    return avatarContent;
  }

  const ringSize = size + 8;
  return (
    <LinearGradient
      colors={fallbackGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.ring,
        { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
      ]}
    >
      <View
        style={[
          styles.ringInner,
          { width: size + 2, height: size + 2, borderRadius: (size + 2) / 2 },
        ]}
      >
        {avatarContent}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/lib/theme';

export interface BlobStyle {
  size: number;
  color: string;
  opacity?: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  /** Rough organic offset: extra corner radius tuning. */
  cornerTL?: number;
  cornerTR?: number;
  cornerBL?: number;
  cornerBR?: number;
  rotate?: string;
}

export interface BackdropProps {
  /** Organic blob circles scattered behind content. */
  blobs?: BlobStyle[];
  style?: ViewStyle;
  children?: React.ReactNode;
}

function defaultBlobs(colors: ReturnType<typeof useAppTheme>['colors']): BlobStyle[] {
  return [
    { size: 220, color: colors.primarySoft, top: -70, right: -80, opacity: 0.9 },
    { size: 140, color: colors.pinkSoft, top: 160, left: -60, opacity: 0.8 },
    { size: 180, color: colors.skySoft, bottom: 40, right: -70, opacity: 0.7 },
  ];
}

/**
 * Layered, soft organic shapes ("blobs") that sit behind a screen's content.
 * Renders sticker-like rounded shapes with hand-drawn-feeling asymmetric
 * corner radii to give the NEXA soft-graffiti personality.
 */
export function Backdrop({ blobs, style, children }: BackdropProps) {
  const { colors } = useAppTheme();
  const resolvedBlobs = blobs ?? defaultBlobs(colors);
  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      {resolvedBlobs.map((blob, index) => (
        <View
          key={index}
          style={[
            styles.blob,
            {
              width: blob.size,
              height: blob.size,
              backgroundColor: blob.color,
              opacity: blob.opacity ?? 0.6,
              top: blob.top,
              left: blob.left,
              right: blob.right,
              bottom: blob.bottom,
              borderTopLeftRadius: blob.cornerTL ?? blob.size * 0.5,
              borderTopRightRadius: blob.cornerTR ?? blob.size * 0.44,
              borderBottomLeftRadius: blob.cornerBL ?? blob.size * 0.42,
              borderBottomRightRadius: blob.cornerBR ?? blob.size * 0.5,
              transform: blob.rotate ? [{ rotate: blob.rotate }] : undefined,
            },
          ]}
        />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
  },
});
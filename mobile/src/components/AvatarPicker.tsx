import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText } from '@/components/ui/AppText';
import { colors, fontWeights, radius } from '@/constants/theme';

export interface PickedAsset {
  uri: string | null;
  mimeType: string | null;
}

export interface AvatarPickerProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  onSelect: (asset: PickedAsset) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/**
 * Avatar control that lets the user pick a photo from their library. Picking
 * and permission handling live here; upload + persistence stay in the screen.
 */
export function AvatarPicker({
  uri,
  name,
  size = 108,
  onSelect,
  onError,
  disabled = false,
}: AvatarPickerProps) {
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    if (busy || disabled) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError('Photo library access is required to set a profile picture.');
        return;
      }

      setBusy(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        return;
      }

      onSelect({
        uri: asset.uri,
        mimeType: asset.mimeType ?? guessMimeType(asset.fileName),
      });
    } catch (error) {
      console.warn('Image pick failed:', error);
      onError('Could not open the photo library. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.center}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Change profile picture"
        accessibilityState={{ disabled: busy || disabled }}
        disabled={busy || disabled}
        onPress={pickImage}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        {busy ? (
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Avatar uri={uri} name={name} size={size} />
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || disabled }}
        disabled={busy || disabled}
        onPress={pickImage}
        style={styles.changeLink}
      >
        <Ionicons name="camera-outline" size={16} color={colors.primary} />
        <AppText variant="label" color={colors.primary} weight="semibold" style={styles.changeText}>
          {uri ? 'Change photo' : 'Add photo'}
        </AppText>
      </Pressable>
    </View>
  );
}

function guessMimeType(fileName: string | null | undefined): string | null {
  if (!fileName) {
    return null;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  pressable: {
    borderRadius: radius.xl,
  },
  pressed: {
    opacity: 0.8,
  },
  changeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  changeText: {
    marginLeft: 6,
  },
});
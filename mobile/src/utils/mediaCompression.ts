import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Video upload limit. When transcoding is unavailable the picker refuses files
 * above this size instead of uploading a multi-hundred-MB file.
 */
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

export interface PickedVideo {
  uri: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  sizeBytes?: number;
}

export type PickVideoResult =
  | { canceled: true }
  | { canceled: false; video: PickedVideo }
  | { canceled: false; error: string };

/**
 * Picks a video from the library and compresses it where the platform can.
 *
 * - iOS: the picker re-encodes the selected video to H.264/AAC 720p via
 *   `videoExportPreset`, which typically cuts file size dramatically before
 *   upload.
 * - Android: the official picker exposes no video re-encode hook, so we fall
 *   back to a hard size cap (`MAX_VIDEO_BYTES`) and reject oversized files
 *   with a friendly message.
 *
 * Returns a screen-ready result (canceled / error / compressed asset).
 */
export async function pickCompressedVideo(): Promise<PickVideoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      canceled: false,
      error: 'Photo library access is required to send videos.',
    };
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
  };
  if (Platform.OS === 'ios') {
    // Re-encode to H.264/AAC at 720p max — the official iOS compression hook.
    options.videoExportPreset = ImagePicker.VideoExportPreset.H264_1280x720;
  }

  const result = await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) {
    return { canceled: true };
  }

  const asset = result.assets[0];
  const sizeBytes = typeof asset.fileSize === 'number' ? asset.fileSize : undefined;

  // Android cannot transcode, so enforce the upload cap here.
  if (Platform.OS !== 'ios' && sizeBytes != null && sizeBytes > MAX_VIDEO_BYTES) {
    return {
      canceled: false,
      error: `This video is ${Math.ceil(sizeBytes / (1024 * 1024))} MB — above the ${Math.round(
        MAX_VIDEO_BYTES / (1024 * 1024),
      )} MB upload limit. Choose a shorter video.`,
    };
  }

  return {
    canceled: false,
    video: {
      uri: asset.uri,
      width: asset.width > 0 ? asset.width : undefined,
      height: asset.height > 0 ? asset.height : undefined,
      durationSeconds: asset.duration ? asset.duration / 1000 : undefined,
      sizeBytes,
    },
  };
}
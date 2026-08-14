import { getSupabase } from '@/lib/supabase';

/** Public bucket that holds user avatars. Files are stored as "<user_id>/<file>". */
export const AVATARS_BUCKET = 'avatars';

/** Supported avatar mime types -> file extension. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
};

export interface AvatarSource {
  /** Local file uri from an image picker. */
  uri: string | null;
  /** Mime type of the uploaded image, e.g. "image/jpeg". */
  mimeType: string | null;
}

export interface ReplaceAvatarResult {
  publicUrl: string | null;
  error: string | null;
}

function extensionFor(mimeType: string | null): string {
  if (mimeType) {
    const ext = MIME_EXTENSIONS[mimeType.toLowerCase()];
    if (ext) {
      return ext;
    }
  }
  return 'jpg';
}

function isSupportedImage(mimeType: string | null): boolean {
  if (!mimeType) {
    return true; // Let the backend reject unknown formats.
  }
  return Object.keys(MIME_EXTENSIONS).includes(mimeType.toLowerCase());
}

/**
 * Uploads a new avatar for the user and returns the permanent public URL.
 * The object is stored under "<user_id>/<timestamp>.<ext>" so replacing an
 * avatar always yields a fresh URL (no stale image cache) and every file lands
 * inside the owner's own folder (enforced again by the storage RLS policies).
 *
 * On failure it cleans up any partially uploaded object and returns the error.
 */
export async function replaceAvatar(
  userId: string,
  source: AvatarSource,
): Promise<ReplaceAvatarResult> {
  if (!source.uri) {
    return { publicUrl: null, error: 'No image was selected.' };
  }
  if (!isSupportedImage(source.mimeType)) {
    return {
      publicUrl: null,
      error: 'Unsupported image type. Please use JPG, PNG or WebP.',
    };
  }

  const extension = extensionFor(source.mimeType);
  const objectPath = `${userId}/${Date.now()}.${extension}`;

  try {
    const supabase = getSupabase();

    const response = await fetch(source.uri);
    if (!response.ok) {
      return { publicUrl: null, error: 'Could not read the selected image.' };
    }
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(objectPath, blob, {
        contentType: source.mimeType ?? 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      return {
        publicUrl: null,
        error: `Upload failed (${uploadError.message}). Please try again.`,
      };
    }

    const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(objectPath);
    return { publicUrl: data.publicUrl, error: null };
  } catch (err) {
    console.warn('Avatar upload failed:', err);
    return { publicUrl: null, error: 'Upload failed. Check your connection and try again.' };
  }
}

/**
 * Derives the storage object path (e.g. "<user_id>/<file>.png") from a public
 * URL so the old object can be removed when the avatar is replaced.
 */
export function publicUrlToObjectPath(publicUrl: string | null): string | null {
  if (!publicUrl) {
    return null;
  }
  const marker = `/object/public/${AVATARS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const path = publicUrl.slice(index + marker.length);
  return path.split('?')[0] || null;
}

/**
 * Best-effort removal of a previously uploaded avatar object. Ignored errors
 * are logged but never surfaced as a hard failure.
 */
export async function removeAvatarObject(objectPath: string): Promise<void> {
  if (!objectPath || !objectPath.includes('/')) {
    return;
  }
  try {
    const supabase = getSupabase();
    await supabase.storage.from(AVATARS_BUCKET).remove([objectPath]);
  } catch (err) {
    console.warn('Avatar removal failed:', err);
  }
}
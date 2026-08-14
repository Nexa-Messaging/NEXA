import { env } from '@/config/env';

export interface UploadObjectOptions {
  bucket: string;
  objectPath: string;
  /** Local file uri on the device. */
  uri: string;
  mimeType: string;
  accessToken: string;
  onProgress?: (fraction: number) => void;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function parseUploadError(status: number, responseText: string): string {
  try {
    const body = JSON.parse(responseText) as { message?: string; error?: string };
    if (body.message) {
      return body.message;
    }
    if (body.error) {
      return body.error;
    }
  } catch {
    // Fall through to the generic message.
  }
  return `Upload failed (HTTP ${status}). Please try again.`;
}

/**
 * Uploads a file into a private Supabase storage bucket using an XHR POST so
 * real upload progress can be reported (supabase-js does not expose events).
 * Objects are placed BEFORE the matching database row exists, so storage RLS
 * must be path-based (folder ownership + membership rules per bucket).
 */
export function uploadObjectViaXhr(options: UploadObjectOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const base = (env.supabaseUrl ?? '').replace(/\/$/, '');
    const endpoint = `${base}/storage/v1/object/${options.bucket}/${encodePath(options.objectPath)}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${options.accessToken}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.timeout = 120_000;

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(event.loaded / event.total);
      }
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve();
      } else {
        reject(new Error(parseUploadError(xhr.status, xhr.responseText)));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));

    const form = new FormData();
    form.append('file', {
      uri: options.uri,
      name: options.objectPath.split('/').pop() ?? 'file',
      type: options.mimeType,
    } as unknown as Blob);
    xhr.send(form);
  });
}
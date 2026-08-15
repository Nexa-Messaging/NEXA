import * as Crypto from 'expo-crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** RFC 4122 version 4 UUID generated from the platform CSPRNG. */
export function genUuid(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * URL/path-safe random token of `length` characters (lowercase alnum),
 * generated from the platform CSPRNG. Used for storage object name suffixes
 * and local message ids so collisions/uploads cannot be predicted.
 */
export function randomToken(length: number): string {
  if (length <= 0) {
    return '';
  }
  const bytes = Crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
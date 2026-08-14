/**
 * Client-side validation helpers for the auth forms. Error messages are
 * intentionally displayed directly to the user.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Username: 3-20 chars, lowercase letters, digits and underscores. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const PASSWORD_MIN_LENGTH = 8;

export interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
  username?: string;
}

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) {
    return 'Email is required.';
  }
  if (!EMAIL_PATTERN.test(value.trim())) {
    return 'Enter a valid email address.';
  }
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) {
    return 'Password is required.';
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return undefined;
}

export function validateDisplayName(value: string): string | undefined {
  if (!value.trim()) {
    return 'Display name is required.';
  }
  if (value.trim().length > 50) {
    return 'Display name must be 50 characters or fewer.';
  }
  return undefined;
}

/** Normalizes a username to the storage format (trimmed, lowercase). */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string | undefined {
  const normalized = normalizeUsername(value);
  if (!normalized) {
    return 'Username is required.';
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Use 3-20 letters, numbers or underscores.';
  }
  return undefined;
}

// ---- Profile fields -------------------------------------------------------

export const BIO_MAX_LENGTH = 500;
export const SCHOOL_MAX_LENGTH = 120;
export const DEPARTMENT_MAX_LENGTH = 120;
export const LEVEL_MAX_LENGTH = 20;

export function validateBio(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > BIO_MAX_LENGTH) {
    return `Bio must be ${BIO_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

export function validateSchool(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > SCHOOL_MAX_LENGTH) {
    return `School must be ${SCHOOL_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

export function validateDepartment(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > DEPARTMENT_MAX_LENGTH) {
    return `Department must be ${DEPARTMENT_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

export function validateLevel(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > LEVEL_MAX_LENGTH) {
    return `Level must be ${LEVEL_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

// ---- Group chats -----------------------------------------------------------

export const GROUP_NAME_MAX_LENGTH = 80;

export function validateGroupName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Group name is required.';
  }
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
    return `Group name must be ${GROUP_NAME_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}
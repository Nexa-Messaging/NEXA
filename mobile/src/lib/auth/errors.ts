import { AuthError, PostgrestError } from '@supabase/supabase-js';

/**
 * Translates Supabase AuthApiError codes/messages and Postgrest errors into
 * user-friendly messages for display in the UI.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TypeError' && /network|fetch/i.test(error.message)) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function getSignUpErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists.';
    case 'weak_password':
      return 'Password is too weak. Try a longer one.';
    case 'over_email_send_rate_limit':
      return 'Too many requests. Wait a moment and try again.';
    case 'signup_disabled':
      return 'Sign-ups are currently disabled.';
    default:
      return getAuthErrorMessage(error);
  }
}

export function getSignInErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_not_confirmed':
      return 'Please confirm your email address before signing in.';
    case 'user_suspended':
      return 'This account has been suspended.';
    case 'weak_password':
      return 'Password is too weak.';
    default:
      return getAuthErrorMessage(error);
  }
}

export function getSignOutErrorMessage(error: AuthError): string {
  return getAuthErrorMessage(error);
}

/** Message shown when a profile insert/update reports a duplicate username. */
export function getProfileWriteErrorMessage(error: PostgrestError): string | null {
  if (error.code === '23505' && /username/i.test(error.message)) {
    return 'That username is already taken.';
  }
  return null;
}
export { AuthProvider, useAuth } from './AuthContext';
export type { AuthActionResult, SignUpInput, SignUpResult } from './AuthContext';

export {
  getAuthErrorMessage,
  getSignInErrorMessage,
  getSignOutErrorMessage,
  getSignUpErrorMessage,
} from './errors';

export { fetchProfileById, fetchProfileByUsername, updateOwnProfile } from '@/lib/profiles';
export { replaceAvatar, removeAvatarObject, AVATARS_BUCKET } from '@/lib/storage';
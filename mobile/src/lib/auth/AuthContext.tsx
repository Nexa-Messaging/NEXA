import { SupabaseClient } from '@supabase/supabase-js';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import {
  getProfileWriteErrorMessage,
  getSignInErrorMessage,
  getSignOutErrorMessage,
  getSignUpErrorMessage,
} from '@/lib/auth/errors';
import { fetchProfileById } from '@/lib/profiles';
import { installNotificationHandler, registerPushToken, unregisterPushToken } from '@/lib/push';
import { stopPresenceTracking, updateLastSeen } from '@/lib/presence';
import { cleanupTyping } from '@/lib/typing';
import { SupabaseNotConfiguredError, getSupabase } from '@/lib/supabase';
import { Profile } from '@/types/database';
import { normalizeUsername } from '@/utils/validation';

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

export interface SignUpResult {
  error: string | null;
  /** True when the sign-up succeeded but the email must be confirmed first. */
  needsEmailConfirmation: boolean;
}

export interface AuthActionResult {
  error: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True while the persisted session is being restored on app start. */
  isLoading: boolean;
  /** False when Supabase env vars are missing (nothing can be signed in). */
  isConfigured: boolean;
  isAuthenticated: boolean;
  refreshProfile: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);

  useEffect(() => {
    let active = true;

    let supabase: SupabaseClient;
    try {
      supabase = getSupabase();
    } catch (error) {
      if (error instanceof SupabaseNotConfiguredError) {
        if (active) {
          setIsConfigured(false);
          setIsLoading(false);
        }
        return;
      }
      throw error;
    }

    // Foreground presentation of pushes is a global behavior, so install it as
    // early as possible. The call is idempotent.
    installNotificationHandler();

    const loadProfile = async (userId: string) => {
      const { data } = await fetchProfileById(userId);
      if (active) {
        setProfile(data);
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
      if (data.session) {
        void loadProfile(data.session.user.id);
        void registerPushToken();
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }
      setSession(nextSession);
      if (nextSession) {
        void loadProfile(nextSession.user.id);
        void updateLastSeen();
        if (event === 'SIGNED_IN') {
          void registerPushToken();
        }
      } else {
        setProfile(null);
        if (event === 'SIGNED_OUT') {
          void unregisterPushToken();
        }
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = session?.user;
    if (!currentUser) {
      setProfile(null);
      return;
    }
    const { data } = await fetchProfileById(currentUser.id);
    setProfile(data);
  }, [session?.user]);

  const signUp = useCallback(async (input: SignUpInput): Promise<SignUpResult> => {
    const supabase = getSupabase();
    const email = input.email.trim().toLowerCase();
    const username = normalizeUsername(input.username);
    const displayName = input.displayName.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: { display_name: displayName, username },
      },
    });

    if (error) {
      return { error: getSignUpErrorMessage(error), needsEmailConfirmation: false };
    }

    const user = data.user;
    if (user) {
      // The DB trigger handle_new_user() is the source of truth for creating
      // the profile row. This upsert is a belt-and-suspenders fallback for
      // setups where the trigger has not been applied.
      const { error: insertError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, email, display_name: displayName, username },
          { onConflict: 'id' },
        );

      if (insertError) {
        const friendly = getProfileWriteErrorMessage(insertError);
        if (friendly) {
          return { error: friendly, needsEmailConfirmation: false };
        }
        console.warn('Profile upsert after sign-up failed:', insertError.message);
      }
    }

    const needsEmailConfirmation = data.session === null;
    return { error: null, needsEmailConfirmation };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error ? getSignInErrorMessage(error) : null };
  }, []);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    const supabase = getSupabase();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.warn('Sign out failed:', signOutError);
      return { error: getSignOutErrorMessage(signOutError) };
    }
    // Clear local state immediately even though onAuthStateChange also fires.
    setSession(null);
    setProfile(null);
    stopPresenceTracking();
    cleanupTyping();
    return { error: null };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      isConfigured,
      isAuthenticated: session !== null,
      refreshProfile,
      signUp,
      signIn,
      signOut,
    }),
    [session, profile, isLoading, isConfigured, refreshProfile, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return value;
}
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { UserTheme, resolveTheme, DEFAULT_THEME_ID } from '@/lib/themes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const THEME_PREF_KEY = '@nexa_user_theme';

export interface UserPreferences {
  themeId: string;
  chatBubbleStyle: string;
  graffitiStyle: string;
  stickerPack: string;
  backgroundId: string;
  profileAccent: string | null;
}

interface UserThemeContextValue {
  /** The resolved active theme object. */
  theme: UserTheme;
  /** Raw preferences (theme_id, bubble_style, etc). */
  preferences: UserPreferences;
  /** Whether preferences are still loading from the backend. */
  loading: boolean;
  /** Change the active theme by ID. Persists to DB + local cache. */
  setThemeId: (themeId: string) => void;
  /** Update any preference field. Persists to DB + local cache. */
  updatePreferences: (patch: Partial<UserPreferences>) => void;
}

const defaultPrefs: UserPreferences = {
  themeId: DEFAULT_THEME_ID,
  chatBubbleStyle: 'default',
  graffitiStyle: 'default',
  stickerPack: 'default',
  backgroundId: 'default',
  profileAccent: null,
};

const UserThemeContext = createContext<UserThemeContextValue>({
  theme: resolveTheme(DEFAULT_THEME_ID),
  preferences: defaultPrefs,
  loading: true,
  setThemeId: () => {},
  updatePreferences: () => {},
});

export function UserThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPrefs);
  const [loading, setLoading] = useState(true);

  // Instant load from AsyncStorage on mount
  useEffect(() => {
    void AsyncStorage.getItem(THEME_PREF_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as UserPreferences;
          setPreferences(parsed);
          setLoading(false);
        } catch {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
  }, []);

  // Sync from Supabase when user is available
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabase() as AnySupabase;
    supabase.rpc('get_user_preferences', { p_user_id: user.id }).then((result: { data: Record<string, unknown> | null; error: unknown }) => {
      const { data, error } = result;
      if (error || !data) return;
      const prefs: UserPreferences = {
        themeId: (data.theme_id as string) || DEFAULT_THEME_ID,
        chatBubbleStyle: (data.chat_bubble_style as string) || 'default',
        graffitiStyle: (data.graffiti_style as string) || 'default',
        stickerPack: (data.sticker_pack as string) || 'default',
        backgroundId: (data.background_id as string) || 'default',
        profileAccent: (data.profile_accent as string) ?? null,
      };
      setPreferences(prefs);
      void AsyncStorage.setItem(THEME_PREF_KEY, JSON.stringify(prefs));
    });
  }, [user]);

  const setThemeId = useCallback(
    (themeId: string) => {
      const next = { ...preferences, themeId };
      setPreferences(next);
      void AsyncStorage.setItem(THEME_PREF_KEY, JSON.stringify(next));
      if (user) {
        const supabase = getSupabase() as AnySupabase;
        void supabase.rpc('update_user_preferences', {
          p_user_id: user.id,
          p_theme_id: themeId,
        });
      }
    },
    [preferences, user],
  );

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      const next = { ...preferences, ...patch };
      setPreferences(next);
      void AsyncStorage.setItem(THEME_PREF_KEY, JSON.stringify(next));
      if (user) {
        const supabase = getSupabase() as AnySupabase;
        void supabase.rpc('update_user_preferences', {
          p_user_id: user.id,
          p_theme_id: patch.themeId ?? null,
          p_chat_bubble_style: patch.chatBubbleStyle ?? null,
          p_graffiti_style: patch.graffitiStyle ?? null,
          p_sticker_pack: patch.stickerPack ?? null,
          p_background_id: patch.backgroundId ?? null,
          p_profile_accent: patch.profileAccent ?? null,
        });
      }
    },
    [preferences, user],
  );

  const theme = useMemo(() => resolveTheme(preferences.themeId), [preferences.themeId]);

  const value = useMemo<UserThemeContextValue>(
    () => ({
      theme,
      preferences,
      loading,
      setThemeId,
      updatePreferences,
    }),
    [theme, preferences, loading, setThemeId, updatePreferences],
  );

  return <UserThemeContext.Provider value={value}>{children}</UserThemeContext.Provider>;
}

/** Access the active personalization theme + preferences. */
export function useUserTheme() {
  return useContext(UserThemeContext);
}

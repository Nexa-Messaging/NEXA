import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  AppColors,
  ColorMode,
  darkColors,
  darkShadows,
  gradients,
  lightColors,
  lightShadows,
} from '@/constants/themeTokens';
import { resolveTheme } from '@/lib/themes';

const THEME_KEY = '@nexa_theme_mode';
const USER_THEME_KEY = '@nexa_user_theme';

interface ThemeContextValue {
  mode: ColorMode;
  resolvedMode: 'light' | 'dark';
  colors: AppColors;
  gradients: typeof gradients;
  shadows: typeof lightShadows | typeof darkShadows;
  setMode: (mode: ColorMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedMode: 'light',
  colors: lightColors,
  gradients,
  shadows: lightShadows,
  setMode: () => {},
});

/**
 * Merges user personalization theme colors on top of the base mode colors.
 * Only overrides the keys the user theme defines differently.
 */
function mergeWithUserTheme(base: AppColors, themeId: string | null): AppColors {
  if (!themeId || themeId === 'default') return base;
  const ut = resolveTheme(themeId);
  return {
    ...base,
    primary: ut.primary,
    primaryDeep: ut.primaryDeep,
    primarySoft: ut.primarySoft,
    bubbleMine: ut.bubbleMine,
    bubbleTheirs: ut.bubbleTheirs,
    background: ut.background,
    surface: ut.surface,
    surfaceElevated: ut.surfaceElevated,
    surfaceMuted: ut.surfaceMuted,
    text: ut.text,
    textSecondary: ut.textSecondary,
    textMuted: ut.textMuted,
    border: ut.border,
    inputBg: ut.inputBg,
    inputBorder: ut.inputBorder,
    card: ut.card,
    cardBorder: ut.cardBorder,
    tabBar: ut.tabBar,
    tabBarBorder: ut.tabBarBorder,
    overlay: ut.overlay,
    headerText: ut.headerText,
    statusBar: ut.statusBar,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ColorMode>('system');
  const [userThemeId, setUserThemeId] = useState<string | null>(null);

  // Load persisted preferences on mount.
  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(USER_THEME_KEY),
    ]).then(([storedMode, storedTheme]) => {
      if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
        setModeState(storedMode);
      }
      if (storedTheme) {
        try {
          const parsed = JSON.parse(storedTheme) as { themeId?: string };
          if (parsed.themeId) setUserThemeId(parsed.themeId);
        } catch { /* ignore */ }
      }
    });
  }, []);

  // Listen for user theme changes from UserThemeProvider
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const stored = await AsyncStorage.getItem(USER_THEME_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as { themeId?: string };
          if (parsed.themeId && parsed.themeId !== userThemeId) {
            setUserThemeId(parsed.themeId);
          }
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, [userThemeId]);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_KEY, next);
  }, []);

  const resolvedMode: 'light' | 'dark' = useMemo(() => {
    if (mode === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      colors: mergeWithUserTheme(
        resolvedMode === 'dark' ? darkColors : lightColors,
        userThemeId,
      ),
      gradients,
      shadows: resolvedMode === 'dark' ? darkShadows : lightShadows,
      setMode,
    }),
    [mode, resolvedMode, userThemeId, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the resolved theme tokens for the current mode, personalized with user theme. */
export function useAppTheme() {
  return useContext(ThemeContext);
}

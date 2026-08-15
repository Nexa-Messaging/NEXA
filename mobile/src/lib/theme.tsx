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

const THEME_KEY = '@nexa_theme_mode';

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ColorMode>('system');

  // Load persisted preference on mount.
  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

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
      colors: resolvedMode === 'dark' ? darkColors : lightColors,
      gradients,
      shadows: resolvedMode === 'dark' ? darkShadows : lightShadows,
      setMode,
    }),
    [mode, resolvedMode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the resolved theme tokens for the current mode. */
export function useAppTheme() {
  return useContext(ThemeContext);
}

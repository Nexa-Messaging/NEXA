/**
 * NEXA theme tokens — light and dark palettes.
 *
 * Each mode defines the full set of semantic color tokens used across the app.
 * Gradients stay the same in both modes (they are the brand identity).
 * Shadows adapt to provide proper contrast on each background.
 */

export type ColorMode = 'light' | 'dark' | 'system';

// ---------------------------------------------------------------------------
// Graffiti accents — shared between light & dark (they ARE the brand).
// ---------------------------------------------------------------------------
export const graffiti = {
  grape: '#6D5CF5',
  grapeDeep: '#4A37D1',
  grapeSoft: '#EAE7FF',
  lilac: '#9B8CFF',
  lilacSoft: '#EFECFF',
  pink: '#FF5DA2',
  pinkSoft: '#FFE3F0',
  coral: '#FF8A5C',
  coralSoft: '#FFE9DF',
  peach: '#FFB199',
  sun: '#FFC53D',
  sunSoft: '#FFF3D6',
  mint: '#2ED9B3',
  mintSoft: '#D9F8F0',
  sky: '#38B8FF',
  skySoft: '#DFF2FF',
} as const;

// ---------------------------------------------------------------------------
// Light mode palette
// ---------------------------------------------------------------------------
export const lightColors = {
  primary: graffiti.grape,
  primaryDeep: graffiti.grapeDeep,
  primaryMuted: graffiti.lilac,
  primarySoft: graffiti.grapeSoft,
  background: '#F7F5FF',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F0FA',
  text: '#1D1A2F',
  textSecondary: '#6B6684',
  textMuted: '#9C96B0',
  border: '#E8E4F4',
  inputBg: '#F2F0FA',
  inputBorder: '#E8E4F4',
  danger: '#EF4A68',
  success: '#17B978',
  warning: '#F2A93B',
  overlay: 'rgba(29, 26, 47, 0.5)',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E8E4F4',
  card: '#FFFFFF',
  cardBorder: '#E8E4F4',
  modalBg: '#FFFFFF',
  sheetBg: '#FFFFFF',
  bubbleMine: graffiti.grape,
  bubbleTheirs: '#FFFFFF',
  headerText: '#FFFFFF',
  statusBar: 'dark' as const,
  ...graffiti,
} as const;

// ---------------------------------------------------------------------------
// Dark mode palette
// ---------------------------------------------------------------------------
export const darkColors = {
  primary: graffiti.lilac,
  primaryDeep: graffiti.grape,
  primaryMuted: graffiti.grape,
  primarySoft: 'rgba(109, 92, 245, 0.15)',
  background: '#0F0D1A',
  surface: '#1A1726',
  surfaceMuted: '#231F33',
  text: '#F0EEFF',
  textSecondary: '#A9A2C0',
  textMuted: '#6B6580',
  border: '#2D2844',
  inputBg: '#231F33',
  inputBorder: '#2D2844',
  danger: '#FF6B88',
  success: '#34D993',
  warning: '#FFD166',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#1A1726',
  tabBarBorder: '#2D2844',
  card: '#1A1726',
  cardBorder: '#2D2844',
  modalBg: '#1A1726',
  sheetBg: '#1A1726',
  bubbleMine: graffiti.grape,
  bubbleTheirs: '#231F33',
  headerText: '#FFFFFF',
  statusBar: 'light' as const,
  ...graffiti,
} as const;

export type AppColors = {
  [K in keyof typeof lightColors]: string;
};

// ---------------------------------------------------------------------------
// Gradients — identical in both modes (brand identity).
// ---------------------------------------------------------------------------
export const gradients = {
  brand: ['#6D5CF5', '#9B8CFF', '#FF5DA2'] as const,
  violet: ['#4A37D1', '#6D5CF5', '#9B8CFF'] as const,
  sunset: ['#FF8A5C', '#FF5DA2', '#9B8CFF'] as const,
  ocean: ['#38B8FF', '#6D5CF5', '#9B8CFF'] as const,
  meadow: ['#2ED9B3', '#38B8FF', '#6D5CF5'] as const,
  sunshine: ['#FFC53D', '#FF8A5C', '#FF5DA2'] as const,
  candy: ['#FF5DA2', '#FFB199', '#FFC53D'] as const,
  grape: ['#6D5CF5', '#4A37D1'] as const,
} as const;

// ---------------------------------------------------------------------------
// Shadows — adapted for each mode.
// ---------------------------------------------------------------------------
export const lightShadows = {
  soft: {
    shadowColor: '#1D1A2F',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  card: {
    shadowColor: graffiti.grape,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  pop: {
    shadowColor: '#1D1A2F',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;

export const darkShadows = {
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  pop: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 26,
  xxl: 34,
  blob: 44,
  pill: 999,
} as const;

export const typography = {
  display: 38 as const,
  title: 26 as const,
  heading: 19 as const,
  body: 16 as const,
  label: 14 as const,
  caption: 12 as const,
} as const;

export const tracking = {
  display: -0.8,
  title: -0.4,
  heading: -0.2,
  body: 0,
  label: 0.1,
  caption: 0.2,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '800' as const,
};

export const layout = {
  screenPadding: 20 as const,
  maxContentWidth: 520 as const,
} as const;

/**
 * NEXA theme tokens — light and dark palettes.
 *
 * Each mode defines the full set of semantic color tokens used across the app.
 * The brand personality is "warm graffiti": espresso-brown surfaces and warm
 * cream neutrals in dark mode, and warm latte-cream surfaces in light mode,
 * layered with the same vibrant graffiti accents.
 *
 * The soft accent variants (`*Soft`) are mode-aware: light pastels on light,
 * translucent tints on dark, so chips and icon bubbles never glare on either.
 */

export type ColorMode = 'light' | 'dark' | 'system';

// ---------------------------------------------------------------------------
// Graffiti accents — shared between light & dark (they ARE the brand).
// ---------------------------------------------------------------------------
export const graffiti = {
  grape: '#6D5CF5',
  grapeDeep: '#4A37D1',
  lilac: '#9B8CFF',
  pink: '#FF5DA2',
  coral: '#FF8A5C',
  peach: '#FFB199',
  sun: '#FFC53D',
  mint: '#2ED9B3',
  sky: '#38B8FF',
} as const;

// ---------------------------------------------------------------------------
// Light mode palette — warm latte cream.
// ---------------------------------------------------------------------------
export const lightColors = {
  primary: graffiti.grape,
  primaryDeep: graffiti.grapeDeep,
  primaryMuted: graffiti.lilac,
  primarySoft: '#ECE9FE',
  background: '#F7F0E8',
  backgroundSecondary: '#F0E5D8',
  surface: '#FFF9F3',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F0E5D8',
  text: '#211710',
  textSecondary: '#5B4A3A',
  textMuted: '#9B8875',
  border: '#E7D8C6',
  inputBg: '#F2E9DE',
  inputBorder: '#E3D3BE',
  danger: '#EF4A68',
  dangerSoft: '#FDEBEE',
  success: '#17B978',
  successSoft: '#E1F7EE',
  warning: '#F2A93B',
  warningSoft: '#FFF4DE',
  overlay: 'rgba(33, 23, 15, 0.5)',
  tabBar: '#FFF9F3',
  tabBarBorder: '#E7D8C6',
  card: '#FFFFFF',
  cardBorder: '#E7D8C6',
  modalBg: '#FFF9F3',
  sheetBg: '#FFF9F3',
  navigation: '#FFF9F3',
  navigationBorder: '#E7D8C6',
  bubbleMine: graffiti.grape,
  bubbleTheirs: '#FFFFFF',
  headerText: '#FFFFFF',
  statusBar: 'dark' as const,
  grape: graffiti.grape,
  grapeDeep: graffiti.grapeDeep,
  grapeSoft: '#ECE9FE',
  lilac: graffiti.lilac,
  lilacSoft: '#EFEDFF',
  pink: graffiti.pink,
  pinkSoft: '#FFE7F1',
  coral: graffiti.coral,
  coralSoft: '#FFE9DF',
  peach: graffiti.peach,
  peachSoft: '#FFF0E8',
  sun: graffiti.sun,
  sunSoft: '#FFF3D6',
  mint: graffiti.mint,
  mintSoft: '#DBF8F0',
  sky: graffiti.sky,
  skySoft: '#DFF2FF',
} as const;

// ---------------------------------------------------------------------------
// Dark mode palette — espresso coffee.
// ---------------------------------------------------------------------------
export const darkColors = {
  primary: graffiti.grape,
  primaryDeep: graffiti.grapeDeep,
  primaryMuted: graffiti.lilac,
  primarySoft: 'rgba(109, 92, 245, 0.20)',
  background: '#1B130E',
  backgroundSecondary: '#221812',
  surface: '#281C15',
  surfaceElevated: '#332417',
  surfaceMuted: '#221812',
  text: '#F5E7D2',
  textSecondary: '#C8AE90',
  textMuted: '#8D7461',
  border: '#45311F',
  inputBg: '#2A1E16',
  inputBorder: '#45311F',
  danger: '#FF6B88',
  dangerSoft: 'rgba(255, 107, 136, 0.16)',
  success: '#34D993',
  successSoft: 'rgba(52, 217, 147, 0.16)',
  warning: '#FFD166',
  warningSoft: 'rgba(255, 209, 102, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#241A13',
  tabBarBorder: '#45311F',
  card: '#281C15',
  cardBorder: '#45311F',
  modalBg: '#281C15',
  sheetBg: '#281C15',
  navigation: '#1B130E',
  navigationBorder: '#45311F',
  bubbleMine: graffiti.grape,
  bubbleTheirs: '#332417',
  headerText: '#FFFFFF',
  statusBar: 'light' as const,
  grape: graffiti.grape,
  grapeDeep: graffiti.grapeDeep,
  grapeSoft: 'rgba(109, 92, 245, 0.18)',
  lilac: graffiti.lilac,
  lilacSoft: 'rgba(155, 140, 255, 0.16)',
  pink: graffiti.pink,
  pinkSoft: 'rgba(255, 93, 166, 0.18)',
  coral: graffiti.coral,
  coralSoft: 'rgba(255, 138, 92, 0.16)',
  peach: graffiti.peach,
  peachSoft: 'rgba(255, 177, 153, 0.16)',
  sun: graffiti.sun,
  sunSoft: 'rgba(255, 197, 61, 0.18)',
  mint: graffiti.mint,
  mintSoft: 'rgba(46, 217, 179, 0.16)',
  sky: graffiti.sky,
  skySoft: 'rgba(56, 184, 255, 0.16)',
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
    shadowColor: '#211710',
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
    shadowColor: '#211710',
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

/**
 * NEXA design system — "soft graffiti".
 *
 * Vibrant but soft hues, layered surfaces, organic shapes and expressive
 * typography. All colors, gradients, shadows and sizes live here so screens
 * stay consistent, readable and easy to theme.
 */

/** Graffiti hue family. Warm pops of color layered over a calm violet brand. */
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

export const palette = {
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
  danger: '#EF4A68',
  success: '#17B978',
  warning: '#F2A93B',
  overlay: 'rgba(29, 26, 47, 0.5)',
  tabBar: '#FFFFFF',
  ...graffiti,
} as const;

export const colors = palette;

/** Signature NEXA gradients: `[from, to]` pairs for `LinearGradient`. */
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

/** Soft layered shadows. iOS uses shadow* props, Android uses elevation. */
export const shadows = {
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

/** Expressive but readable type scale with tight, friendly tracking. */
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

export const theme = {
  palette,
  colors,
  graffiti,
  gradients,
  shadows,
  spacing,
  radius,
  typography,
  tracking,
  fontWeights,
  layout,
} as const;

export type Theme = typeof theme;

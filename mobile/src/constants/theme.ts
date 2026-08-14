/**
 * Design tokens for NEXA. Centralize colors, spacing, typography, radius and
 * layout values here so screens stay consistent and theming is easy to change.
 */

export const palette = {
  primary: '#5B5FE9',
  primaryMuted: '#8E92F2',
  primarySoft: '#EEEDFF',
  background: '#F7F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F1F6',
  text: '#16161F',
  textSecondary: '#6B6B7B',
  textMuted: '#9B9BA9',
  border: '#E5E5EE',
  danger: '#E2594B',
  success: '#2FA36B',
  warning: '#D9A03E',
  overlay: 'rgba(22, 22, 31, 0.45)',
  tabBar: '#FFFFFF',
} as const;

export const colors = palette;

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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: 34 as const,
  title: 24 as const,
  heading: 18 as const,
  body: 16 as const,
  label: 14 as const,
  caption: 12 as const,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const layout = {
  screenPadding: 20 as const,
  maxContentWidth: 520 as const,
} as const;

export const theme = {
  palette,
  colors,
  spacing,
  radius,
  typography,
  fontWeights,
  layout,
} as const;

export type Theme = typeof theme;
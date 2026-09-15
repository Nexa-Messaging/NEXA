/**
 * NEXA personalization themes.
 *
 * Each theme defines colors for chat bubbles, backgrounds, hero gradients,
 * accent overlays, and profile accents. Themes are stored in Supabase
 * (user_preferences.theme_id) and resolved at runtime via useUserTheme().
 */

export type GraffitiStyle = 'default' | 'neon' | 'candy' | 'space' | 'ocean' | 'sunset' | 'cyber' | 'nature';
export type BubbleStyle = 'default' | 'rounded' | 'square';
export type StickerPack = 'default' | 'quirky' | 'cute' | 'cool';
export type BackgroundId = 'default' | 'stars' | 'waves' | 'grid';

export interface UserTheme {
  id: string;
  name: string;
  emoji: string;
  /** 3-color gradient for hero banners and buttons. */
  gradient: readonly [string, string, string];
  /** Main accent color (buttons, links, highlights). */
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  /** My chat bubble color. */
  bubbleMine: string;
  /** Their chat bubble color. */
  bubbleTheirs: string;
  /** Screen background. */
  background: string;
  /** Card / elevated surface. */
  surface: string;
  surfaceElevated: string;
  /** Secondary surface (muted backgrounds). */
  surfaceMuted: string;
  /** Primary text color. */
  text: string;
  /** Secondary text. */
  textSecondary: string;
  /** Muted text. */
  textMuted: string;
  /** Border color. */
  border: string;
  /** Input background. */
  inputBg: string;
  inputBorder: string;
  /** Card styling. */
  card: string;
  cardBorder: string;
  /** Tab bar. */
  tabBar: string;
  tabBarBorder: string;
  /** Overlay (modal backdrop). */
  overlay: string;
  /** Header text color. */
  headerText: string;
  /** Status bar style. */
  statusBar: 'light' | 'dark';
  /** Profile accent ring color. */
  profileAccent: string;
  /** Graffiti visual style. */
  graffitiStyle: GraffitiStyle;
  /** Bubble shape style. */
  bubbleStyle: BubbleStyle;
}

const defaultTheme: UserTheme = {
  id: 'default',
  name: 'Graffiti',
  emoji: '🎨',
  gradient: ['#6D5CF5', '#9B8CFF', '#FF5DA2'],
  primary: '#6D5CF5',
  primaryDeep: '#4A37D1',
  primarySoft: '#ECE9FE',
  bubbleMine: '#6D5CF5',
  bubbleTheirs: '#FFFFFF',
  background: '#F7F0E8',
  surface: '#FFF9F3',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F0E5D8',
  text: '#211710',
  textSecondary: '#5B4A3A',
  textMuted: '#9B8875',
  border: '#E7D8C6',
  inputBg: '#F2E9DE',
  inputBorder: '#E3D3BE',
  card: '#FFFFFF',
  cardBorder: '#E7D8C6',
  tabBar: '#FFF9F3',
  tabBarBorder: '#E7D8C6',
  overlay: 'rgba(33, 23, 15, 0.5)',
  headerText: '#FFFFFF',
  statusBar: 'dark',
  profileAccent: '#6D5CF5',
  graffitiStyle: 'default',
  bubbleStyle: 'default',
};

const neon: UserTheme = {
  ...defaultTheme,
  id: 'neon',
  name: 'Neon',
  emoji: '💜',
  gradient: ['#A855F7', '#6D28D9', '#1E1B4B'],
  primary: '#A855F7',
  primaryDeep: '#7C3AED',
  primarySoft: 'rgba(168, 85, 247, 0.18)',
  bubbleMine: '#A855F7',
  bubbleTheirs: '#1E1B4B',
  background: '#0F0A1A',
  surface: '#1A1030',
  surfaceElevated: '#251A40',
  surfaceMuted: '#15102A',
  text: '#F0E6FF',
  textSecondary: '#C4B5FD',
  textMuted: '#7C6FA0',
  border: '#3B2D6B',
  inputBg: '#1E1540',
  inputBorder: '#3B2D6B',
  card: '#1A1030',
  cardBorder: '#3B2D6B',
  tabBar: '#15102A',
  tabBarBorder: '#3B2D6B',
  overlay: 'rgba(0, 0, 0, 0.7)',
  headerText: '#F0E6FF',
  statusBar: 'light',
  profileAccent: '#A855F7',
  graffitiStyle: 'neon',
  bubbleStyle: 'rounded',
};

const candy: UserTheme = {
  ...defaultTheme,
  id: 'candy',
  name: 'Candy',
  emoji: '🍬',
  gradient: ['#F472B6', '#FB923C', '#FBBF24'],
  primary: '#F472B6',
  primaryDeep: '#EC4899',
  primarySoft: 'rgba(244, 114, 182, 0.18)',
  bubbleMine: '#F472B6',
  bubbleTheirs: '#FFF1F5',
  background: '#FFF5F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#FEE2E9',
  text: '#4A1942',
  textSecondary: '#9D3E8B',
  textMuted: '#C084B4',
  border: '#F9D0DE',
  inputBg: '#FFF0F4',
  inputBorder: '#F9D0DE',
  card: '#FFFFFF',
  cardBorder: '#F9D0DE',
  tabBar: '#FFFFFF',
  tabBarBorder: '#F9D0DE',
  overlay: 'rgba(74, 25, 66, 0.5)',
  headerText: '#FFFFFF',
  statusBar: 'dark',
  profileAccent: '#F472B6',
  graffitiStyle: 'candy',
  bubbleStyle: 'rounded',
};

const space: UserTheme = {
  ...defaultTheme,
  id: 'space',
  name: 'Space',
  emoji: '🌌',
  gradient: ['#312E81', '#4338CA', '#818CF8'],
  primary: '#818CF8',
  primaryDeep: '#6366F1',
  primarySoft: 'rgba(129, 140, 248, 0.20)',
  bubbleMine: '#6366F1',
  bubbleTheirs: '#1E1B4B',
  background: '#0C0A1D',
  surface: '#151230',
  surfaceElevated: '#1E1A42',
  surfaceMuted: '#110E28',
  text: '#E0E7FF',
  textSecondary: '#A5B4FC',
  textMuted: '#6B70A8',
  border: '#2E2A5E',
  inputBg: '#181438',
  inputBorder: '#2E2A5E',
  card: '#151230',
  cardBorder: '#2E2A5E',
  tabBar: '#110E28',
  tabBarBorder: '#2E2A5E',
  overlay: 'rgba(0, 0, 0, 0.7)',
  headerText: '#E0E7FF',
  statusBar: 'light',
  profileAccent: '#818CF8',
  graffitiStyle: 'space',
  bubbleStyle: 'rounded',
};

const ocean: UserTheme = {
  ...defaultTheme,
  id: 'ocean',
  name: 'Ocean',
  emoji: '🌊',
  gradient: ['#0EA5E9', '#2563EB', '#4F46E5'],
  primary: '#0EA5E9',
  primaryDeep: '#0284C7',
  primarySoft: 'rgba(14, 165, 233, 0.18)',
  bubbleMine: '#0EA5E9',
  bubbleTheirs: '#F0F9FF',
  background: '#F0F9FF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#E0F2FE',
  text: '#0C4A6E',
  textSecondary: '#0369A1',
  textMuted: '#7DD3FC',
  border: '#BAE6FD',
  inputBg: '#F0F9FF',
  inputBorder: '#BAE6FD',
  card: '#FFFFFF',
  cardBorder: '#BAE6FD',
  tabBar: '#FFFFFF',
  tabBarBorder: '#BAE6FD',
  overlay: 'rgba(12, 74, 110, 0.5)',
  headerText: '#FFFFFF',
  statusBar: 'dark',
  profileAccent: '#0EA5E9',
  graffitiStyle: 'ocean',
  bubbleStyle: 'default',
};

const sunset: UserTheme = {
  ...defaultTheme,
  id: 'sunset',
  name: 'Sunset',
  emoji: '🌅',
  gradient: ['#F97316', '#EF4444', '#EC4899'],
  primary: '#F97316',
  primaryDeep: '#EA580C',
  primarySoft: 'rgba(249, 115, 22, 0.18)',
  bubbleMine: '#F97316',
  bubbleTheirs: '#FFF7ED',
  background: '#FFF7ED',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#FFEDD5',
  text: '#431407',
  textSecondary: '#9A3412',
  textMuted: '#FDBA74',
  border: '#FED7AA',
  inputBg: '#FFF7ED',
  inputBorder: '#FED7AA',
  card: '#FFFFFF',
  cardBorder: '#FED7AA',
  tabBar: '#FFFFFF',
  tabBarBorder: '#FED7AA',
  overlay: 'rgba(67, 20, 7, 0.5)',
  headerText: '#FFFFFF',
  statusBar: 'dark',
  profileAccent: '#F97316',
  graffitiStyle: 'sunset',
  bubbleStyle: 'default',
};

const cyber: UserTheme = {
  ...defaultTheme,
  id: 'cyber',
  name: 'Cyber',
  emoji: '🤖',
  gradient: ['#22D3EE', '#06B6D4', '#0891B2'],
  primary: '#22D3EE',
  primaryDeep: '#06B6D4',
  primarySoft: 'rgba(34, 211, 238, 0.18)',
  bubbleMine: '#06B6D4',
  bubbleTheirs: '#083344',
  background: '#020617',
  surface: '#0B1120',
  surfaceElevated: '#111827',
  surfaceMuted: '#0A0F1C',
  text: '#E0F2FE',
  textSecondary: '#67E8F9',
  textMuted: '#475569',
  border: '#1E3A5F',
  inputBg: '#0D1525',
  inputBorder: '#1E3A5F',
  card: '#0B1120',
  cardBorder: '#1E3A5F',
  tabBar: '#0A0F1C',
  tabBarBorder: '#1E3A5F',
  overlay: 'rgba(0, 0, 0, 0.7)',
  headerText: '#E0F2FE',
  statusBar: 'light',
  profileAccent: '#22D3EE',
  graffitiStyle: 'cyber',
  bubbleStyle: 'square',
};

const nature: UserTheme = {
  ...defaultTheme,
  id: 'nature',
  name: 'Nature',
  emoji: '🌿',
  gradient: ['#16A34A', '#15803D', '#166534'],
  primary: '#16A34A',
  primaryDeep: '#15803D',
  primarySoft: 'rgba(22, 163, 74, 0.18)',
  bubbleMine: '#16A34A',
  bubbleTheirs: '#F0FDF4',
  background: '#F0FDF4',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#DCFCE7',
  text: '#052E16',
  textSecondary: '#166534',
  textMuted: '#86EFAC',
  border: '#BBF7D0',
  inputBg: '#F0FDF4',
  inputBorder: '#BBF7D0',
  card: '#FFFFFF',
  cardBorder: '#BBF7D0',
  tabBar: '#FFFFFF',
  tabBarBorder: '#BBF7D0',
  overlay: 'rgba(5, 46, 22, 0.5)',
  headerText: '#FFFFFF',
  statusBar: 'dark',
  profileAccent: '#16A34A',
  graffitiStyle: 'nature',
  bubbleStyle: 'rounded',
};

/** All available personalization themes. */
export const USER_THEMES: readonly UserTheme[] = [
  defaultTheme,
  neon,
  candy,
  space,
  ocean,
  sunset,
  cyber,
  nature,
] as const;

/** Default theme applied when user has not chosen one. */
export const DEFAULT_THEME_ID = 'default';

/** Resolve a theme by ID, falling back to default. */
export function resolveTheme(themeId: string | null | undefined): UserTheme {
  if (!themeId) return defaultTheme;
  return USER_THEMES.find((t) => t.id === themeId) ?? defaultTheme;
}

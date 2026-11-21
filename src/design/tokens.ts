import { ACCENT_PALETTE_MAP, NEUTRAL_THEME_TOKENS } from './palettes';

/**
 * ZELORA STUDYS Central Design System Tokens.
 * Visual Direction: Luxury Academic Editorial — Deep Graphite + Champagne Gold (default Dark)
 * and Warm Ivory + Deep Charcoal (Light), paired with 10 selectable accent palettes.
 */

export const LIGHT_PALETTE = {
  bgCanvas: NEUTRAL_THEME_TOKENS.light.background,
  bgSurface: NEUTRAL_THEME_TOKENS.light.surface,
  bgSecondary: NEUTRAL_THEME_TOKENS.light.surfaceSecondary,
  bgElevated: NEUTRAL_THEME_TOKENS.light.surfaceElevated,
  borderSubtle: NEUTRAL_THEME_TOKENS.light.border,

  charcoalPrimary: '#202329',
  charcoalDeep: '#17191D',
  charcoalSecondary: NEUTRAL_THEME_TOKENS.light.textSecondary,
  textPrimary: NEUTRAL_THEME_TOKENS.light.textPrimary,
  textMuted: NEUTRAL_THEME_TOKENS.light.textMuted,

  accentPrimary: ACCENT_PALETTE_MAP.gold.light.accent,
  accentHover: ACCENT_PALETTE_MAP.gold.light.accentHover,
  accentAccessibleText: ACCENT_PALETTE_MAP.gold.light.accentText,
  accentSoft: ACCENT_PALETTE_MAP.gold.light.accentSoft,
  accentBorder: ACCENT_PALETTE_MAP.gold.light.accentBorder,

  success: NEUTRAL_THEME_TOKENS.light.success,
  warning: NEUTRAL_THEME_TOKENS.light.warning,
  error: NEUTRAL_THEME_TOKENS.light.error,
  info: NEUTRAL_THEME_TOKENS.light.info,
} as const;

export const DARK_PALETTE = {
  bgCanvas: NEUTRAL_THEME_TOKENS.dark.background,
  bgSurface: NEUTRAL_THEME_TOKENS.dark.surface,
  bgSecondary: NEUTRAL_THEME_TOKENS.dark.surfaceSecondary,
  bgElevated: NEUTRAL_THEME_TOKENS.dark.surfaceElevated,
  textPrimary: NEUTRAL_THEME_TOKENS.dark.textPrimary,
  textSecondary: NEUTRAL_THEME_TOKENS.dark.textSecondary,
  textMuted: NEUTRAL_THEME_TOKENS.dark.textMuted,
  accentPrimary: ACCENT_PALETTE_MAP.gold.dark.accent,
  accentHover: ACCENT_PALETTE_MAP.gold.dark.accentHover,
  accentSoft: ACCENT_PALETTE_MAP.gold.dark.accentSoft,
  border: NEUTRAL_THEME_TOKENS.dark.border,

  success: NEUTRAL_THEME_TOKENS.dark.success,
  warning: NEUTRAL_THEME_TOKENS.dark.warning,
  error: NEUTRAL_THEME_TOKENS.dark.error,
  info: NEUTRAL_THEME_TOKENS.dark.info,
} as const;

export const SURFACE_TOKENS = {
  light: {
    canvas: LIGHT_PALETTE.bgCanvas,
    surface: LIGHT_PALETTE.bgSurface,
    secondary: LIGHT_PALETTE.bgSecondary,
    elevated: LIGHT_PALETTE.bgSurface,
    border: LIGHT_PALETTE.borderSubtle,
  },
  dark: {
    canvas: DARK_PALETTE.bgCanvas,
    surface: DARK_PALETTE.bgSurface,
    secondary: DARK_PALETTE.bgSecondary,
    elevated: DARK_PALETTE.bgElevated,
    border: DARK_PALETTE.border,
  },
} as const;

export const TYPOGRAPHY_SCALE = {
  display: 'Plus Jakarta Sans',
  sans: 'DM Sans',
  mono: 'JetBrains Mono',
  pageTitle: 'text-2xl sm:text-[30px] font-semibold tracking-tight leading-tight',
  sectionTitle: 'text-[15px] sm:text-[17px] font-semibold tracking-tight leading-snug',
  body: 'text-sm leading-relaxed',
  caption: 'text-xs leading-snug',
} as const;

export const CONTROL_HEIGHTS = {
  sm: 40,
  md: 44,
  lg: 48,
} as const;

export const RADIUS_SCALE = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  pill: 'rounded-full',
} as const;

export const SHADOW_SCALE = {
  subtle: 'shadow-[0_1px_2px_rgba(23,25,29,0.04)] dark:shadow-none',
  card: 'shadow-[0_1px_3px_rgba(23,25,29,0.05)] dark:shadow-none',
  charcoal: 'shadow-[0_4px_14px_rgba(23,25,29,0.10)] dark:shadow-none',
  dialog: 'shadow-xl',
} as const;

export const Z_INDEX = {
  stickyHeader: 30,
  drawerBackdrop: 40,
  drawer: 50,
  modal: 50,
} as const;

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const ICON_SIZES = {
  sm: 16,
  md: 20,
  nav: 22,
  feature: 28,
} as const;

export const ICON_STROKE_WIDTH = 1.75;

export const MOTION_PRESETS = {
  ease: [0.16, 1, 0.3, 1] as const,
  microDuration: 0.15,
  dialogDuration: 0.2,
  pageDuration: 0.22,
} as const;

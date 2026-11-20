/**
 * Scholars Academy Central Design System Tokens.
 * Visual Direction: Premium fintech-inspired minimalism (60/30/10 Mint, Charcoal & Crisp White)
 * adapted specifically for an education management ecosystem.
 */

export const LIGHT_PALETTE = {
  // 60% Primary Neutral Surfaces
  bgCanvas: '#F7F9F8',
  bgSurface: '#FFFFFF',
  bgSecondary: '#F0F4F2',
  borderSubtle: '#E2E8E5',

  // 30% Charcoal Structural Contrast
  charcoalPrimary: '#20262B',
  charcoalDeep: '#171D21',
  charcoalSecondary: '#343C42',
  textMuted: '#68737C',

  // 10% Mint Accent
  mintPrimary: '#35D6A0',
  mintDeep: '#18B985',
  mintAccessibleText: '#168A63',
  mintSoft: '#DDF8EE',
  mintBorder: '#B8EBD8',

  // Supporting Semantic States
  success: '#168A63',
  warning: '#D69B35',
  error: '#D64C55',
  info: '#4285A5',
} as const;

export const DARK_PALETTE = {
  bgCanvas: '#151A1E',
  bgSurface: '#1D2429',
  bgSecondary: '#252E33',
  bgElevated: '#2B353A',
  textPrimary: '#F4F7F6',
  textSecondary: '#AAB6B4',
  mintPrimary: '#42DDA9',
  mintSoft: '#244B3E',
  border: '#344047',

  // Supporting Semantic States
  success: '#42DDA9',
  warning: '#E5B04D',
  error: '#EF6D75',
  info: '#62A7C7',
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
  subtle: 'shadow-[0_1px_2px_rgba(23,29,33,0.03)] dark:shadow-none',
  card: 'shadow-[0_1px_3px_rgba(23,29,33,0.04)] dark:shadow-none',
  charcoal: 'shadow-[0_2px_8px_rgba(23,29,33,0.08)] dark:shadow-none',
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

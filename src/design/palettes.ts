export type ThemeMode = 'dark' | 'light';

export type AccentPaletteId =
  | 'slate_grey'
  | 'indigo'
  | 'gold'
  | 'teal'
  | 'crimson_red'
  | 'sunset_orange'
  | 'ocean_blue'
  | 'royal_purple'
  | 'rose_pink'
  | 'emerald';

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
export const DEFAULT_ACCENT_PALETTE: AccentPaletteId = 'gold';

export interface AccentModeTokens {
  accent: string;
  accentHover: string;
  accentText: string;
  accentSoft: string;
  accentBorder: string;
  accentContrast: string;
  accentTint: string;
  focusRing: string;
}

export interface AccentPaletteDefinition {
  id: AccentPaletteId;
  name: string;
  description: string;
  swatches: readonly [string, string, string];
  dark: AccentModeTokens;
  light: AccentModeTokens;
}

export const ACCENT_PALETTES: readonly AccentPaletteDefinition[] = [
  {
    id: 'gold',
    name: 'Gold',
    description: 'Champagne & warm amber gold (Default)',
    swatches: ['#C5A46D', '#DCC49A', '#A7864F'],
    dark: {
      accent: '#C5A46D',
      accentHover: '#DCC49A',
      accentText: '#DCC49A',
      accentSoft: '#30291D',
      accentBorder: '#57482E',
      accentContrast: '#17191D',
      accentTint: 'rgba(197, 164, 109, 0.16)',
      focusRing: 'rgba(197, 164, 109, 0.42)',
    },
    light: {
      accent: '#8E6720',
      accentHover: '#755417',
      accentText: '#755417',
      accentSoft: '#F6EFE1',
      accentBorder: '#DFCCA7',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(142, 103, 32, 0.14)',
      focusRing: 'rgba(142, 103, 32, 0.36)',
    },
  },
  {
    id: 'slate_grey',
    name: 'Slate Grey',
    description: 'Architectural pewter & cool silver',
    swatches: ['#75889B', '#A4B1BE', '#C1CCD5'],
    dark: {
      accent: '#A4B1BE',
      accentHover: '#C1CCD5',
      accentText: '#C1CCD5',
      accentSoft: '#202831',
      accentBorder: '#43515F',
      accentContrast: '#17191D',
      accentTint: 'rgba(164, 177, 190, 0.16)',
      focusRing: 'rgba(164, 177, 190, 0.4)',
    },
    light: {
      accent: '#4F6174',
      accentHover: '#3E4E5E',
      accentText: '#46586A',
      accentSoft: '#EAEEF3',
      accentBorder: '#C7D0DA',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(79, 97, 116, 0.14)',
      focusRing: 'rgba(79, 97, 116, 0.36)',
    },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Deep academic indigo & soft periwinkle',
    swatches: ['#5369D9', '#7888EB', '#9CAAFB'],
    dark: {
      accent: '#7888EB',
      accentHover: '#9CAAFB',
      accentText: '#9CAAFB',
      accentSoft: '#1D2340',
      accentBorder: '#3C467A',
      accentContrast: '#17191D',
      accentTint: 'rgba(120, 136, 235, 0.18)',
      focusRing: 'rgba(120, 136, 235, 0.42)',
    },
    light: {
      accent: '#485CC8',
      accentHover: '#3A4BB0',
      accentText: '#3F52B8',
      accentSoft: '#ECEFFE',
      accentBorder: '#C5CEFA',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(72, 92, 200, 0.14)',
      focusRing: 'rgba(72, 92, 200, 0.36)',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    description: 'Crisp verdigris & refined lagoon teal',
    swatches: ['#159C9C', '#45BDB7', '#72D6D0'],
    dark: {
      accent: '#45BDB7',
      accentHover: '#72D6D0',
      accentText: '#72D6D0',
      accentSoft: '#163034',
      accentBorder: '#2C5C62',
      accentContrast: '#17191D',
      accentTint: 'rgba(69, 189, 183, 0.17)',
      focusRing: 'rgba(69, 189, 183, 0.4)',
    },
    light: {
      accent: '#0E7D7D',
      accentHover: '#0A6464',
      accentText: '#0C6F6F',
      accentSoft: '#E2F5F4',
      accentBorder: '#B1DFDC',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(14, 125, 125, 0.14)',
      focusRing: 'rgba(14, 125, 125, 0.36)',
    },
  },
  {
    id: 'crimson_red',
    name: 'Crimson Red',
    description: 'Scholarly garnet & refined rose coral',
    swatches: ['#C74359', '#DE687A', '#F18A98'],
    dark: {
      accent: '#DE687A',
      accentHover: '#F18A98',
      accentText: '#F18A98',
      accentSoft: '#351C25',
      accentBorder: '#693345',
      accentContrast: '#17191D',
      accentTint: 'rgba(222, 104, 122, 0.18)',
      focusRing: 'rgba(222, 104, 122, 0.42)',
    },
    light: {
      accent: '#B5354B',
      accentHover: '#96293C',
      accentText: '#A32D42',
      accentSoft: '#FCEBEE',
      accentBorder: '#EEC2CA',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(181, 53, 75, 0.14)',
      focusRing: 'rgba(181, 53, 75, 0.36)',
    },
  },
  {
    id: 'sunset_orange',
    name: 'Sunset Orange',
    description: 'Burnished terracotta & warm apricot',
    swatches: ['#D77B37', '#E79A58', '#F3B46E'],
    dark: {
      accent: '#E79A58',
      accentHover: '#F3B46E',
      accentText: '#F3B46E',
      accentSoft: '#35251D',
      accentBorder: '#694735',
      accentContrast: '#17191D',
      accentTint: 'rgba(231, 154, 88, 0.18)',
      focusRing: 'rgba(231, 154, 88, 0.42)',
    },
    light: {
      accent: '#AC5617',
      accentHover: '#8F4610',
      accentText: '#9B4D14',
      accentSoft: '#FDF0E4',
      accentBorder: '#ECCBAE',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(172, 86, 23, 0.14)',
      focusRing: 'rgba(172, 86, 23, 0.36)',
    },
  },
  {
    id: 'ocean_blue',
    name: 'Ocean Blue',
    description: 'Cobalt sapphire & clear sky azure',
    swatches: ['#3478D4', '#5798E5', '#72B7F2'],
    dark: {
      accent: '#5798E5',
      accentHover: '#72B7F2',
      accentText: '#72B7F2',
      accentSoft: '#14243B',
      accentBorder: '#2C4D7B',
      accentContrast: '#17191D',
      accentTint: 'rgba(87, 152, 229, 0.18)',
      focusRing: 'rgba(87, 152, 229, 0.42)',
    },
    light: {
      accent: '#2864B8',
      accentHover: '#1F5199',
      accentText: '#2359A6',
      accentSoft: '#E9F1FC',
      accentBorder: '#BCD3F4',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(40, 100, 184, 0.14)',
      focusRing: 'rgba(40, 100, 184, 0.36)',
    },
  },
  {
    id: 'royal_purple',
    name: 'Royal Purple',
    description: 'Regal amethyst & soft lavender',
    swatches: ['#805AD5', '#A080E5', '#B9A0F5'],
    dark: {
      accent: '#A080E5',
      accentHover: '#B9A0F5',
      accentText: '#B9A0F5',
      accentSoft: '#211A38',
      accentBorder: '#473875',
      accentContrast: '#17191D',
      accentTint: 'rgba(160, 128, 229, 0.18)',
      focusRing: 'rgba(160, 128, 229, 0.42)',
    },
    light: {
      accent: '#6E46C4',
      accentHover: '#5935A8',
      accentText: '#623CB3',
      accentSoft: '#F1ECFC',
      accentBorder: '#D2C3F4',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(110, 70, 196, 0.14)',
      focusRing: 'rgba(110, 70, 196, 0.36)',
    },
  },
  {
    id: 'rose_pink',
    name: 'Rose Pink',
    description: 'Muted velvet rose & blush quartz',
    swatches: ['#D65B91', '#E580AA', '#F2A8C8'],
    dark: {
      accent: '#E580AA',
      accentHover: '#F2A8C8',
      accentText: '#F2A8C8',
      accentSoft: '#351E2B',
      accentBorder: '#693954',
      accentContrast: '#17191D',
      accentTint: 'rgba(229, 128, 170, 0.18)',
      focusRing: 'rgba(229, 128, 170, 0.42)',
    },
    light: {
      accent: '#AF396D',
      accentHover: '#922C59',
      accentText: '#9E3161',
      accentSoft: '#FCEBF3',
      accentBorder: '#EDC1D6',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(175, 57, 109, 0.14)',
      focusRing: 'rgba(175, 57, 109, 0.36)',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Botanical jade & classic academic emerald',
    swatches: ['#159B72', '#3CB88F', '#6BD7AD'],
    dark: {
      accent: '#3CB88F',
      accentHover: '#6BD7AD',
      accentText: '#6BD7AD',
      accentSoft: '#142D28',
      accentBorder: '#285A4F',
      accentContrast: '#17191D',
      accentTint: 'rgba(60, 184, 143, 0.17)',
      focusRing: 'rgba(60, 184, 143, 0.42)',
    },
    light: {
      accent: '#0E7B5A',
      accentHover: '#0A6247',
      accentText: '#0C6D50',
      accentSoft: '#E3F6EF',
      accentBorder: '#B1E2D1',
      accentContrast: '#FFFFFF',
      accentTint: 'rgba(14, 123, 90, 0.14)',
      focusRing: 'rgba(14, 123, 90, 0.36)',
    },
  },
] as const;

export const ACCENT_PALETTE_MAP: Record<AccentPaletteId, AccentPaletteDefinition> =
  ACCENT_PALETTES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<AccentPaletteId, AccentPaletteDefinition>
  );

export function isValidAccentPaletteId(value: unknown): value is AccentPaletteId {
  return typeof value === 'string' && value in ACCENT_PALETTE_MAP;
}

export function normalizeAccentPaletteId(value: unknown): AccentPaletteId {
  return isValidAccentPaletteId(value) ? value : DEFAULT_ACCENT_PALETTE;
}

export const NEUTRAL_THEME_TOKENS = {
  dark: {
    background: '#17191D',
    surface: '#202329',
    surfaceSecondary: '#282C33',
    surfaceElevated: '#30353D',
    textPrimary: '#F5F3EF',
    textSecondary: '#B7B3AA',
    textMuted: '#898A8B',
    border: '#393D43',
    heroSurface: '#202329',
    heroSecondary: '#282C33',
    heroBorder: '#393D43',
    heroText: '#F5F3EF',
    heroMuted: '#B7B3AA',
    success: '#3CB88F',
    successSoft: '#142D28',
    successBorder: '#285A4F',
    warning: '#DCC49A',
    warningSoft: '#30291D',
    warningBorder: '#57482E',
    error: '#F18A98',
    errorSoft: '#351C25',
    errorBorder: '#693345',
    info: '#72B7F2',
    infoSoft: '#14243B',
    infoBorder: '#2C4D7B',
  },
  light: {
    background: '#F8F5EF',
    surface: '#FFFFFF',
    surfaceSecondary: '#F0ECE4',
    surfaceElevated: '#FFFFFF',
    textPrimary: '#272522',
    textSecondary: '#6E6A62',
    textMuted: '#787268',
    border: '#E6E0D5',
    heroSurface: '#202329',
    heroSecondary: '#282C33',
    heroBorder: '#393D43',
    heroText: '#F5F3EF',
    heroMuted: '#B7B3AA',
    success: '#0E7B5A',
    successSoft: '#E3F6EF',
    successBorder: '#B1E2D1',
    warning: '#8E6720',
    warningSoft: '#F6EFE1',
    warningBorder: '#DFCCA7',
    error: '#B5354B',
    errorSoft: '#FCEBEE',
    errorBorder: '#EEC2CA',
    info: '#2864B8',
    infoSoft: '#E9F1FC',
    infoBorder: '#BCD3F4',
  },
} as const;

export function buildThemeCssVariables(
  mode: ThemeMode,
  paletteId: AccentPaletteId
): Record<string, string> {
  const neutral = NEUTRAL_THEME_TOKENS[mode];
  const palette = ACCENT_PALETTE_MAP[normalizeAccentPaletteId(paletteId)][mode];

  return {
    '--background': neutral.background,
    '--surface': neutral.surface,
    '--surface-secondary': neutral.surfaceSecondary,
    '--surface-elevated': neutral.surfaceElevated,
    '--text-primary': neutral.textPrimary,
    '--text-secondary': neutral.textSecondary,
    '--text-muted': neutral.textMuted,
    '--border': neutral.border,
    '--hero-surface': neutral.heroSurface,
    '--hero-secondary': neutral.heroSecondary,
    '--hero-border': neutral.heroBorder,
    '--hero-text': neutral.heroText,
    '--hero-muted': neutral.heroMuted,
    '--hero-accent': ACCENT_PALETTE_MAP[normalizeAccentPaletteId(paletteId)].dark.accentText,
    '--accent': palette.accent,
    '--accent-hover': palette.accentHover,
    '--accent-text': palette.accentText,
    '--accent-soft': palette.accentSoft,
    '--accent-border': palette.accentBorder,
    '--accent-contrast': palette.accentContrast,
    '--accent-tint': palette.accentTint,
    '--focus-ring': palette.focusRing,
    '--success': neutral.success,
    '--success-soft': neutral.successSoft,
    '--success-border': neutral.successBorder,
    '--warning': neutral.warning,
    '--warning-soft': neutral.warningSoft,
    '--warning-border': neutral.warningBorder,
    '--error': neutral.error,
    '--error-soft': neutral.errorSoft,
    '--error-border': neutral.errorBorder,
    '--info': neutral.info,
    '--info-soft': neutral.infoSoft,
    '--info-border': neutral.infoBorder,
  };
}

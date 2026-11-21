import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCENT_PALETTES,
  ACCENT_PALETTE_MAP,
  DEFAULT_ACCENT_PALETTE,
  DEFAULT_THEME_MODE,
  NEUTRAL_THEME_TOKENS,
  buildThemeCssVariables,
  isValidAccentPaletteId,
  normalizeAccentPaletteId,
  type AccentPaletteId,
} from '../src/design/palettes';
import { DEFAULT_BRANDING_CONFIG } from '../src/config/branding';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalAttendanceStore } from '../src/services/local/localAttendanceStore';
import { LocalFinanceStore } from '../src/services/local/localFinanceStore';
import { LocalSettingsStore } from '../src/services/local/localSettingsStore';
import { LocalDevApplicationSettingsService } from '../src/services/local/localSettingsService';

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function runThemeVerification() {
  // 1. Default Theme & Palette Check
  assert.equal(DEFAULT_THEME_MODE, 'dark', 'Default appearance mode must be dark');
  assert.equal(DEFAULT_ACCENT_PALETTE, 'gold', 'Default accent palette must be gold');
  assert.equal(DEFAULT_BRANDING_CONFIG.defaultTheme, 'dark');
  assert.equal(DEFAULT_BRANDING_CONFIG.defaultAccentPalette, 'gold');
  assert.equal(DEFAULT_BRANDING_CONFIG.centreName, 'ZELORA STUDYS');

  // 2. Exact 10 Required Palettes Check
  const expectedIds: AccentPaletteId[] = [
    'slate_grey',
    'indigo',
    'gold',
    'teal',
    'crimson_red',
    'sunset_orange',
    'ocean_blue',
    'royal_purple',
    'rose_pink',
    'emerald',
  ];
  assert.equal(ACCENT_PALETTES.length, 10, 'Must expose exactly 10 accent palettes');
  for (const id of expectedIds) {
    assert.ok(isValidAccentPaletteId(id), `Palette ID ${id} must be valid`);
    assert.ok(ACCENT_PALETTE_MAP[id], `Palette ${id} must exist in ACCENT_PALETTE_MAP`);
  }
  assert.equal(normalizeAccentPaletteId('unknown_palette'), 'gold');

  // 3. WCAG AA Contrast Math Across Both Neutral Themes & All 10 Accent Palettes
  for (const mode of ['dark', 'light'] as const) {
    const neutral = NEUTRAL_THEME_TOKENS[mode];
    const primaryBgContrast = contrastRatio(neutral.textPrimary, neutral.background);
    const primarySurfaceContrast = contrastRatio(neutral.textPrimary, neutral.surface);
    const secondarySurfaceContrast = contrastRatio(neutral.textSecondary, neutral.surface);

    assert.ok(
      primaryBgContrast >= 10,
      `${mode} primary text on background ratio (${primaryBgContrast.toFixed(2)}) must be >= 10`
    );
    assert.ok(
      primarySurfaceContrast >= 10,
      `${mode} primary text on surface ratio (${primarySurfaceContrast.toFixed(2)}) must be >= 10`
    );
    assert.ok(
      secondarySurfaceContrast >= 4.5,
      `${mode} secondary text on surface ratio (${secondarySurfaceContrast.toFixed(2)}) must be >= 4.5`
    );

    for (const palette of ACCENT_PALETTES) {
      const tokens = palette[mode];
      const buttonContrast = contrastRatio(tokens.accentContrast, tokens.accent);
      const textOnSurfaceContrast = contrastRatio(tokens.accentText, neutral.surface);
      const textOnSoftContrast = contrastRatio(tokens.accentText, tokens.accentSoft);
      const heroAccentContrast = contrastRatio(palette.dark.accentText, neutral.heroSurface);

      assert.ok(
        buttonContrast >= 4.5,
        `${mode} ${palette.id} accent button text contrast (${buttonContrast.toFixed(2)}) must be >= 4.5`
      );
      assert.ok(
        textOnSurfaceContrast >= 4.5,
        `${mode} ${palette.id} accentText on surface contrast (${textOnSurfaceContrast.toFixed(2)}) must be >= 4.5`
      );
      assert.ok(
        textOnSoftContrast >= 4.5,
        `${mode} ${palette.id} accentText on accentSoft contrast (${textOnSoftContrast.toFixed(2)}) must be >= 4.5`
      );
      assert.ok(
        heroAccentContrast >= 4.5,
        `${mode} ${palette.id} hero accent contrast (${heroAccentContrast.toFixed(2)}) must be >= 4.5`
      );

      const cssVars = buildThemeCssVariables(mode, palette.id);
      assert.equal(cssVars['--accent'], tokens.accent);
      assert.equal(cssVars['--background'], neutral.background);
      assert.equal(cssVars['--hero-accent'], palette.dark.accentText);
    }
  }

  // 4. Settings Service Appearance Policy Persistence (mode + defaultAccentPalette)
  const accountStore = new LocalAccountStore({ allowFixturesInTest: true, skipPersistence: true });
  const academicStore = new LocalAcademicStore({
    accountStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const attendanceStore = new LocalAttendanceStore({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const financeStore = new LocalFinanceStore({
    academicStore,
    attendanceStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const settingsStore = new LocalSettingsStore({ skipPersistence: true });
  const settingsService = new LocalDevApplicationSettingsService({
    settingsStore,
    accountStore,
    academicStore,
    financeStore,
  });
  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const initialPublic = await settingsService.getPublicBrandingAndSettings();
  assert.equal(initialPublic.appearanceDefaults.defaultTheme, 'dark');
  assert.equal(initialPublic.appearanceDefaults.defaultAccentPalette, 'gold');

  const updated = await settingsService.updateAppearanceDefaults(adminActor, {
    defaultTheme: 'light',
    defaultAccentPalette: 'indigo',
    allowPersonalThemePreference: true,
  });
  assert.equal(updated.appearanceDefaults.defaultTheme, 'light');
  assert.equal(updated.appearanceDefaults.defaultAccentPalette, 'indigo');

  const audit = await settingsService.listSettingsAuditHistory(adminActor);
  assert.ok(audit.some((a) => a.newValues.includes('palette=indigo')));

  // 5. Source & Regression Boundary Checks
  const rootDir = process.cwd();
  const read = (rel: string) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

  const themeContextSrc = read('src/context/ThemeContext.tsx');
  assert.ok(themeContextSrc.includes('setPreviewTheme'));
  assert.ok(themeContextSrc.includes('setPreviewAccentPalette'));
  assert.ok(themeContextSrc.includes('applyThemeSelection'));
  assert.ok(themeContextSrc.includes('cancelThemePreview'));
  assert.ok(themeContextSrc.includes('resetToDefaultTheme'));
  assert.ok(themeContextSrc.includes("zelora_theme_user_"));

  const adminSettingsSrc = read('src/components/settings/AdminSettingsModule.tsx');
  const memberSettingsSrc = read('src/components/settings/MemberSettingsModule.tsx');
  assert.ok(adminSettingsSrc.includes('ThemeCustomizationPanel'));
  assert.ok(memberSettingsSrc.includes('ThemeCustomizationPanel'));
  assert.ok(memberSettingsSrc.includes('changeMyPassword'));

  const indexHtml = read('index.html');
  assert.ok(indexHtml.includes('data-palette'));
  assert.ok(indexHtml.includes("'gold'"));
  assert.ok(indexHtml.includes('ZELORA STUDYS'));

  const portalLogin = read('src/pages/auth/PortalLoginPage.tsx');
  assert.ok(portalLogin.includes('Student / Teacher ID'));
  assert.ok(!portalLogin.includes('Admin Portal'));
  assert.ok(!portalLogin.includes('/admin-login'));

  // Confirm no leftover "Workspace Modules" or "Scholars Academy" in src/
  function scanSrc(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanSrc(full);
      else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf8');
        assert.ok(
          !/Workspace Modules/i.test(content),
          `${full} must not contain Workspace Modules`
        );
        const isBrandMigrationHelper =
          full.endsWith('localSettingsStore.ts') || full.endsWith('firebaseSettingsService.ts');
        if (!isBrandMigrationHelper) {
          assert.ok(
            !/Scholars Academy/i.test(content),
            `${full} must not contain Scholars Academy`
          );
        }
      }
    }
  }
  scanSrc(path.join(rootDir, 'src'));

  console.log('THEME CUSTOMIZATION & DESIGN SYSTEM VERIFICATION PASSED!');
}

runThemeVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});

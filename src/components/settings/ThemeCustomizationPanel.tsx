import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Eye, Moon, RotateCcw, Sparkles, Sun, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import {
  ACCENT_PALETTE_MAP,
  ACCENT_PALETTES,
  buildThemeCssVariables,
  type AccentPaletteId,
  type ThemeMode,
} from '../../design/palettes';
import { cn } from '../../utils/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatusText } from '../ui/StatusText';

interface ThemeCustomizationPanelProps {
  centreName?: string;
}

/**
 * Shared Theme & Accent Palette Customization panel for Admin, Teacher, and Student Settings.
 * Supports Light/Dark appearance + 10 WCAG-calibrated palettes with real-time app preview,
 * Apply Theme, Cancel Preview, and Reset to Default controls.
 */
export function ThemeCustomizationPanel({
  centreName = 'ZELORA STUDYS',
}: ThemeCustomizationPanelProps) {
  const {
    savedTheme,
    savedAccentPalette,
    defaultTheme,
    defaultAccentPalette,
    allowPersonalThemePreference,
    hasPersonalPreference,
    isPreviewingTheme,
    setPreviewTheme,
    setPreviewAccentPalette,
    applyThemeSelection,
    cancelThemePreview,
    resetToDefaultTheme,
  } = useTheme();

  const [draftMode, setDraftMode] = useState<ThemeMode>(savedTheme);
  const [draftPalette, setDraftPalette] = useState<AccentPaletteId>(savedAccentPalette);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isPreviewingTheme) {
      setDraftMode(savedTheme);
      setDraftPalette(savedAccentPalette);
    }
  }, [savedTheme, savedAccentPalette, isPreviewingTheme]);

  // Discard unapplied preview changes cleanly when navigating away from Settings
  useEffect(() => {
    return () => {
      cancelThemePreview();
    };
  }, [cancelThemePreview]);

  const hasUnappliedChanges =
    draftMode !== savedTheme || draftPalette !== savedAccentPalette || isPreviewingTheme;

  const isFollowingDefault =
    draftMode === defaultTheme &&
    draftPalette === defaultAccentPalette &&
    !hasPersonalPreference &&
    !hasUnappliedChanges;

  const activePaletteDef = ACCENT_PALETTE_MAP[draftPalette];
  const previewCssVars = buildThemeCssVariables(draftMode, draftPalette) as CSSProperties;

  const handleSelectMode = (mode: ThemeMode) => {
    if (!allowPersonalThemePreference) return;
    setDraftMode(mode);
    setPreviewTheme(mode);
    setFeedback(null);
  };

  const handleSelectPalette = (paletteId: AccentPaletteId) => {
    if (!allowPersonalThemePreference) return;
    setDraftPalette(paletteId);
    setPreviewAccentPalette(paletteId);
    setFeedback(null);
  };

  const handleApplyTheme = () => {
    if (!allowPersonalThemePreference) return;
    applyThemeSelection(draftMode, draftPalette);
    setFeedback(
      `Applied ${draftMode === 'dark' ? 'Dark Mode' : 'Light Mode'} with ${activePaletteDef.name} palette.`
    );
  };

  const handleCancelPreview = () => {
    cancelThemePreview();
    setDraftMode(savedTheme);
    setDraftPalette(savedAccentPalette);
    setFeedback('Preview cancelled. Reverted to your saved theme.');
  };

  const handleResetDefault = () => {
    if (!allowPersonalThemePreference) return;
    resetToDefaultTheme();
    setDraftMode(defaultTheme);
    setDraftPalette(defaultAccentPalette);
    setFeedback(
      `Restored centre default (${defaultTheme === 'dark' ? 'Dark Mode' : 'Light Mode'} · ${ACCENT_PALETTE_MAP[defaultAccentPalette].name}).`
    );
  };

  return (
    <Card
      title="Theme & Accent Colour Personalisation"
      subtitle={
        allowPersonalThemePreference
          ? 'Preview Light or Dark Mode paired with 10 curated academic accent palettes across the entire interface before applying.'
          : `Personal overrides are locked by your Administrator (${defaultTheme === 'dark' ? 'Dark Mode' : 'Light Mode'} · ${ACCENT_PALETTE_MAP[defaultAccentPalette].name}).`
      }
      action={
        hasUnappliedChanges ? (
          <StatusText tone="warning" label="Live Preview Active" />
        ) : (
          <StatusText
            tone="nominal"
            label={`${savedTheme === 'dark' ? 'Dark' : 'Light'} · ${ACCENT_PALETTE_MAP[savedAccentPalette].name}`}
          />
        )
      }
    >
      <div className="space-y-6">
        {!allowPersonalThemePreference && (
          <Alert tone="info" title="Controlled by Centre Policy">
            Your Administrator currently enforces the centre default theme for all portal screens. Personal device overrides are disabled.
          </Alert>
        )}

        {feedback && (
          <Alert tone="success" onDismiss={() => setFeedback(null)}>
            {feedback}
          </Alert>
        )}

        {/* 1. Appearance Mode Selector */}
        <section aria-labelledby="theme-appearance-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3
                id="theme-appearance-heading"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                Appearance Mode
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Deep Graphite is the signature Luxury Academic default.
              </p>
            </div>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              Default: {defaultTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </span>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            role="radiogroup"
            aria-label="Select appearance mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={draftMode === 'dark'}
              disabled={!allowPersonalThemePreference}
              onClick={() => handleSelectMode('dark')}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors duration-150 space-y-2.5',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
                draftMode === 'dark'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)]'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Moon className="w-4 h-4 text-[var(--accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Dark Mode</span>
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">· Default</span>
                </span>
                {draftMode === 'dark' && <StatusText tone="nominal" label="Selected" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#17191D] border border-[#393D43]" aria-hidden="true" />
                <span className="w-5 h-5 rounded-md bg-[#202329] border border-[#393D43]" aria-hidden="true" />
                <span
                  className="w-5 h-5 rounded-md border border-black/15"
                  style={{ backgroundColor: activePaletteDef.dark.accent }}
                  aria-hidden="true"
                />
                <span className="text-xs text-[var(--text-secondary)]">
                  Deep Graphite & Warm Ivory
                </span>
              </div>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={draftMode === 'light'}
              disabled={!allowPersonalThemePreference}
              onClick={() => handleSelectMode('light')}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors duration-150 space-y-2.5',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
                draftMode === 'light'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)]'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Sun className="w-4 h-4 text-[var(--accent-text)]" strokeWidth={1.75} aria-hidden="true" />
                  <span>Light Mode</span>
                </span>
                {draftMode === 'light' && <StatusText tone="nominal" label="Selected" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-[#F8F5EF] border border-[#E6E0D5]" aria-hidden="true" />
                <span className="w-5 h-5 rounded-md bg-[#FFFFFF] border border-[#E6E0D5]" aria-hidden="true" />
                <span
                  className="w-5 h-5 rounded-md border border-black/15"
                  style={{ backgroundColor: activePaletteDef.light.accent }}
                  aria-hidden="true"
                />
                <span className="text-xs text-[var(--text-secondary)]">
                  Warm Ivory & Crisp White
                </span>
              </div>
            </button>
          </div>
        </section>

        {/* 2. 10 Selectable Accent Colour Palettes */}
        <section aria-labelledby="theme-palette-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3
                id="theme-palette-heading"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                Accent Colour Palette ({ACCENT_PALETTES.length})
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Refines buttons, active navigation, focus rings, charts, and highlights in both Dark & Light modes.
              </p>
            </div>
            <span className="text-xs font-medium text-[var(--accent-text)]">
              {activePaletteDef.name}
            </span>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5"
            role="radiogroup"
            aria-label="Select accent colour palette"
          >
            {ACCENT_PALETTES.map((palette) => {
              const selected = draftPalette === palette.id;
              const isDefault = palette.id === defaultAccentPalette;
              return (
                <button
                  key={palette.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!allowPersonalThemePreference}
                  onClick={() => handleSelectPalette(palette.id)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors duration-150 flex flex-col justify-between gap-2.5 min-h-[84px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                    allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1" aria-hidden="true">
                      {palette.swatches.map((hex) => (
                        <span
                          key={hex}
                          className="w-3.5 h-3.5 rounded-full border border-black/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    {selected ? (
                      <span className="w-5 h-5 rounded-md bg-[var(--accent)] text-[var(--accent-contrast)] inline-flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                    ) : isDefault ? (
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {palette.name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                      {palette.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Live Theme Preview Surface */}
        <section aria-labelledby="theme-preview-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--accent-text)]" strokeWidth={1.75} aria-hidden="true" />
              <h3
                id="theme-preview-heading"
                className="text-sm font-semibold text-[var(--text-primary)]"
              >
                Live Interface Preview
              </h3>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {draftMode === 'dark' ? 'Dark Mode' : 'Light Mode'} · {activePaletteDef.name}
            </span>
          </div>

          <div
            style={previewCssVars}
            className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5 transition-colors duration-150"
          >
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
                    {centreName}
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    Academic Operations Preview
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-medium whitespace-nowrap">
                    Active Tab
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-secondary)] text-[var(--text-secondary)] text-xs font-medium whitespace-nowrap">
                    Secondary
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Term Attendance
                  </p>
                  <p className="mt-1 text-lg font-bold text-[var(--text-primary)] tabular-nums">
                    94.6%
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Released Assessments
                  </p>
                  <p className="mt-1 text-lg font-bold text-[var(--text-primary)] tabular-nums">
                    18
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 flex flex-col justify-between gap-2">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Primary Control
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold whitespace-nowrap">
                      Primary Action
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Apply / Cancel / Reset Controls */}
        {allowPersonalThemePreference && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isFollowingDefault}
              onClick={handleResetDefault}
              iconLeft={<RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
            >
              Reset to Default
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!hasUnappliedChanges}
                onClick={handleCancelPreview}
                iconLeft={<X className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
              >
                Cancel Preview
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!hasUnappliedChanges}
                onClick={handleApplyTheme}
                iconLeft={<Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
              >
                Apply Theme
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

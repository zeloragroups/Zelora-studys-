import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { BrandingConfig } from '../../config/branding';
import type { LogoConfiguration } from '../../types';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { ThemeToggle } from '../ui/ThemeToggle';

interface LoginShellProps {
  branding: BrandingConfig;
  logoConfiguration?: LogoConfiguration;
  portalLabel: string;
  heading: string;
  subtitle: string;
  children: ReactNode;
  footerLink?: ReactNode;
  onNavigateHome: () => void;
}

/**
 * Shared clean, responsive authentication frame used by Admin Portal
 * and Forgot Password screens.
 */
export function LoginShell({
  branding,
  logoConfiguration,
  portalLabel,
  heading,
  subtitle,
  children,
  footerLink,
  onNavigateHome,
}: LoginShellProps) {
  const brandTitle = (branding.centreName || 'ZELORA STUDYS').toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      {/* Compact Top Bar */}
      <header className="h-14 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded-lg"
          >
            <BrandLogoMark
              logoConfiguration={logoConfiguration}
              alt={brandTitle}
              size="sm"
            />
            <span className="font-display text-sm sm:text-base font-bold tracking-[0.08em] uppercase text-[var(--text-primary)] whitespace-nowrap">
              {brandTitle}
            </span>
          </button>

          <ThemeToggle compact />
        </div>
      </header>

      {/* Centered Auth Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-[0_10px_34px_rgba(23,25,29,0.08)] dark:shadow-none p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-medium text-[var(--accent-text)]">
                {portalLabel} · {branding.academicYearLabel}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
                {heading}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                {subtitle}
              </p>
            </div>

            {children}

            {footerLink && (
              <div className="mt-6 pt-5 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
                {footerLink}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

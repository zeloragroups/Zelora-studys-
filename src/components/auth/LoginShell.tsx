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
 * Shared clean, responsive authentication frame used by Admin Portal,
 * Teacher & Student Portal, and Forgot Password screens.
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
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F8] dark:bg-[#151A1E] text-[#20262B] dark:text-[#F4F7F6]">
      {/* Compact Top Bar */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E2E8E5] dark:border-[#35413F] bg-white/95 dark:bg-[#1D2429]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9] rounded-lg"
          >
            <BrandLogoMark
              logoConfiguration={logoConfiguration}
              alt={branding.centreName}
              size="sm"
            />
            <span className="font-display text-sm sm:text-base font-bold tracking-[0.06em] uppercase text-[#20262B] dark:text-[#F4F7F6] whitespace-nowrap">
              {branding.centreName}
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
          <div className="rounded-2xl bg-white dark:bg-[#1D2429] border border-[#E2E8E5] dark:border-[#344047] shadow-[0_6px_28px_rgba(23,29,33,0.06)] dark:shadow-none p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-medium text-[#168A63] dark:text-[#42DDA9]">
                {portalLabel} · {branding.academicYearLabel}
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] text-balance">
                {heading}
              </h1>
              <p className="mt-1.5 text-sm text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                {subtitle}
              </p>
            </div>

            {children}

            {footerLink && (
              <div className="mt-6 pt-5 border-t border-[#E2E8E5] dark:border-[#344047] text-xs text-[#68737C] dark:text-[#AAB6B4]">
                {footerLink}
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

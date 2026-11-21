import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { BrandingConfig } from '../../config/branding';
import type { LogoConfiguration } from '../../types';
import { BrandLogoMark } from '../ui/BrandLogoMark';

interface StartupSplashProps {
  branding: BrandingConfig;
  logoConfiguration?: LogoConfiguration;
  isReady: boolean;
  initError?: string | null;
  onRetry?: () => void;
  onComplete: () => void;
}

/**
 * ZELORA STUDYS Luxury Academic Startup Loading Screen.
 * - Directly tracks real authentication and session restoration (`isReady`).
 * - Never shows fake percentages or blocks indefinitely once initialization completes.
 */
export function StartupSplash({
  branding,
  logoConfiguration,
  isReady,
  initError = null,
  onRetry,
  onComplete,
}: StartupSplashProps) {
  const [visible, setVisible] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isReady) {
      setTimedOut(false);
      const timer = window.setTimeout(() => {
        setVisible(false);
      }, 120);
      return () => window.clearTimeout(timer);
    }

    const guardTimer = window.setTimeout(() => {
      setTimedOut(true);
    }, 10000);
    return () => window.clearTimeout(guardTimer);
  }, [isReady]);

  const brandTitle = (branding.centreName || 'ZELORA STUDYS').toUpperCase();

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          key="zelora-startup-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-[#17191D] text-[#F5F3EF]"
          role="status"
          aria-live="polite"
          aria-label="Initializing ZELORA STUDYS workspace"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center max-w-sm w-full"
          >
            <BrandLogoMark
              logoConfiguration={logoConfiguration}
              alt={brandTitle}
              size="lg"
              className="border-[#57482E] bg-[#202329] text-[var(--accent)]"
            />

            <h1 className="mt-5 font-display text-2xl sm:text-[26px] font-bold tracking-[0.16em] uppercase text-[#F5F3EF]">
              {brandTitle}
            </h1>

            <p className="mt-1.5 text-xs sm:text-sm text-[#B7B3AA]">
              {initError
                ? initError
                : timedOut
                  ? 'Taking longer than expected to verify your session.'
                  : 'Verifying session and preparing your workspace'}
            </p>

            {!initError && !timedOut ? (
              <div
                className="mt-6 w-48 h-1 rounded-full bg-[#282C33] overflow-hidden"
                aria-hidden="true"
              >
                <motion.div
                  initial={{ x: '-65%' }}
                  animate={{ x: '135%' }}
                  transition={{
                    duration: 1.15,
                    repeat: Infinity,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="h-full w-1/2 rounded-full bg-[var(--accent)]"
                />
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-3">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVisible(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-[#393D43] bg-[#202329] text-xs font-medium text-[#F5F3EF] hover:bg-[#282C33] transition-colors cursor-pointer"
                >
                  Continue to Sign In
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

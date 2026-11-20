import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { BrandingConfig } from '../../config/branding';
import type { LogoConfiguration } from '../../types';
import { BrandLogoMark } from '../ui/BrandLogoMark';

interface StartupSplashProps {
  branding: BrandingConfig;
  logoConfiguration?: LogoConfiguration;
  onComplete: () => void;
}

/**
 * Animated startup loading screen matching Scholars Academy Mint & Charcoal tokens.
 * Uses GPU-composited opacity and transform transitions only, settles quickly,
 * and allows immediate skip for zero-blocking accessibility.
 */
export function StartupSplash({
  branding,
  logoConfiguration,
  onComplete,
}: StartupSplashProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const delay = prefersReduced ? 120 : 680;
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, delay);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {visible && (
        <motion.div
          key="startup-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-[#F7F9F8] dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]"
          role="status"
          aria-label="Preparing workspace"
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <BrandLogoMark
              logoConfiguration={logoConfiguration}
              alt={branding.centreName}
              size="lg"
              className="shadow-[0_10px_28px_rgba(23,29,33,0.16)] dark:shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
            />
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6]">
              {branding.centreName}
            </h1>
            <p className="mt-1 text-sm text-[#68737C] dark:text-[#AAB6B4]">
              {branding.tagline}
            </p>
            <div className="mt-6 w-44 h-1.5 rounded-full bg-[#E2E8E5] dark:bg-[#252E33] overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'left' }}
                className="h-full w-full bg-[#35D6A0] dark:bg-[#42DDA9]"
              />
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="mt-5 text-xs font-medium text-[#68737C] hover:text-[#168A63] dark:text-[#AAB6B4] dark:hover:text-[#42DDA9] transition-colors cursor-pointer"
            >
              Enter Workspace
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

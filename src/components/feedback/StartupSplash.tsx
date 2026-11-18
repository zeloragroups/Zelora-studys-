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
 * Animated startup loading screen.
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

    const delay = prefersReduced ? 120 : 800;
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
          exit={{ opacity: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-[#F8F9FC] dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC]"
          role="status"
          aria-label="Preparing workspace"
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center max-w-sm"
          >
            <BrandLogoMark
              logoConfiguration={logoConfiguration}
              alt={branding.centreName}
              size="lg"
              className="shadow-[0_10px_28px_rgba(117,82,217,0.28)] dark:shadow-[0_10px_30px_rgba(139,92,246,0.4)]"
            />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              {branding.centreName}
            </h1>
            <p className="mt-1 text-sm text-[#687086] dark:text-[#A6B0C3]">
              {branding.tagline}
            </p>
            <div className="mt-6 w-40 h-1.5 rounded-full bg-[#E5E7EF] dark:bg-[#202844] overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'left' }}
                className="h-full w-full bg-[#7552D9] dark:bg-[#8B5CF6]"
              />
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="mt-5 text-xs font-medium text-[#687086] hover:text-[#7552D9] dark:text-[#A6B0C3] dark:hover:text-[#C4B5FD] transition-colors cursor-pointer"
            >
              Enter Workspace
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

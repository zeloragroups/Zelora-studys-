import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidthClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidthClass = 'max-w-lg',
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#151A1E]/65 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidthClass} rounded-2xl bg-white dark:bg-[#1D2429] border border-[#E2E8E5] dark:border-[#344047] shadow-xl my-auto`}
          >
            <header className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-[#E2E8E5] dark:border-[#344047]">
              <div className="min-w-0">
                <h2
                  id="modal-title"
                  className="text-base sm:text-lg font-semibold text-[#171D21] dark:text-[#F4F7F6] tracking-tight"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 text-xs sm:text-sm text-[#68737C] dark:text-[#AAB6B4]">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="w-10 h-10 -mr-1 inline-flex items-center justify-center rounded-xl text-[#68737C] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:text-[#F4F7F6] hover:bg-[#F0F4F2] dark:hover:bg-[#252E33] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]"
              >
                <X className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </header>

            <div className="p-5 sm:p-6 max-h-[82vh] overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
            className="fixed inset-0 bg-[#101426]/65 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidthClass} rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] shadow-xl my-auto`}
          >
            <header className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-[#E5E7EF] dark:border-[#303A55]">
              <div className="min-w-0">
                <h2
                  id="modal-title"
                  className="text-base sm:text-lg font-semibold text-[#17172B] dark:text-[#F8FAFC] tracking-tight"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 text-xs sm:text-sm text-[#687086] dark:text-[#A6B0C3]">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="w-10 h-10 -mr-1 inline-flex items-center justify-center rounded-xl text-[#687086] hover:text-[#17172B] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </header>

            <div className="p-5 sm:p-6 max-h-[82vh] overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const PADDING_CLASSES = {
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

/**
 * Single-elevation structural surface with 1px subtle border matching
 * Phase 6.5 Light (#FFFFFF / #E5E7EF) and Dark Navy (#171D34 / #303A55) palettes.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  padding = 'md',
}: CardProps) {
  return (
    <section
      className={cn(
        'rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] shadow-[0_1px_2px_rgba(23,23,43,0.03)] dark:shadow-none',
        PADDING_CLASSES[padding],
        className
      )}
    >
      {(title || subtitle || action) && (
        <header className="flex flex-wrap items-start justify-between gap-4 pb-4 mb-5 border-b border-[#E5E7EF] dark:border-[#303A55]">
          <div className="min-w-0">
            {title && (
              <h2 className="text-base sm:text-lg font-semibold text-[#17172B] dark:text-[#F8FAFC] tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-[#687086] dark:text-[#A6B0C3]">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

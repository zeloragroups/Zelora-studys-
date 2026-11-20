import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'charcoal' | 'muted';
}

const PADDING_CLASSES = {
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

const VARIANT_CLASSES = {
  default:
    'bg-white dark:bg-[#1D2429] border-[#E2E8E5] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6] shadow-[0_1px_2px_rgba(23,29,33,0.03)] dark:shadow-none',
  charcoal:
    'bg-[#20262B] dark:bg-[#252E33] border-[#343C42] dark:border-[#344047] text-[#F4F7F6] shadow-[0_2px_8px_rgba(23,29,33,0.08)] dark:shadow-none',
  muted:
    'bg-[#F0F4F2] dark:bg-[#252E33] border-[#E2E8E5] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6]',
};

/**
 * Single-elevation structural surface with subtle 1px hairline border matching
 * Scholars Academy 60/30/10 Light and Dark palettes.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  padding = 'md',
  variant = 'default',
}: CardProps) {
  const isCharcoal = variant === 'charcoal';

  return (
    <section
      className={cn(
        'rounded-2xl border',
        VARIANT_CLASSES[variant],
        PADDING_CLASSES[padding],
        className
      )}
    >
      {(title || subtitle || action) && (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-4 pb-4 mb-5 border-b',
            isCharcoal
              ? 'border-[#343C42] dark:border-[#344047]'
              : 'border-[#E2E8E5] dark:border-[#344047]'
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className={cn(
                  'text-[15px] sm:text-[17px] font-semibold tracking-tight leading-snug',
                  isCharcoal
                    ? 'text-[#F4F7F6]'
                    : 'text-[#171D21] dark:text-[#F4F7F6]'
                )}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className={cn(
                  'mt-1 text-xs sm:text-sm leading-relaxed',
                  isCharcoal
                    ? 'text-[#AAB6B4]'
                    : 'text-[#68737C] dark:text-[#AAB6B4]'
                )}
              >
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

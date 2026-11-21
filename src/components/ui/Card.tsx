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
    'bg-[var(--surface)] border-[var(--border)] text-[var(--text-primary)] shadow-[var(--shadow-subtle)]',
  charcoal:
    'bg-[var(--hero-surface)] border-[var(--hero-border)] text-[var(--hero-text)] shadow-[0_2px_10px_rgba(23,25,29,0.10)] dark:shadow-none',
  muted:
    'bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--text-primary)]',
};

/**
 * Single-elevation structural surface with subtle 1px hairline border matching
 * ZELORA STUDYS Luxury Academic Dark & Light palettes.
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
            isCharcoal ? 'border-[var(--hero-border)]' : 'border-[var(--border)]'
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className={cn(
                  'text-[15px] sm:text-[17px] font-semibold tracking-tight leading-snug',
                  isCharcoal ? 'text-[var(--hero-text)]' : 'text-[var(--text-primary)]'
                )}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className={cn(
                  'mt-1 text-xs sm:text-sm leading-relaxed',
                  isCharcoal ? 'text-[var(--hero-muted)]' : 'text-[var(--text-secondary)]'
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

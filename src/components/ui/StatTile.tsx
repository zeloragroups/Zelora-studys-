import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface StatTileProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  caption?: string;
  icon?: ReactNode;
  accent?: boolean;
  tone?: 'default' | 'charcoal' | 'mint';
  className?: string;
}

/**
 * Tabular-nums KPI tile with lightweight animated number settle for numeric metrics
 * and clean direct rendering for formatted strings.
 */
export function StatTile({
  label,
  value,
  prefix = '',
  suffix = '',
  caption,
  icon,
  accent = false,
  tone,
  className,
}: StatTileProps) {
  const resolvedTone = tone ?? (accent ? 'mint' : 'default');
  const [displayValue, setDisplayValue] = useState<number>(
    typeof value === 'number' ? value : 0
  );

  useEffect(() => {
    if (typeof value !== 'number') {
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setDisplayValue(value);
      return;
    }

    let frameId = 0;
    const duration = 320;
    const startTime = performance.now();
    const startVal = 0;

    const tick = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setDisplayValue(Math.round(startVal + (value - startVal) * eased));
      if (elapsed < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  const renderedValue =
    typeof value === 'number'
      ? new Intl.NumberFormat('en-IN').format(displayValue)
      : value;

  const isCharcoal = resolvedTone === 'charcoal';
  const isAccent = resolvedTone === 'mint';

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 sm:p-5 transition-colors duration-150',
        isCharcoal
          ? 'bg-[var(--hero-surface)] border-[var(--hero-border)] text-[var(--hero-text)]'
          : isAccent
            ? 'bg-[var(--accent-soft)] border-[var(--accent-border)]'
            : 'bg-[var(--surface)] border-[var(--border)] shadow-[var(--shadow-subtle)]',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            'text-xs font-medium',
            isCharcoal
              ? 'text-[var(--hero-muted)]'
              : isAccent
                ? 'text-[var(--accent-text)]'
                : 'text-[var(--text-secondary)]'
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              'w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0',
              isCharcoal
                ? 'bg-[var(--hero-secondary)] text-[var(--hero-accent)]'
                : isAccent
                  ? 'bg-[var(--surface)] text-[var(--accent-text)] border border-[var(--accent-border)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          'mt-2.5 text-2xl sm:text-[28px] font-semibold tracking-tight font-mono tabular-nums leading-none',
          isCharcoal ? 'text-[var(--hero-text)]' : 'text-[var(--text-primary)]'
        )}
      >
        {prefix}
        {renderedValue}
        {suffix}
      </p>
      {caption && (
        <p
          className={cn(
            'mt-2 text-xs leading-snug',
            isCharcoal ? 'text-[var(--hero-muted)]' : 'text-[var(--text-secondary)]'
          )}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

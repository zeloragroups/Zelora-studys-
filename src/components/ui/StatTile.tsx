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
  const isMint = resolvedTone === 'mint';

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 sm:p-5 transition-colors duration-150',
        isCharcoal
          ? 'bg-[#20262B] dark:bg-[#252E33] border-[#343C42] dark:border-[#344047] text-[#F4F7F6]'
          : isMint
            ? 'bg-[#DDF8EE]/65 dark:bg-[#244B3E]/55 border-[#B8EBD8] dark:border-[#316453]'
            : 'bg-white dark:bg-[#1D2429] border-[#E2E8E5] dark:border-[#344047] shadow-[0_1px_2px_rgba(23,29,33,0.03)] dark:shadow-none',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            'text-xs font-medium',
            isCharcoal
              ? 'text-[#AAB6B4]'
              : isMint
                ? 'text-[#168A63] dark:text-[#42DDA9]'
                : 'text-[#68737C] dark:text-[#AAB6B4]'
          )}
        >
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              'w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0',
              isCharcoal
                ? 'bg-[#343C42] text-[#42DDA9]'
                : isMint
                  ? 'bg-white/90 dark:bg-[#1D2429] text-[#168A63] dark:text-[#42DDA9] border border-[#B8EBD8]/70 dark:border-[#316453]'
                  : 'bg-[#F0F4F2] dark:bg-[#252E33] text-[#343C42] dark:text-[#AAB6B4]'
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
          isCharcoal ? 'text-[#F4F7F6]' : 'text-[#171D21] dark:text-[#F4F7F6]'
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
            isCharcoal
              ? 'text-[#AAB6B4]'
              : 'text-[#68737C] dark:text-[#AAB6B4]'
          )}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

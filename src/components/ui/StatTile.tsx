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
  className?: string;
}

/**
 * Tabular-nums KPI tile with lightweight animated number settle for numeric metrics
 * and clean direct rendering for formatted strings (e.g., "66.7%" or "Not available").
 */
export function StatTile({
  label,
  value,
  prefix = '',
  suffix = '',
  caption,
  icon,
  accent = false,
  className,
}: StatTileProps) {
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
    const duration = 360;
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

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 sm:p-5 transition-colors duration-150',
        accent
          ? 'bg-[#F1EEFA] dark:bg-[#202844] border-[#7552D9]/25 dark:border-[#8B5CF6]/35'
          : 'bg-white dark:bg-[#171D34] border-[#E5E7EF] dark:border-[#303A55] shadow-[0_1px_2px_rgba(23,23,43,0.03)] dark:shadow-none',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
          {label}
        </p>
        {icon && (
          <span
            className="w-8 h-8 rounded-lg bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#A78BFA] inline-flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#17172B] dark:text-[#F8FAFC] font-mono tabular-nums">
        {prefix}
        {renderedValue}
        {suffix}
      </p>
      {caption && (
        <p className="mt-1.5 text-xs text-[#687086] dark:text-[#A6B0C3]">
          {caption}
        </p>
      )}
    </div>
  );
}

import { BarChart3 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';
import { EmptyState } from '../ui/EmptyState';

export interface BarChartDatum {
  id: string;
  label: string;
  value: number;
  maxValue?: number;
  displayValue?: string;
  helperText?: string;
  tone?: 'mint' | 'charcoal' | 'warning' | 'danger' | 'info';
}

interface ComparisonBarChartProps {
  data: BarChartDatum[];
  emptyTitle?: string;
  emptyDescription?: string;
  ariaLabel?: string;
}

const BAR_TONE_CLASSES: Record<NonNullable<BarChartDatum['tone']>, string> = {
  mint: 'bg-[#35D6A0] dark:bg-[#42DDA9]',
  charcoal: 'bg-[#20262B] dark:bg-[#AAB6B4]',
  warning: 'bg-[#D69B35] dark:bg-[#E5B04D]',
  danger: 'bg-[#D64C55] dark:bg-[#EF6D75]',
  info: 'bg-[#4285A5] dark:bg-[#62A7C7]',
};

/**
 * Clean, responsive horizontal bar visualization strictly bound to real data.
 */
export function ComparisonBarChart({
  data,
  emptyTitle = 'No metrics recorded yet',
  emptyDescription = 'Comparative bars appear automatically once records are submitted.',
  ariaLabel = 'Comparison chart',
}: ComparisonBarChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-3.5" role="list" aria-label={ariaLabel}>
      {data.map((item) => {
        const denominator = item.maxValue && item.maxValue > 0 ? item.maxValue : 100;
        const pct = Math.min(100, Math.max(0, (item.value / denominator) * 100));
        const barTone = item.tone ?? 'mint';

        return (
          <div key={item.id} role="listitem" className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-[#171D21] dark:text-[#F4F7F6] truncate">
                {item.label}
              </span>
              <span className="font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4] shrink-0">
                {item.displayValue ?? `${Math.round(pct)}%`}
                {item.helperText ? ` · ${item.helperText}` : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#F0F4F2] dark:bg-[#252E33] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300 ease-out',
                  BAR_TONE_CLASSES[barTone]
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  displayValue?: string;
  colorLight: string;
  colorDark: string;
}

interface DistributionDonutChartProps {
  centerLabel: string;
  centerValue: string;
  segments: DonutSegment[];
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Minimalist fintech-inspired SVG donut distribution chart with WCAG-friendly legend.
 */
export function DistributionDonutChart({
  centerLabel,
  centerValue,
  segments,
  emptyTitle = 'No distribution data yet',
  emptyDescription = 'Data segments will render once entries are recorded.',
}: DistributionDonutChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  if (total <= 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="relative w-32 h-32 shrink-0 mx-auto sm:mx-0">
        <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-[#F0F4F2] dark:text-[#252E33]"
          />
          {segments.map((seg) => {
            const val = Math.max(0, seg.value);
            if (val === 0) return null;
            const fraction = val / total;
            const dashLength = fraction * circumference;
            const dashOffset = -cumulativeOffset;
            cumulativeOffset += dashLength;
            const segmentColor = isDark ? seg.colorDark : seg.colorLight;

            return (
              <circle
                key={seg.id}
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke={segmentColor}
                strokeWidth="12"
                strokeLinecap="butt"
                strokeDasharray={`${dashLength} ${circumference}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          <span className="text-[11px] font-medium text-[#68737C] dark:text-[#AAB6B4] leading-tight">
            {centerLabel}
          </span>
          <span className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
            {centerValue}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {segments.map((seg) => {
          const pct = Math.round((Math.max(0, seg.value) / total) * 100);
          const segmentColor = isDark ? seg.colorDark : seg.colorLight;
          return (
            <div key={seg.id} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: segmentColor }}
                  aria-hidden="true"
                />
                <span className="text-[#343C42] dark:text-[#D4DDDC] truncate font-medium">
                  {seg.label}
                </span>
              </div>
              <span className="font-mono tabular-nums text-[#171D21] dark:text-[#F4F7F6] shrink-0 font-semibold">
                {seg.displayValue ?? seg.value}{' '}
                <span className="text-[#68737C] dark:text-[#AAB6B4] font-normal">
                  ({pct}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

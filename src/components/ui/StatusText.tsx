import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

export type SemanticTone = 'nominal' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusTextProps {
  tone: SemanticTone;
  label: string;
  className?: string;
}

const TONE_MAP: Record<SemanticTone, string> = {
  nominal: 'text-[#168A63] dark:text-[#42DDA9]',
  warning: 'text-[#A67317] dark:text-[#E5B04D]',
  danger: 'text-[#D64C55] dark:text-[#EF6D75]',
  info: 'text-[#4285A5] dark:text-[#62A7C7]',
  neutral: 'text-[#68737C] dark:text-[#AAB6B4]',
};

/**
 * Dual-coded semantic state display (icon + explicit text label).
 * Never uses static pill boxes or hue-only signaling.
 */
export function StatusText({ tone, label, className }: StatusTextProps) {
  const Icon =
    tone === 'nominal'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'danger'
          ? XCircle
          : tone === 'info'
            ? Info
            : Clock;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_MAP[tone], className)}>
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

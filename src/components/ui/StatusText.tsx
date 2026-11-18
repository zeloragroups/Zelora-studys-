import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

export type SemanticTone = 'nominal' | 'warning' | 'danger' | 'neutral';

interface StatusTextProps {
  tone: SemanticTone;
  label: string;
  className?: string;
}

const TONE_MAP: Record<SemanticTone, string> = {
  nominal: 'text-[#168A62] dark:text-[#22C58B]',
  warning: 'text-[#B7791F] dark:text-[#F5B942]',
  danger: 'text-[#D94C5C] dark:text-[#F16B75]',
  neutral: 'text-[#687086] dark:text-[#A6B0C3]',
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
          : Clock;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', TONE_MAP[tone], className)}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

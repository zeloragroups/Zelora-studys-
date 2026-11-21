import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const TONE_CLASSES: Record<AlertTone, string> = {
  info: 'bg-[var(--info-soft)] border-[var(--info-border)] text-[var(--text-primary)]',
  success: 'bg-[var(--success-soft)] border-[var(--success-border)] text-[var(--text-primary)]',
  warning: 'bg-[var(--warning-soft)] border-[var(--warning-border)] text-[var(--text-primary)]',
  error: 'bg-[var(--error-soft)] border-[var(--error-border)] text-[var(--text-primary)]',
};

const ICON_TONE_CLASSES: Record<AlertTone, string> = {
  info: 'text-[var(--info)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
};

export function Alert({
  tone,
  title,
  children,
  action,
  onDismiss,
  className,
}: AlertProps) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'error'
          ? AlertCircle
          : Info;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-start justify-between gap-3',
        TONE_CLASSES[tone],
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <Icon
          className={cn('w-4 h-4 shrink-0 mt-0.5', ICON_TONE_CLASSES[tone])}
          strokeWidth={2}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-1">
          {title && <p className="font-semibold leading-snug text-[var(--text-primary)]">{title}</p>}
          <div className="leading-relaxed text-[var(--text-primary)]/90">{children}</div>
        </div>
      </div>

      {(action || onDismiss) && (
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

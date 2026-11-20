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
  info: 'bg-[#F0F4F2] dark:bg-[#252E33] border-[#D6E0DC] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6]',
  success:
    'bg-[#DDF8EE]/80 dark:bg-[#244B3E]/70 border-[#B8EBD8] dark:border-[#316453] text-[#125D44] dark:text-[#F4F7F6]',
  warning:
    'bg-[#FDF6E7] dark:bg-[#352A18]/80 border-[#F2DAA6] dark:border-[#6A5122] text-[#7A510F] dark:text-[#F9E6BC]',
  error:
    'bg-[#FCEBEC] dark:bg-[#3B2125]/85 border-[#F2C3C6] dark:border-[#6B333B] text-[#8E2A31] dark:text-[#F9D2D5]',
};

const ICON_TONE_CLASSES: Record<AlertTone, string> = {
  info: 'text-[#4285A5] dark:text-[#62A7C7]',
  success: 'text-[#168A63] dark:text-[#42DDA9]',
  warning: 'text-[#A67317] dark:text-[#E5B04D]',
  error: 'text-[#D64C55] dark:text-[#EF6D75]',
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
          {title && <p className="font-semibold leading-snug">{title}</p>}
          <div className="leading-relaxed">{children}</div>
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
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-opacity cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

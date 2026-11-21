import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  successMessage?: string;
  rightElement?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  successMessage,
  rightElement,
  className,
  id,
  required,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-[var(--text-primary)]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[var(--accent-text)]" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="relative">
        <input
          id={inputId}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm',
            Boolean(rightElement) && 'pr-11',
            'bg-[var(--surface)] dark:bg-[var(--background)] text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'disabled:bg-[var(--surface-secondary)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed',
            'border transition-colors duration-150',
            error
              ? 'border-[var(--error)] focus:outline-2 focus:outline-[var(--error)]/30'
              : successMessage
                ? 'border-[var(--success)] focus:outline-2 focus:outline-[var(--success)]/30'
                : 'border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)]',
            className
          )}
          {...rest}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-1.5 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--error)] transition-opacity duration-150"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && successMessage && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--success)] transition-opacity duration-150">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </p>
      )}
      {!error && !successMessage && hint && (
        <p className="text-xs text-[var(--text-secondary)]">{hint}</p>
      )}
    </div>
  );
}

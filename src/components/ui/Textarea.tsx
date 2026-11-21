import { useId, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export function Textarea({
  label,
  hint,
  error,
  className,
  containerClassName,
  id,
  required,
  rows = 3,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-[var(--text-primary)]"
        >
          {label}
          {required && (
            <span className="ml-1 text-[var(--accent-text)]" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
          'bg-[var(--surface)] dark:bg-[var(--background)] text-[var(--text-primary)]',
          'placeholder:text-[var(--text-muted)]',
          'disabled:bg-[var(--surface-secondary)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed',
          'border transition-colors duration-150',
          error
            ? 'border-[var(--error)] focus:outline-2 focus:outline-[var(--error)]/30'
            : 'border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)]',
          className
        )}
        {...rest}
      />
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--error)]"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && hint && (
        <p className="text-xs text-[var(--text-secondary)]">{hint}</p>
      )}
    </div>
  );
}

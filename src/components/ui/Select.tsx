import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  children: ReactNode;
}

export function Select({
  label,
  hint,
  error,
  className,
  containerClassName,
  id,
  required,
  children,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={selectId}
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
      <div className="relative">
        <select
          id={selectId}
          required={required}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full min-h-[44px] appearance-none rounded-xl pl-3.5 pr-10 py-2.5 text-sm',
            'bg-[var(--surface)] dark:bg-[var(--background)] text-[var(--text-primary)]',
            'disabled:bg-[var(--surface-secondary)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed',
            'border transition-colors duration-150 cursor-pointer',
            error
              ? 'border-[var(--error)] focus:outline-2 focus:outline-[var(--error)]/30'
              : 'border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)]',
            className
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
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

import { useId } from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
}: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {(label || description) && (
        <label
          htmlFor={switchId}
          className={cn(
            'min-w-0 flex-1',
            disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          {label && (
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {label}
            </span>
          )}
          {description && (
            <span className="block mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
              {description}
            </span>
          )}
        </label>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          checked
            ? 'bg-[var(--accent)] border-[var(--accent)]'
            : 'bg-[var(--surface-secondary)] border-[var(--border)]'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 rounded-full shadow-xs transition-transform duration-150 ease-out',
            checked
              ? 'translate-x-[22px] bg-[var(--accent-contrast)]'
              : 'translate-x-[3px] bg-white dark:bg-[var(--text-secondary)]'
          )}
        />
      </button>
    </div>
  );
}

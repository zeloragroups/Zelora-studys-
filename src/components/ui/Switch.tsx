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
            <span className="block text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
              {label}
            </span>
          )}
          {description && (
            <span className="block mt-0.5 text-xs text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
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
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          checked
            ? 'bg-[#35D6A0] dark:bg-[#42DDA9] border-[#18B985] dark:border-[#42DDA9]'
            : 'bg-[#E2E8E5] dark:bg-[#2B353A] border-[#CED8D3] dark:border-[#344047]'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white dark:bg-[#151A1E] shadow-xs transition-transform duration-150 ease-out',
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          )}
        />
      </button>
    </div>
  );
}

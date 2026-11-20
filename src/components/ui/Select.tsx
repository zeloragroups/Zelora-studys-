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
          className="block text-sm font-medium text-[#20262B] dark:text-[#F4F7F6]"
        >
          {label}
          {required && (
            <span className="ml-1 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true">
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
            'bg-white dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]',
            'disabled:bg-[#F0F4F2] dark:disabled:bg-[#252E33] disabled:text-[#68737C] dark:disabled:text-[#AAB6B4] disabled:cursor-not-allowed',
            'border transition-colors duration-150 cursor-pointer',
            error
              ? 'border-[#D64C55] dark:border-[#EF6D75] focus:outline-2 focus:outline-[#D64C55]/25 dark:focus:outline-[#EF6D75]/30'
              : 'border-[#E2E8E5] dark:border-[#344047] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25',
            className
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68737C] dark:text-[#AAB6B4]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs font-medium text-[#D64C55] dark:text-[#EF6D75]"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && hint && (
        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">{hint}</p>
      )}
    </div>
  );
}

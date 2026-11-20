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
        className="block text-sm font-medium text-[#20262B] dark:text-[#F4F7F6]"
      >
        {label}
        {required && (
          <span className="ml-1 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true">
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
            'bg-white dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]',
            'placeholder:text-[#68737C]/75 dark:placeholder:text-[#AAB6B4]/60',
            'disabled:bg-[#F0F4F2] dark:disabled:bg-[#252E33] disabled:text-[#68737C] dark:disabled:text-[#AAB6B4] disabled:cursor-not-allowed',
            'border transition-colors duration-150',
            error
              ? 'border-[#D64C55] dark:border-[#EF6D75] focus:outline-2 focus:outline-[#D64C55]/25 dark:focus:outline-[#EF6D75]/30'
              : successMessage
                ? 'border-[#168A63] dark:border-[#42DDA9] focus:outline-2 focus:outline-[#168A63]/25 dark:focus:outline-[#42DDA9]/30'
                : 'border-[#E2E8E5] dark:border-[#344047] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25',
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
          className="flex items-center gap-1.5 text-xs font-medium text-[#D64C55] dark:text-[#EF6D75] transition-opacity duration-150"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && successMessage && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#168A63] dark:text-[#42DDA9] transition-opacity duration-150">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </p>
      )}
      {!error && !successMessage && hint && (
        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">{hint}</p>
      )}
    </div>
  );
}

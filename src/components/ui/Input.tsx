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
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm',
            Boolean(rightElement) && 'pr-11',
            'bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC]',
            'placeholder:text-[#687086]/75 dark:placeholder:text-[#A6B0C3]/65',
            'border transition-colors duration-150',
            error
              ? 'border-[#D94C5C] dark:border-[#F16B75] focus:outline-2 focus:outline-[#D94C5C]/25 dark:focus:outline-[#F16B75]/30'
              : successMessage
                ? 'border-[#168A62] dark:border-[#22C58B] focus:outline-2 focus:outline-[#168A62]/25 dark:focus:outline-[#22C58B]/30'
                : 'border-[#E5E7EF] dark:border-[#303A55] focus:border-[#7552D9] dark:focus:border-[#8B5CF6] focus:outline-2 focus:outline-[#7552D9]/20 dark:focus:outline-[#8B5CF6]/25',
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
          className="flex items-center gap-1.5 text-xs font-medium text-[#D94C5C] dark:text-[#F16B75] transition-opacity duration-150"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {!error && successMessage && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#168A62] dark:text-[#22C58B] transition-opacity duration-150">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </p>
      )}
      {!error && !successMessage && hint && (
        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">{hint}</p>
      )}
    </div>
  );
}

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
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
          'bg-white dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]',
          'placeholder:text-[#68737C]/75 dark:placeholder:text-[#AAB6B4]/60',
          'disabled:bg-[#F0F4F2] dark:disabled:bg-[#252E33] disabled:text-[#68737C] dark:disabled:text-[#AAB6B4] disabled:cursor-not-allowed',
          'border transition-colors duration-150',
          error
            ? 'border-[#D64C55] dark:border-[#EF6D75] focus:outline-2 focus:outline-[#D64C55]/25 dark:focus:outline-[#EF6D75]/30'
            : 'border-[#E2E8E5] dark:border-[#344047] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25',
          className
        )}
        {...rest}
      />
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

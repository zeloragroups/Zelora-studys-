import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'inline-flex items-start gap-2.5 select-none',
        disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer',
        className
      )}
    >
      <span className="relative mt-0.5 flex items-center justify-center shrink-0">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            'w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors duration-150',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#18B985] dark:peer-focus-visible:outline-[#42DDA9]',
            checked
              ? 'bg-[#35D6A0] dark:bg-[#42DDA9] border-[#18B985] dark:border-[#42DDA9] text-[#171D21]'
              : 'bg-white dark:bg-[#151A1E] border-[#C8D3CE] dark:border-[#495760] text-transparent'
          )}
          aria-hidden="true"
        >
          <Check className="w-3 h-3" strokeWidth={2.5} />
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && (
            <span className="block text-sm font-medium text-[#171D21] dark:text-[#F4F7F6] leading-snug">
              {label}
            </span>
          )}
          {description && (
            <span className="block mt-0.5 text-xs text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}

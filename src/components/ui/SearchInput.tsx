import { useId, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
}

export function SearchInput({
  label,
  value,
  onValueChange,
  placeholder = 'Search…',
  className,
  containerClassName,
  id,
  ...rest
}: SearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[#20262B] dark:text-[#F4F7F6]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68737C] dark:text-[#AAB6B4]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full min-h-[44px] rounded-xl pl-10 py-2.5 text-sm',
            value ? 'pr-10' : 'pr-3.5',
            'bg-white dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]',
            'placeholder:text-[#68737C]/75 dark:placeholder:text-[#AAB6B4]/60',
            'border border-[#E2E8E5] dark:border-[#344047]',
            'focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25',
            'transition-colors duration-150',
            '[&::-webkit-search-cancel-button]:hidden',
            className
          )}
          {...rest}
        />
        {value && (
          <button
            type="button"
            onClick={() => onValueChange('')}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#68737C] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:text-[#F4F7F6] hover:bg-[#F0F4F2] dark:hover:bg-[#252E33] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

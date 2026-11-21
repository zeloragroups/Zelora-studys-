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
          className="block text-sm font-medium text-[var(--text-primary)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
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
            'bg-[var(--surface)] dark:bg-[var(--background)] text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'border border-[var(--border)]',
            'focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)]',
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
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

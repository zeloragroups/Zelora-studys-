import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'segmented' | 'underline';
  ariaLabel?: string;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'segmented',
  ariaLabel = 'Section tabs',
  className,
}: TabsProps<T>) {
  if (variant === 'underline') {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-[#E2E8E5] dark:border-[#344047]',
          className
        )}
      >
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'relative inline-flex items-center gap-2 min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
                active
                  ? 'text-[#168A63] dark:text-[#42DDA9] font-semibold'
                  : 'text-[#68737C] dark:text-[#AAB6B4] hover:text-[#171D21] dark:hover:text-[#F4F7F6]'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span className="font-mono tabular-nums text-[11px] opacity-80">
                  ({item.count})
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[#18B985] dark:bg-[#42DDA9]"
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-xl p-1',
        'bg-[#F0F4F2] dark:bg-[#252E33] border border-[#E2E8E5] dark:border-[#344047]',
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-[background-color,color,box-shadow] duration-150 cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
              active
                ? 'bg-white dark:bg-[#1D2429] text-[#171D21] dark:text-[#F4F7F6] font-semibold shadow-xs border border-[#E2E8E5] dark:border-[#344047]'
                : 'text-[#68737C] dark:text-[#AAB6B4] hover:text-[#171D21] dark:hover:text-[#F4F7F6] border border-transparent'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span className="font-mono tabular-nums text-[11px] text-[#68737C] dark:text-[#AAB6B4]">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

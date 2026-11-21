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
          'flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-[var(--border)]',
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
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]',
                active
                  ? 'text-[var(--accent-text)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                  className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
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
        'bg-[var(--surface-secondary)] border border-[var(--border)]',
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
              'inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-[background-color,color,box-shadow,border-color] duration-150 cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
              active
                ? 'bg-[var(--surface)] text-[var(--text-primary)] font-semibold shadow-xs border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span className="font-mono tabular-nums text-[11px] text-[var(--text-muted)]">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

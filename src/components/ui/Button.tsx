import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { LoadingSpinner } from '../feedback/LoadingSpinner';

export type ButtonVariant = 'primary' | 'charcoal' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold hover:bg-[var(--accent-hover)] border border-transparent shadow-xs',
  charcoal:
    'bg-[var(--hero-surface)] text-[var(--hero-text)] font-medium hover:bg-[var(--hero-secondary)] border border-[var(--hero-border)] shadow-xs',
  secondary:
    'bg-[var(--surface)] text-[var(--text-primary)] font-medium border border-[var(--border)] hover:bg-[var(--surface-secondary)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] font-medium hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] border border-transparent',
  danger:
    'bg-[var(--error)] text-white dark:text-[#17191D] font-semibold hover:opacity-92 border border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] px-3.5 py-2 text-xs',
  md: 'min-h-[44px] px-4 py-2.5 text-sm',
  lg: 'min-h-[48px] px-6 py-3 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap shrink-0',
        'transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out active:scale-[0.985]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-55 disabled:pointer-events-none cursor-pointer',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {loading ? <LoadingSpinner size="sm" /> : iconLeft}
      <span>{children}</span>
      {!loading ? iconRight : null}
    </button>
  );
}

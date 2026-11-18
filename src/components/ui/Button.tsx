import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { LoadingSpinner } from '../feedback/LoadingSpinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
    'bg-[#7552D9] text-white hover:bg-[#6441C8] dark:bg-[#8B5CF6] dark:hover:bg-[#7C3AED] border border-transparent shadow-xs',
  secondary:
    'bg-white text-[#17172B] border border-[#E5E7EF] hover:bg-[#F1EEFA] dark:bg-[#202844] dark:text-[#F8FAFC] dark:border-[#303A55] dark:hover:bg-[#283254]',
  ghost:
    'bg-transparent text-[#434960] hover:bg-[#F1EEFA] hover:text-[#17172B] dark:text-[#A6B0C3] dark:hover:bg-[#202844] dark:hover:text-[#F8FAFC] border border-transparent',
  danger:
    'bg-[#D94C5C] text-white hover:bg-[#C03A4A] dark:bg-[#F16B75] dark:text-[#101426] dark:hover:bg-[#FA7E87] border border-transparent',
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
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap shrink-0',
        'transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7552D9] dark:focus-visible:outline-[#8B5CF6]',
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

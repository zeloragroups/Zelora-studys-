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
    'bg-[#35D6A0] text-[#171D21] font-semibold hover:bg-[#18B985] dark:bg-[#42DDA9] dark:text-[#151A1E] dark:hover:bg-[#35D6A0] border border-transparent shadow-xs',
  charcoal:
    'bg-[#20262B] text-[#F4F7F6] font-medium hover:bg-[#171D21] dark:bg-[#2B353A] dark:text-[#F4F7F6] dark:hover:bg-[#343C42] border border-transparent shadow-xs',
  secondary:
    'bg-white text-[#20262B] font-medium border border-[#E2E8E5] hover:bg-[#F0F4F2] dark:bg-[#252E33] dark:text-[#F4F7F6] dark:border-[#344047] dark:hover:bg-[#2B353A]',
  ghost:
    'bg-transparent text-[#343C42] font-medium hover:bg-[#F0F4F2] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:bg-[#252E33] dark:hover:text-[#F4F7F6] border border-transparent',
  danger:
    'bg-[#D64C55] text-white font-medium hover:bg-[#BE3E47] dark:bg-[#EF6D75] dark:text-[#151A1E] dark:hover:bg-[#F5858C] border border-transparent',
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
        'transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.985]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
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

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type IconButtonVariant = 'neutral' | 'mint' | 'danger' | 'ghost';
export type IconButtonSize = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  neutral:
    'border border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#252E33] text-[#343C42] dark:text-[#D4DDDC] hover:bg-[#F0F4F2] dark:hover:bg-[#2B353A] hover:text-[#171D21] dark:hover:text-[#F4F7F6]',
  mint:
    'border border-[#B8EBD8] dark:border-[#316453] bg-[#DDF8EE]/70 dark:bg-[#244B3E]/70 text-[#168A63] dark:text-[#42DDA9] hover:bg-[#DDF8EE] dark:hover:bg-[#244B3E]',
  danger:
    'border border-[#D64C55]/25 dark:border-[#EF6D75]/30 bg-white dark:bg-[#252E33] text-[#D64C55] dark:text-[#EF6D75] hover:bg-[#D64C55]/10 dark:hover:bg-[#EF6D75]/15',
  ghost:
    'border border-transparent bg-transparent text-[#68737C] dark:text-[#AAB6B4] hover:bg-[#F0F4F2] dark:hover:bg-[#252E33] hover:text-[#171D21] dark:hover:text-[#F4F7F6]',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'w-10 h-10 rounded-xl',
  md: 'w-11 h-11 rounded-xl',
};

export function IconButton({
  label,
  icon,
  variant = 'neutral',
  size = 'md',
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        'inline-flex items-center justify-center shrink-0 cursor-pointer',
        'transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

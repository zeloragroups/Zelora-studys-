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
    'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
  mint:
    'border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)] hover:opacity-90',
  danger:
    'border border-[var(--error-border)] bg-[var(--surface)] text-[var(--error)] hover:bg-[var(--error-soft)]',
  ghost:
    'border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
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
        'transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out active:scale-[0.97]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
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

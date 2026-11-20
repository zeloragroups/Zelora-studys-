import { cn } from '../../utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
};

export function LoadingSpinner({ size = 'md', label, className }: LoadingSpinnerProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} role="status" aria-live="polite">
      <span
        className={cn(
          'inline-block rounded-full border-current border-t-transparent animate-spin',
          SIZE_MAP[size]
        )}
        aria-hidden="true"
      />
      {label ? (
        <span className="text-sm text-[#68737C] dark:text-[#AAB6B4]">{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </span>
  );
}

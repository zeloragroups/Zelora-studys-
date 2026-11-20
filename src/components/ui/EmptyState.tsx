import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8]/70 dark:bg-[#151A1E]/40 p-6 sm:p-8 text-center',
        className
      )}
    >
      <div className="w-11 h-11 rounded-xl bg-[#F0F4F2] dark:bg-[#252E33] text-[#343C42] dark:text-[#AAB6B4] mx-auto flex items-center justify-center">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
        {title}
      </p>
      <p className="mt-1 text-xs text-[#68737C] dark:text-[#AAB6B4] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

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
        'rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)]/75 p-6 sm:p-8 text-center',
        className
      )}
    >
      <div className="w-11 h-11 rounded-xl bg-[var(--surface-secondary)] text-[var(--text-secondary)] mx-auto flex items-center justify-center">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

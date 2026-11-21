import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 pb-1',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium text-[var(--accent-text)] tracking-[0.02em]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl sm:text-[30px] font-semibold tracking-tight leading-tight text-[var(--text-primary)] text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot && (
        <div className="shrink-0 flex flex-wrap items-center gap-2.5">{rightSlot}</div>
      )}
    </header>
  );
}

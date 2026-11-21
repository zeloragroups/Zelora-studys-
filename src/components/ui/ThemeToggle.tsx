import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const { theme, toggleTheme, allowPersonalThemePreference } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!allowPersonalThemePreference}
      aria-label={
        !allowPersonalThemePreference
          ? 'Theme follows centre default (locked by Administrator)'
          : isDark
            ? 'Switch to light theme'
            : 'Switch to dark theme'
      }
      title={
        !allowPersonalThemePreference
          ? 'Theme follows centre default (locked by Administrator)'
          : undefined
      }
      className={cn(
        'inline-flex items-center justify-center gap-2 min-h-[40px] rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap shrink-0',
        'border border-[var(--border)] bg-[var(--surface)] dark:bg-[var(--surface-secondary)]',
        'text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] dark:hover:bg-[var(--surface-elevated)]',
        'transition-colors duration-150',
        allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        className
      )}
    >
      {isDark ? (
        <Sun className="w-4 h-4 shrink-0 text-[var(--accent)]" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 shrink-0 text-[var(--text-primary)]" strokeWidth={1.75} aria-hidden="true" />
      )}
      {!compact && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
    </button>
  );
}

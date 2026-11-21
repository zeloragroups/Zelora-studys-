import { motion } from 'motion/react';
import type { BottomNavSlot } from '../../config/navigation';
import { cn } from '../../utils/cn';
import { NavIcon } from './NavIcon';

interface BottomNavBarProps {
  slots: BottomNavSlot[];
  activeNavId: string;
  onSelectNav: (navId: string) => void;
}

/**
 * Mobile & tablet 5-slot bottom navigation bar.
 * Position 3 (exact middle) is always the slightly elevated Home destination.
 * Adapts dynamically across Dark/Light mode and all 10 Luxury Academic accent palettes.
 */
export function BottomNavBar({
  slots,
  activeNavId,
  onSelectNav,
}: BottomNavBarProps) {
  return (
    <nav
      aria-label="Primary mobile navigation"
      className={cn(
        'lg:hidden fixed bottom-0 inset-x-0 z-30',
        'bg-[var(--surface)]/95 backdrop-blur-md',
        'border-t border-[var(--border)]',
        'shadow-[0_-4px_18px_rgba(23,25,29,0.08)] dark:shadow-[0_-6px_24px_rgba(0,0,0,0.45)]',
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div className="max-w-xl mx-auto grid grid-cols-5 items-end h-16 px-1.5">
        {slots.slice(0, 5).map((slot, idx) => {
          const isActive = slot.navId === activeNavId;
          const isCenterHome = Boolean(slot.isHome) || idx === 2;

          if (isCenterHome) {
            return (
              <div key={slot.navId} className="flex flex-col items-center justify-end pb-1.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onSelectNav(slot.navId)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label="Home"
                  className={cn(
                    '-mt-4 flex flex-col items-center justify-center gap-0.5 cursor-pointer group',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-2xl'
                  )}
                >
                  <span
                    className={cn(
                      'w-12 h-11 rounded-2xl inline-flex items-center justify-center transition-all duration-150',
                      'ring-4 ring-[var(--surface)]',
                      isActive
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_6px_18px_rgba(23,25,29,0.28)]'
                        : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent-text)]'
                    )}
                  >
                    <NavIcon name={slot.icon} className="w-[22px] h-[22px]" />
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-none tracking-tight font-semibold transition-colors',
                      isActive ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'
                    )}
                  >
                    {slot.label}
                  </span>
                </motion.button>
              </div>
            );
          }

          return (
            <button
              key={slot.navId}
              type="button"
              onClick={() => onSelectNav(slot.navId)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 min-h-[52px] py-1.5 px-1 rounded-xl cursor-pointer transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
                isActive
                  ? 'text-[var(--accent-text)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-0.5 w-6 h-0.5 rounded-full bg-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
              <NavIcon
                name={slot.icon}
                className={cn(
                  'w-[21px] h-[21px] shrink-0',
                  isActive ? 'text-[var(--accent-text)]' : ''
                )}
              />
              <span
                className={cn(
                  'text-[11px] leading-none tracking-tight truncate max-w-full',
                  isActive ? 'font-semibold' : 'font-medium'
                )}
              >
                {slot.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

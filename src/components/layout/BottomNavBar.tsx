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
 * Position 3 (exact middle) is always the elevated, distinctly recognizable Home destination.
 * Fits cleanly within safe-area insets and respects compact height <= 15% vh.
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
        'bg-white/95 dark:bg-[#171D34]/95 backdrop-blur-md',
        'border-t border-[#E5E7EF] dark:border-[#303A55]',
        'shadow-[0_-4px_20px_rgba(23,23,43,0.06)] dark:shadow-[0_-6px_24px_rgba(16,20,38,0.55)]',
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
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7552D9] dark:focus-visible:outline-[#8B5CF6] rounded-2xl'
                  )}
                >
                  <span
                    className={cn(
                      'w-12 h-11 rounded-2xl inline-flex items-center justify-center transition-all duration-150',
                      'ring-4 ring-white dark:ring-[#171D34]',
                      isActive
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-[0_6px_18px_rgba(117,82,217,0.34)] dark:shadow-[0_6px_20px_rgba(139,92,246,0.45)]'
                        : 'bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#C4B5FD] border border-[#7552D9]/25 dark:border-[#8B5CF6]/40 group-hover:bg-[#E7E1F9] dark:group-hover:bg-[#2A3457]'
                    )}
                  >
                    <NavIcon name={slot.icon} className="w-5 h-5" />
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-none tracking-tight font-semibold transition-colors',
                      isActive
                        ? 'text-[#7552D9] dark:text-[#C4B5FD]'
                        : 'text-[#687086] dark:text-[#A6B0C3]'
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
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7552D9] dark:focus-visible:outline-[#8B5CF6]',
                isActive
                  ? 'text-[#7552D9] dark:text-[#C4B5FD]'
                  : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-0.5 w-6 h-0.5 rounded-full bg-[#7552D9] dark:bg-[#8B5CF6]"
                  aria-hidden="true"
                />
              )}
              <NavIcon name={slot.icon} className="w-[19px] h-[19px] shrink-0" />
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

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
 * Uses Scholars Academy Charcoal + Mint + Crisp White / Dark Navy-Slate tokens.
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
        'bg-white/95 dark:bg-[#1D2429]/95 backdrop-blur-md',
        'border-t border-[#E2E8E5] dark:border-[#344047]',
        'shadow-[0_-4px_18px_rgba(23,29,33,0.06)] dark:shadow-[0_-6px_24px_rgba(0,0,0,0.45)]',
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
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9] rounded-2xl'
                  )}
                >
                  <span
                    className={cn(
                      'w-12 h-11 rounded-2xl inline-flex items-center justify-center transition-all duration-150',
                      'ring-4 ring-white dark:ring-[#1D2429]',
                      isActive
                        ? 'bg-[#20262B] text-[#35D6A0] dark:bg-[#42DDA9] dark:text-[#151A1E] shadow-[0_6px_16px_rgba(23,29,33,0.22)] dark:shadow-[0_6px_18px_rgba(66,221,169,0.28)]'
                        : 'bg-[#F0F4F2] dark:bg-[#252E33] text-[#343C42] dark:text-[#AAB6B4] border border-[#E2E8E5] dark:border-[#344047] group-hover:bg-[#DDF8EE] group-hover:text-[#168A63] dark:group-hover:bg-[#244B3E] dark:group-hover:text-[#42DDA9]'
                    )}
                  >
                    <NavIcon name={slot.icon} className="w-[22px] h-[22px]" />
                  </span>
                  <span
                    className={cn(
                      'text-[11px] leading-none tracking-tight font-semibold transition-colors',
                      isActive
                        ? 'text-[#171D21] dark:text-[#42DDA9]'
                        : 'text-[#68737C] dark:text-[#AAB6B4]'
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
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
                isActive
                  ? 'text-[#171D21] dark:text-[#42DDA9]'
                  : 'text-[#68737C] dark:text-[#AAB6B4] hover:text-[#20262B] dark:hover:text-[#F4F7F6]'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-0.5 w-6 h-0.5 rounded-full bg-[#35D6A0] dark:bg-[#42DDA9]"
                  aria-hidden="true"
                />
              )}
              <NavIcon
                name={slot.icon}
                className={cn(
                  'w-[21px] h-[21px] shrink-0',
                  isActive ? 'text-[#168A63] dark:text-[#42DDA9]' : ''
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

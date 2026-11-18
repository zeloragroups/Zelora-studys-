import { useMemo, useState, type ReactNode } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { BottomNavSlot, NavItemConfig } from '../../config/navigation';
import type { AuthPrincipal, LogoConfiguration } from '../../types';
import { cn } from '../../utils/cn';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { ThemeToggle } from '../ui/ThemeToggle';
import { BottomNavBar } from './BottomNavBar';
import { NavIcon } from './NavIcon';

interface ResponsiveShellProps {
  brandName: string;
  logoConfiguration?: LogoConfiguration;
  interfaceTitle: string;
  navItems: NavItemConfig[];
  bottomNav?: BottomNavSlot[];
  activeNavId: string;
  onSelectNav: (id: string) => void;
  onSwitchInterface?: () => void;
  switchActionLabel?: string;
  authenticatedPrincipal?: AuthPrincipal | null;
  onSignOut?: () => void;
  headerRightExtra?: ReactNode;
  children: ReactNode;
  showBottomThumbBar?: boolean;
}

/**
 * Shared responsive shell across Admin Portal, Teacher Portal, and Student Portal.
 * - Desktop (>=1024px): Fixed 264px left sidebar with grouped navigation + clean top bar.
 * - Mobile/Tablet (<1024px): Compact top bar + slide-over drawer + 5-slot bottom bar centered on Home.
 */
export function ResponsiveShell({
  brandName,
  logoConfiguration,
  interfaceTitle,
  navItems,
  bottomNav,
  activeNavId,
  onSelectNav,
  onSwitchInterface,
  switchActionLabel = 'Switch Portal',
  authenticatedPrincipal,
  onSignOut,
  headerRightExtra,
  children,
  showBottomThumbBar = true,
}: ResponsiveShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNavClick = (id: string) => {
    onSelectNav(id);
    setDrawerOpen(false);
  };

  const groupedNavItems = useMemo(() => {
    const groups: Array<{ group: string; items: NavItemConfig[] }> = [];
    const byGroup = new Map<string, NavItemConfig[]>();
    for (const item of navItems) {
      const key = item.group || 'Workspace';
      if (!byGroup.has(key)) {
        const list: NavItemConfig[] = [];
        byGroup.set(key, list);
        groups.push({ group: key, items: list });
      }
      byGroup.get(key)!.push(item);
    }
    return groups;
  }, [navItems]);

  const effectiveBottomSlots: BottomNavSlot[] = useMemo(() => {
    if (bottomNav && bottomNav.length === 5) {
      return bottomNav;
    }
    return navItems.slice(0, 5).map((item, idx) => ({
      navId: item.id,
      label: item.label,
      icon: item.icon,
      isHome: idx === 2,
    }));
  }, [bottomNav, navItems]);

  const activeItem = navItems.find((item) => item.id === activeNavId);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8F9FC] dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34]">
        <div className="px-5 py-4 border-b border-[#E5E7EF] dark:border-[#303A55]">
          <div className="flex items-center gap-3">
            <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="md" />
            <div className="min-w-0 text-left">
              <span className="block font-display text-sm font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] truncate">
                {brandName}
              </span>
              <span className="block text-xs text-[#687086] dark:text-[#A6B0C3] truncate">
                {interfaceTitle}
              </span>
            </div>
          </div>
        </div>

        <nav
          className="flex-1 px-3 py-4 space-y-5 overflow-y-auto"
          aria-label={`${interfaceTitle} navigation`}
        >
          {groupedNavItems.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <p className="px-3 text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                {group}
              </p>
              {items.map((item) => {
                const active = item.id === activeNavId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 min-h-[40px] px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap',
                      active
                        ? 'bg-[#F1EEFA] text-[#7552D9] dark:bg-[#8B5CF6]/18 dark:text-[#C4B5FD] font-semibold'
                        : 'text-[#434960] hover:bg-[#F8F9FC] hover:text-[#17172B] dark:text-[#A6B0C3] dark:hover:bg-[#202844] dark:hover:text-[#F8FAFC]'
                    )}
                  >
                    <NavIcon
                      name={item.icon}
                      className={cn(
                        'w-4 h-4 shrink-0',
                        active
                          ? 'text-[#7552D9] dark:text-[#A78BFA]'
                          : 'text-[#687086] dark:text-[#A6B0C3]'
                      )}
                    />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-3">
          {authenticatedPrincipal && (
            <button
              type="button"
              onClick={() => {
                if (navItems.some((n) => n.id === 'profile')) {
                  handleNavClick('profile');
                }
              }}
              className="w-full text-left rounded-xl p-2 -mx-2 hover:bg-[#F8F9FC] dark:hover:bg-[#202844] transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                {authenticatedPrincipal.fullName}
              </p>
              <p className="font-mono text-[11px] text-[#687086] dark:text-[#A6B0C3]">
                {authenticatedPrincipal.loginId} · {authenticatedPrincipal.role}
              </p>
            </button>
          )}
          <div className="flex items-center gap-2">
            <ThemeToggle className="flex-1" />
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="min-h-[40px] px-3 py-2 inline-flex items-center justify-center rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#202844] text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#283254] transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (compact single row, 56px) */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 flex items-center justify-between gap-3 border-b border-[#E5E7EF] dark:border-[#303A55] bg-white/95 dark:bg-[#171D34]/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] cursor-pointer"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <span className="lg:hidden inline-flex shrink-0">
                <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="xs" />
              </span>
              <span className="font-display font-semibold text-sm sm:text-base text-[#17172B] dark:text-[#F8FAFC] truncate">
                <span className="lg:hidden">{activeItem?.label ?? interfaceTitle}</span>
                <span className="hidden lg:inline">{interfaceTitle}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerRightExtra}
            <div className="lg:hidden">
              <ThemeToggle compact />
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 rounded-xl text-xs font-medium border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#202844] text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#283254] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
            {onSwitchInterface && !onSignOut && (
              <button
                type="button"
                onClick={onSwitchInterface}
                className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {switchActionLabel}
              </button>
            )}
          </div>
        </header>

        {/* Viewport Content */}
        <main
          className={cn(
            'flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-6xl w-full mx-auto',
            showBottomThumbBar && 'pb-24 lg:pb-8'
          )}
        >
          <motion.div
            key={activeNavId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>

        {/* 5-Slot Bottom Navigation with Central Elevated Home */}
        {showBottomThumbBar && (
          <BottomNavBar
            slots={effectiveBottomSlots}
            activeNavId={activeNavId}
            onSelectNav={handleNavClick}
          />
        )}
      </div>

      {/* Mobile Slide-Over Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 bg-[#101426]/65 backdrop-blur-[1px]"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-72 max-w-[82vw] bg-white dark:bg-[#171D34] h-full flex flex-col border-r border-[#E5E7EF] dark:border-[#303A55]"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-[#E5E7EF] dark:border-[#303A55]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="xs" />
                  <span className="font-display font-bold text-sm truncate text-[#17172B] dark:text-[#F8FAFC]">
                    {brandName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-[#687086] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-5 overflow-y-auto" aria-label="Drawer navigation">
                {groupedNavItems.map(({ group, items }) => (
                  <div key={group} className="space-y-1">
                    <p className="px-3 text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                      {group}
                    </p>
                    {items.map((item) => {
                      const active = item.id === activeNavId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavClick(item.id)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'w-full flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                            active
                              ? 'bg-[#F1EEFA] text-[#7552D9] dark:bg-[#8B5CF6]/18 dark:text-[#C4B5FD] font-semibold'
                              : 'text-[#434960] hover:bg-[#F8F9FC] dark:text-[#A6B0C3] dark:hover:bg-[#202844]'
                          )}
                        >
                          <NavIcon
                            name={item.icon}
                            className={cn(
                              'w-4 h-4 shrink-0',
                              active
                                ? 'text-[#7552D9] dark:text-[#A78BFA]'
                                : 'text-[#687086] dark:text-[#A6B0C3]'
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-3">
                {authenticatedPrincipal && (
                  <div className="text-xs">
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                      {authenticatedPrincipal.fullName}
                    </p>
                    <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
                      {authenticatedPrincipal.loginId} · {authenticatedPrincipal.role}
                    </p>
                  </div>
                )}
                <ThemeToggle className="w-full" />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

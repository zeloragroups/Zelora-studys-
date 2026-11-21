import { useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, LogOut, Menu, UserCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { BottomNavSlot, NavItemConfig } from '../../config/navigation';
import type { AuthPrincipal, LogoConfiguration } from '../../types';
import { cn } from '../../utils/cn';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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
  authenticatedPrincipal?: AuthPrincipal | null;
  onSignOut?: () => void;
  headerRightExtra?: ReactNode;
  children: ReactNode;
  showBottomThumbBar?: boolean;
}

/**
 * Shared responsive application shell across Admin, Teacher, and Student portals.
 * - Desktop (>=1024px): 264px left sidebar with Luxury Academic active highlight + crisp top breadcrumb bar.
 * - Mobile/Tablet (<1024px): Compact 56px top bar + slide-over drawer + 5-slot bottom bar centered on Home.
 * - Preserves top-right ThemeToggle (mobile/tablet) and Profile button without Logout or Back buttons.
 */
export function ResponsiveShell({
  brandName,
  logoConfiguration,
  interfaceTitle,
  navItems,
  bottomNav,
  activeNavId,
  onSelectNav,
  authenticatedPrincipal,
  onSignOut,
  headerRightExtra,
  children,
  showBottomThumbBar = true,
}: ResponsiveShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleRequestSignOut = () => {
    setDrawerOpen(false);
    setConfirmSignOutOpen(true);
  };

  const handleConfirmSignOut = async () => {
    if (!onSignOut) {
      setConfirmSignOutOpen(false);
      return;
    }
    setSigningOut(true);
    try {
      await Promise.resolve(onSignOut());
    } finally {
      setSigningOut(false);
      setConfirmSignOutOpen(false);
    }
  };

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
  const hasProfileSection = navItems.some((item) => item.id === 'profile');
  const isProfileActive = activeNavId === 'profile';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--background)] text-[var(--text-primary)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[264px] lg:shrink-0 border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="md" />
            <div className="min-w-0 text-left">
              <span className="block font-display text-sm font-bold tracking-[0.06em] uppercase text-[var(--text-primary)] truncate">
                {brandName}
              </span>
              <span className="block text-xs text-[var(--text-secondary)] truncate">
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
              <p className="px-3 pb-0.5 text-[11px] font-medium text-[var(--text-muted)]">
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
                      'w-full flex items-center gap-2.5 min-h-[42px] px-3 py-2 rounded-xl text-sm transition-colors duration-150 cursor-pointer whitespace-nowrap border',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
                      active
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--text-primary)] font-semibold'
                        : 'border-transparent text-[var(--text-secondary)] font-medium hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <NavIcon
                      name={item.icon}
                      className={cn(
                        'w-[21px] h-[21px] shrink-0',
                        active ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'
                      )}
                    />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[var(--border)] space-y-3">
          {authenticatedPrincipal && (
            <button
              type="button"
              onClick={() => {
                if (hasProfileSection) {
                  handleNavClick('profile');
                }
              }}
              className="w-full text-left rounded-xl p-2 -mx-2 hover:bg-[var(--surface-secondary)] transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {authenticatedPrincipal.fullName}
              </p>
              <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                {authenticatedPrincipal.loginId} · {authenticatedPrincipal.role}
              </p>
            </button>
          )}
          <div className="space-y-2.5">
            <ThemeToggle className="w-full" />
            {onSignOut && (
              <button
                type="button"
                onClick={handleRequestSignOut}
                aria-label="Sign Out"
                className={cn(
                  'w-full min-h-[42px] px-3.5 py-2 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold',
                  'border border-[var(--error-border)] bg-[var(--error-soft)]/80',
                  'text-[var(--error)] hover:bg-[var(--error-soft)]',
                  'transition-all duration-150 active:scale-[0.985] cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--error)]'
                )}
              >
                <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (compact single row, 56px) */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-11 h-11 -ml-2 rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] cursor-pointer"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <span className="lg:hidden inline-flex shrink-0">
                <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="xs" />
              </span>
              <span className="lg:hidden font-display font-semibold text-sm sm:text-base text-[var(--text-primary)] truncate">
                {activeItem?.label ?? interfaceTitle}
              </span>
              <div className="hidden lg:flex items-center gap-1.5 text-sm min-w-0">
                <span className="font-display font-semibold text-[var(--text-primary)] whitespace-nowrap">
                  {interfaceTitle}
                </span>
                {activeItem && (
                  <>
                    <ChevronRight
                      className="w-4 h-4 text-[var(--text-muted)] shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-[var(--text-secondary)] truncate">
                      {activeItem.label}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerRightExtra}
            <div className="lg:hidden">
              <ThemeToggle compact />
            </div>
            {hasProfileSection && (
              <button
                type="button"
                onClick={() => handleNavClick('profile')}
                aria-label="Profile"
                aria-current={isProfileActive ? 'page' : undefined}
                title="Profile"
                className={cn(
                  'min-h-[40px] px-2.5 sm:px-3 py-2 inline-flex items-center gap-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                  isProfileActive
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                    : 'border-[var(--border)] bg-[var(--surface)] dark:bg-[var(--surface-secondary)] text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] dark:hover:bg-[var(--surface-elevated)]'
                )}
              >
                <UserCircle2
                  className={cn(
                    'w-4 h-4 shrink-0',
                    isProfileActive ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'
                  )}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Profile</span>
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
              className="fixed inset-0 bg-[#17191D]/70 backdrop-blur-[1px]"
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-72 max-w-[82vw] bg-[var(--surface)] h-full flex flex-col border-r border-[var(--border)]"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <BrandLogoMark logoConfiguration={logoConfiguration} alt={brandName} size="xs" />
                  <span className="font-display font-bold tracking-[0.05em] uppercase text-sm truncate text-[var(--text-primary)]">
                    {brandName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-10 h-10 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] cursor-pointer"
                >
                  <X className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-5 overflow-y-auto" aria-label="Drawer navigation">
                {groupedNavItems.map(({ group, items }) => (
                  <div key={group} className="space-y-1">
                    <p className="px-3 text-[11px] font-medium text-[var(--text-muted)]">
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
                            'w-full flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer border',
                            active
                              ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--text-primary)] font-semibold'
                              : 'border-transparent text-[var(--text-secondary)] font-medium hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          <NavIcon
                            name={item.icon}
                            className={cn(
                              'w-[21px] h-[21px] shrink-0',
                              active ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="p-4 border-t border-[var(--border)] space-y-3">
                {authenticatedPrincipal && (
                  <div className="text-xs">
                    <p className="font-semibold text-[var(--text-primary)] truncate">
                      {authenticatedPrincipal.fullName}
                    </p>
                    <p className="font-mono text-[var(--text-secondary)]">
                      {authenticatedPrincipal.loginId} · {authenticatedPrincipal.role}
                    </p>
                  </div>
                )}
                <ThemeToggle className="w-full" />
                {onSignOut && (
                  <button
                    type="button"
                    onClick={handleRequestSignOut}
                    aria-label="Sign Out"
                    className={cn(
                      'w-full min-h-[44px] px-3.5 py-2 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold',
                      'border border-[var(--error-border)] bg-[var(--error-soft)]/80',
                      'text-[var(--error)] hover:bg-[var(--error-soft)]',
                      'transition-all duration-150 active:scale-[0.985] cursor-pointer',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--error)]'
                    )}
                  >
                    <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {onSignOut && (
        <ConfirmDialog
          open={confirmSignOutOpen}
          onClose={() => {
            if (!signingOut) setConfirmSignOutOpen(false);
          }}
          onConfirm={handleConfirmSignOut}
          title="Sign Out of Your Account?"
          description={`You will be signed out of ${brandName} on this device and redirected to the sign-in screen.`}
          cancelLabel="Cancel"
          confirmLabel="Sign Out"
          confirmVariant="danger"
          tone="danger"
          loading={signingOut}
        />
      )}
    </div>
  );
}

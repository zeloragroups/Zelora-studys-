import type { ComponentType, ReactNode } from 'react';
import { ArrowLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SearchInput } from '../ui/SearchInput';

export interface SettingsCategoryItem<T extends string = string> {
  id: T;
  title: string;
  description: string;
  summary?: string;
  group?: string;
  keywords?: string[];
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface SettingsShellProps<T extends string = string> {
  eyebrow: string;
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
  alerts?: ReactNode;
  categories: SettingsCategoryItem<T>[];
  activeCategoryId: T | null;
  onSelectCategory: (id: T | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean;
  renderCategoryContent: (categoryId: T) => ReactNode;
}

/**
 * Shared Settings navigation container implementing Overview Directory -> Dedicated Category Detail View.
 * Never mixes all configuration controls onto a single crowded page.
 */
export function SettingsShell<T extends string = string>({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  alerts,
  categories,
  activeCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  loading = false,
  renderCategoryContent,
}: SettingsShellProps<T>) {
  const activeCategory = activeCategoryId
    ? categories.find((cat) => cat.id === activeCategoryId) ?? null
    : null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCategories = normalizedQuery
    ? categories.filter((cat) => {
        const haystack = [
          cat.title,
          cat.description,
          cat.summary ?? '',
          cat.group ?? '',
          ...(cat.keywords ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : categories;

  const groupedFiltered = filteredCategories.reduce<
    Array<{ group: string; items: SettingsCategoryItem<T>[] }>
  >((acc, item) => {
    const groupName = item.group ?? 'Settings';
    const existing = acc.find((g) => g.group === groupName);
    if (existing) {
      existing.items.push(item);
    } else {
      acc.push({ group: groupName, items: [item] });
    }
    return acc;
  }, []);

  if (activeCategory) {
    const ActiveIcon = activeCategory.icon;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectCategory(null)}
            iconLeft={<ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          >
            Back to Settings
          </Button>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>

        <header className="flex items-start gap-3.5 pb-3 border-b border-[var(--border)]">
          <span className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent-text)] inline-flex items-center justify-center shrink-0">
            <ActiveIcon className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              {activeCategory.group ?? 'Settings'} · {eyebrow}
            </p>
            <h1 className="mt-0.5 text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
              {activeCategory.title}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              {activeCategory.description}
            </p>
          </div>
        </header>

        {alerts}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((idx) => (
              <div
                key={idx}
                className="h-44 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
            <nav
              aria-label="Settings categories"
              className="hidden lg:block lg:col-span-4 xl:col-span-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 space-y-1 sticky top-20"
            >
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = cat.id === activeCategory.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    aria-current={isSelected ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 min-h-[42px] px-3 py-2 rounded-xl text-left text-xs transition-colors duration-150 cursor-pointer border',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
                      isSelected
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--text-primary)] font-semibold'
                        : 'border-transparent text-[var(--text-secondary)] font-medium hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isSelected
                          ? 'text-[var(--accent-text)]'
                          : 'text-[var(--text-muted)]'
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{cat.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="lg:col-span-8 xl:col-span-9 min-w-0 space-y-6">
              {renderCategoryContent(activeCategory.id)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        rightSlot={rightSlot}
      />

      {alerts}

      <div className="max-w-md">
        <SearchInput
          value={searchQuery}
          onValueChange={onSearchChange}
          placeholder="Search settings by name or topic…"
          aria-label="Search settings categories"
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-24 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
            />
          ))}
        </div>
      ) : groupedFiltered.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontal className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />}
          title="No matching settings found"
          description={`No settings categories match "${searchQuery}". Try another keyword or clear your filter.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => onSearchChange('')}>
              Clear Search
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groupedFiltered.map(({ group, items }) => (
            <section key={group} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectCategory(cat.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3.5 rounded-2xl border border-[var(--border)]',
                        'bg-[var(--surface)] hover:bg-[var(--surface-secondary)]',
                        'hover:border-[var(--accent-border)] p-4 sm:p-5 text-left transition-colors duration-150 cursor-pointer group',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
                      )}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-[var(--surface-secondary)] group-hover:bg-[var(--accent-soft)] border border-[var(--border)] group-hover:border-[var(--accent-border)] text-[var(--text-secondary)] group-hover:text-[var(--accent-text)] inline-flex items-center justify-center shrink-0 transition-colors">
                          <Icon className="w-5 h-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                            {cat.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                            {cat.description}
                          </p>
                          {cat.summary && (
                            <p className="mt-1.5 text-[11px] font-medium text-[var(--accent-text)] truncate">
                              {cat.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-text)] shrink-0 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

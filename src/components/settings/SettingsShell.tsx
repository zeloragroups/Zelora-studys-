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

        <header className="flex items-start gap-3.5 pb-2 border-b border-[#E2E8E5] dark:border-[#344047]">
          <span className="w-11 h-11 rounded-xl bg-[#DDF8EE] dark:bg-[#244B3E] border border-[#B8EBD8] dark:border-[#316453] text-[#168A63] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
            <ActiveIcon className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
              {activeCategory.group ?? 'Settings'} · {eyebrow}
            </p>
            <h1 className="mt-0.5 text-xl sm:text-2xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] text-balance">
              {activeCategory.title}
            </h1>
            <p className="mt-1 text-sm text-[#68737C] dark:text-[#AAB6B4] max-w-2xl leading-relaxed">
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
                className="h-44 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33]/70 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
            <nav
              aria-label="Settings categories"
              className="hidden lg:block lg:col-span-4 xl:col-span-3 rounded-2xl border border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#1D2429] p-2 space-y-1 sticky top-20"
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
                      'w-full flex items-center gap-2.5 min-h-[42px] px-3 py-2 rounded-xl text-left text-xs transition-colors duration-150 cursor-pointer',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]',
                      isSelected
                        ? 'bg-[#20262B] text-[#F4F7F6] font-semibold dark:bg-[#244B3E] dark:text-[#F4F7F6]'
                        : 'text-[#343C42] font-medium hover:bg-[#F0F4F2] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:bg-[#252E33] dark:hover:text-[#F4F7F6]'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isSelected
                          ? 'text-[#35D6A0] dark:text-[#42DDA9]'
                          : 'text-[#68737C] dark:text-[#AAB6B4]'
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
              className="h-24 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33]/70 animate-pulse"
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
              <h2 className="text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4]">
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
                        'w-full flex items-center justify-between gap-3.5 rounded-2xl border border-[#E2E8E5] dark:border-[#344047]',
                        'bg-white dark:bg-[#1D2429] hover:bg-[#F7F9F8] dark:hover:bg-[#252E33]/80',
                        'hover:border-[#B8EBD8] dark:hover:border-[#316453] p-4 sm:p-5 text-left transition-colors duration-150 cursor-pointer group',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]'
                      )}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-[#F0F4F2] dark:bg-[#252E33] group-hover:bg-[#DDF8EE] dark:group-hover:bg-[#244B3E] text-[#343C42] dark:text-[#AAB6B4] group-hover:text-[#168A63] dark:group-hover:text-[#42DDA9] inline-flex items-center justify-center shrink-0 transition-colors">
                          <Icon className="w-5 h-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] leading-snug">
                            {cat.title}
                          </p>
                          <p className="mt-1 text-xs text-[#68737C] dark:text-[#AAB6B4] leading-relaxed line-clamp-2">
                            {cat.description}
                          </p>
                          {cat.summary && (
                            <p className="mt-1.5 text-[11px] font-medium text-[#168A63] dark:text-[#42DDA9] truncate">
                              {cat.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="w-4 h-4 text-[#68737C] dark:text-[#AAB6B4] group-hover:text-[#168A63] dark:group-hover:text-[#42DDA9] shrink-0 transition-transform group-hover:translate-x-0.5"
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

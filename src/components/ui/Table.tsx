import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  mobileCardRender?: (row: T) => ReactNode;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'No records available',
  emptyDescription = 'Records will appear here once added.',
  emptyAction,
  mobileCardRender,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="Loading table rows">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="h-12 w-full rounded-xl bg-[#F1EEFA] dark:bg-[#202844]/80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center">
        <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
          {emptyTitle}
        </p>
        <p className="mt-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
          {emptyDescription}
        </p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <>
      {mobileCardRender && (
        <div className="md:hidden space-y-3">
          {rows.map((row) => (
            <div
              key={rowKey(row)}
              className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/60 p-4"
            >
              {mobileCardRender(row)}
            </div>
          ))}
        </div>
      )}

      <div className={cn('overflow-x-auto -mx-5 sm:mx-0', mobileCardRender && 'hidden md:block')}>
        <div className="inline-block min-w-full align-middle px-5 sm:px-0">
          <table className="min-w-full divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'py-3 px-3 text-xs font-semibold text-[#687086] dark:text-[#A6B0C3] whitespace-nowrap',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EF]/75 dark:divide-[#303A55]/75">
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="hover:bg-[#F8F9FC] dark:hover:bg-[#202844]/60 transition-colors duration-150"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'py-3 px-3 text-[#17172B] dark:text-[#F8FAFC] align-middle',
                        col.align === 'right' ? 'text-right tabular-nums font-mono' : 'text-left'
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

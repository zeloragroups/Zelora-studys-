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
            className="h-12 w-full rounded-xl bg-[#F0F4F2] dark:bg-[#252E33] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8]/60 dark:bg-[#151A1E]/40 p-8 text-center">
        <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
          {emptyTitle}
        </p>
        <p className="mt-1 text-xs text-[#68737C] dark:text-[#AAB6B4] max-w-md mx-auto">
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
              className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/70 p-4"
            >
              {mobileCardRender(row)}
            </div>
          ))}
        </div>
      )}

      <div className={cn('overflow-x-auto -mx-5 sm:mx-0', mobileCardRender && 'hidden md:block')}>
        <div className="inline-block min-w-full align-middle px-5 sm:px-0">
          <table className="min-w-full divide-y divide-[#E2E8E5] dark:divide-[#344047] text-sm">
            <thead>
              <tr className="bg-[#F0F4F2]/80 dark:bg-[#252E33]/80">
                {columns.map((col, idx) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'py-3 px-3.5 text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4] whitespace-nowrap',
                      idx === 0 && 'rounded-l-lg',
                      idx === columns.length - 1 && 'rounded-r-lg',
                      col.align === 'right' ? 'text-right' : 'text-left'
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E5]/80 dark:divide-[#344047]/80">
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="hover:bg-[#F7F9F8] dark:hover:bg-[#252E33]/55 transition-colors duration-150"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'py-3.5 px-3.5 text-[#171D21] dark:text-[#F4F7F6] align-middle',
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

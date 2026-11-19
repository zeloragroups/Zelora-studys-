import { useCallback, useEffect, useState } from 'react';
import { Eye, KeyRound, Pencil, Plus, Power, Search, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accountService, isFirebaseConnectedMode } from '../../services';
import type {
  AccountOverviewStats,
  AccountRecord,
  DemoClassOption,
  ManagedAccountRole,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { CreateAccountModal } from './CreateAccountModal';
import { AccountDetailsModal } from './AccountDetailsModal';
import { EditAccountModal } from './EditAccountModal';
import {
  AccountStatusConfirmDialog,
  PasswordResetDemoDialog,
} from './AccountActionDialogs';

type AccountFilterTab = 'all' | 'teachers' | 'students' | 'inactive';

export function AccountManagementModule() {
  const { principal } = useAuth();

  const [activeTab, setActiveTab] = useState<AccountFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [overview, setOverview] = useState<AccountOverviewStats | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [classOptions, setClassOptions] = useState<DemoClassOption[]>([]);

  const [createRoleModal, setCreateRoleModal] = useState<ManagedAccountRole | null>(null);
  const [detailAccount, setDetailAccount] = useState<AccountRecord | null>(null);
  const [editAccount, setEditAccount] = useState<AccountRecord | null>(null);
  const [statusDialogAccount, setStatusDialogAccount] = useState<AccountRecord | null>(null);
  const [resetDialogAccount, setResetDialogAccount] = useState<AccountRecord | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const roleFilter =
        activeTab === 'teachers'
          ? 'teacher'
          : activeTab === 'students'
            ? 'student'
            : 'all';
      const statusFilter = activeTab === 'inactive' ? 'deactivated' : 'all';

      const [overviewRes, listRes, demoClasses] = await Promise.all([
        accountService.getAccountOverview(principal),
        accountService.listAccounts(principal, {
          role: roleFilter,
          status: statusFilter,
          searchQuery,
        }),
        accountService.getDemoClassOptions(principal),
      ]);

      setOverview(overviewRes);
      setAccounts(listRes);
      setClassOptions(demoClasses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load account records.');
    } finally {
      setLoading(false);
    }
  }, [principal, activeTab, searchQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-red-700 dark:text-red-400">
          Only authenticated Admin accounts can access Account Management.
        </p>
      </Card>
    );
  }

  const handleClearFilters = () => {
    setActiveTab('all');
    setSearchQuery('');
  };

  const hasFilters = activeTab !== 'all' || searchQuery.trim().length > 0;

  const columns: TableColumn<AccountRecord>[] = [
    {
      key: 'accountId',
      header: 'Account ID',
      render: (row) => (
        <button
          type="button"
          onClick={() => setDetailAccount(row)}
          className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
        >
          {row.accountId}
        </button>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
          {row.email && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
              {row.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Type',
      render: (row) => (
        <span className="capitalize text-xs font-medium text-slate-700 dark:text-slate-300">
          {row.role}
        </span>
      ),
    },
    {
      key: 'classBatch',
      header: 'Class & Batch',
      render: (row) =>
        row.role === 'student' ? (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {row.className ?? '—'} · {row.batchName ?? '—'}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => <span className="font-mono text-xs">{row.phone}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusText
          tone={row.status === 'active' ? 'nominal' : 'danger'}
          label={row.status === 'active' ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {formatShortDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setDetailAccount(row)}
            title="View details"
            aria-label={`View details for ${row.accountId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setEditAccount(row)}
            title="Edit account"
            aria-label={`Edit ${row.accountId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setResetDialogAccount(row)}
            title={isFirebaseConnectedMode() ? 'Password reset procedure' : 'Initiate password reset (Demo)'}
            aria-label={`Reset password for ${row.accountId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setStatusDialogAccount(row)}
            title={row.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Reactivate'} ${row.accountId}`}
            className={cn(
              'w-8 h-8 inline-flex items-center justify-center rounded-lg cursor-pointer transition-colors',
              row.status === 'active'
                ? 'text-[#D94C5C] hover:bg-[#D94C5C]/10 dark:text-[#F16B75] dark:hover:bg-[#F16B75]/15'
                : 'text-[#168A62] hover:bg-[#168A62]/10 dark:text-[#22C58B] dark:hover:bg-[#22C58B]/15'
            )}
          >
            <Power className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Admin Account Management · {isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Development Adapter'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
            Teacher & Student Accounts
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateRoleModal('teacher')}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            New Teacher
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateRoleModal('student')}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            New Student
          </Button>
        </div>
      </div>

      {toastMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200"
        >
          {toastMessage}
        </div>
      )}

      {/* Overview KPIs */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Total Teachers" value={overview.totalTeachers} caption={isFirebaseConnectedMode() ? 'Firestore account records' : 'Demo records'} />
          <StatTile label="Total Students" value={overview.totalStudents} caption="Shared parent access" />
          <StatTile label="Active Accounts" value={overview.activeAccounts} caption="Eligible to sign in" />
          <StatTile label="Inactive Accounts" value={overview.inactiveAccounts} caption="Access blocked" />
        </div>
      )}

      {/* Directory & Filters */}
      <Card
        title="Account Directory"
        subtitle="Search by exact Account ID (e.g. TCH-0001, STU-0001) or name."
      >
        <div className="space-y-5">
          {/* Tabs & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844]"
              role="tablist"
              aria-label="Account category filters"
            >
              {(
                [
                  { id: 'all', label: 'All Accounts' },
                  { id: 'teachers', label: 'Teachers' },
                  { id: 'students', label: 'Students' },
                  { id: 'inactive', label: 'Inactive' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                      active
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
                        : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 w-full md:w-72">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID or name..."
                  aria-label="Search accounts by ID or name"
                  className="w-full min-h-[40px] rounded-xl pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                />
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  aria-label="Clear filters"
                  className="min-h-[40px] px-2.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table
              columns={columns}
              rows={accounts}
              rowKey={(row) => row.accountId}
              loading={loading}
              emptyTitle="No matching accounts found"
              emptyDescription={
                hasFilters
                  ? 'Try clearing your search or switching account tabs.'
                  : 'Create a Teacher or Student account to get started.'
              }
              emptyAction={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </div>

          {/* Mobile Responsive List */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse"
                  />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-3">
                <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">No matching accounts found</p>
                {hasFilters && (
                  <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              accounts.map((acc) => (
                <div
                  key={acc.accountId}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-3 bg-white dark:bg-[#101426]/65"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => setDetailAccount(acc)}
                        className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
                      >
                        {acc.accountId}
                      </button>
                      <p className="mt-0.5 font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        {acc.name}
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3] capitalize">
                        {acc.role}
                        {acc.role === 'student' && acc.className
                          ? ` · ${acc.className} · ${acc.batchName ?? ''}`
                          : ''}
                      </p>
                    </div>
                    <StatusText
                      tone={acc.status === 'active' ? 'nominal' : 'danger'}
                      label={acc.status === 'active' ? 'Active' : 'Inactive'}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E7EF] dark:border-[#303A55] text-xs text-[#687086] dark:text-[#A6B0C3]">
                    <span className="font-mono">{acc.phone}</span>
                    <span>{formatShortDate(acc.createdAt)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDetailAccount(acc)}
                    >
                      Details
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditAccount(acc)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={acc.status === 'active' ? 'danger' : 'primary'}
                      size="sm"
                      onClick={() => setStatusDialogAccount(acc)}
                    >
                      {acc.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Recently Created Accounts */}
      {overview && overview.recentAccounts.length > 0 && (
        <Card
          title="Recently Created Accounts"
          subtitle={isFirebaseConnectedMode() ? 'Latest provisioned IDs in Cloud Firestore' : 'Latest provisioned IDs in the local development adapter'}
          padding="sm"
        >
          <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
            {overview.recentAccounts.map((acc) => (
              <li key={acc.accountId} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailAccount(acc)}
                    className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
                  >
                    {acc.accountId}
                  </button>
                  <span className="font-medium text-[#17172B] dark:text-[#F8FAFC]">{acc.name}</span>
                  <span className="text-xs text-[#687086] dark:text-[#A6B0C3] capitalize">
                    {acc.role}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                  {formatShortDate(acc.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Modals */}
      <CreateAccountModal
        open={createRoleModal !== null}
        role={createRoleModal ?? 'student'}
        actor={principal}
        accountService={accountService}
        classOptions={classOptions}
        onClose={() => setCreateRoleModal(null)}
        onCreated={(created) => {
          showToast(`Created ${created.role} account ${created.accountId} (${created.name}).`);
          void loadData();
        }}
      />

      <AccountDetailsModal
        open={detailAccount !== null}
        account={detailAccount}
        actor={principal}
        accountService={accountService}
        onClose={() => setDetailAccount(null)}
        onEdit={(acc) => {
          setDetailAccount(null);
          setEditAccount(acc);
        }}
        onToggleStatus={(acc) => {
          setDetailAccount(null);
          setStatusDialogAccount(acc);
        }}
        onInitiateReset={(acc) => {
          setDetailAccount(null);
          setResetDialogAccount(acc);
        }}
      />

      <EditAccountModal
        open={editAccount !== null}
        account={editAccount}
        actor={principal}
        accountService={accountService}
        classOptions={classOptions}
        onClose={() => setEditAccount(null)}
        onUpdated={(updated) => {
          showToast(`Updated profile for ${updated.accountId}.`);
          void loadData();
        }}
      />

      <AccountStatusConfirmDialog
        open={statusDialogAccount !== null}
        account={statusDialogAccount}
        actor={principal}
        accountService={accountService}
        onClose={() => setStatusDialogAccount(null)}
        onCompleted={(updated) => {
          showToast(
            `${updated.accountId} is now ${updated.status === 'active' ? 'active' : 'deactivated'}.`
          );
          void loadData();
        }}
      />

      <PasswordResetDemoDialog
        open={resetDialogAccount !== null}
        account={resetDialogAccount}
        actor={principal}
        accountService={accountService}
        onClose={() => setResetDialogAccount(null)}
        onResetLogged={() => {
          showToast(isFirebaseConnectedMode() ? 'Password reset procedure logged in account audit history.' : 'DEMO ONLY: Password reset event logged in account audit history.');
          void loadData();
        }}
      />
    </div>
  );
}

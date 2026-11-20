import { useCallback, useEffect, useState } from 'react';
import { Eye, KeyRound, Pencil, Plus, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { accountService, isFirebaseConnectedMode } from '../../services';
import type {
  AccountOverviewStats,
  AccountRecord,
  DemoClassOption,
  ManagedAccountRole,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconButton } from '../ui/IconButton';
import { PageHeader } from '../ui/PageHeader';
import { SearchInput } from '../ui/SearchInput';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { Tabs } from '../ui/Tabs';
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
      <Alert tone="error" title="Access Restricted">
        Only authenticated Admin accounts can access Account Management.
      </Alert>
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
          className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer"
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
          <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{row.name}</p>
          {row.email && (
            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] truncate max-w-[180px]">
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
        <span className="capitalize text-xs font-medium text-[#343C42] dark:text-[#D4DDDC]">
          {row.role}
        </span>
      ),
    },
    {
      key: 'classBatch',
      header: 'Class & Batch',
      render: (row) =>
        row.role === 'student' ? (
          <span className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            {row.className ?? '—'} · {row.batchName ?? '—'}
          </span>
        ) : (
          <span className="text-xs text-[#68737C]/60 dark:text-[#AAB6B4]/60">—</span>
        ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.phone}</span>,
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
        <span className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4] whitespace-nowrap">
          {formatShortDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => setDetailAccount(row)}
            label={`View details for ${row.accountId}`}
            title="View details"
            icon={<Eye className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => setEditAccount(row)}
            label={`Edit ${row.accountId}`}
            title="Edit account"
            icon={<Pencil className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => setResetDialogAccount(row)}
            label={`Reset password for ${row.accountId}`}
            title={isFirebaseConnectedMode() ? 'Password reset procedure' : 'Initiate password reset (Demo)'}
            icon={<KeyRound className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant={row.status === 'active' ? 'danger' : 'mint'}
            onClick={() => setStatusDialogAccount(row)}
            label={`${row.status === 'active' ? 'Deactivate' : 'Reactivate'} ${row.accountId}`}
            title={row.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
            icon={<Power className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Admin Account Management · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Development Adapter'}`}
        title="Teacher & Student Accounts"
        subtitle="Create role IDs, inspect profiles, update contact or batch details, and manage sign-in status."
        rightSlot={
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
        }
      />

      {toastMessage && (
        <Alert tone="success" onDismiss={() => setToastMessage(null)}>
          {toastMessage}
        </Alert>
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
            <Tabs
              ariaLabel="Account category filters"
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { id: 'all', label: 'All Accounts' },
                { id: 'teachers', label: 'Teachers' },
                { id: 'students', label: 'Students' },
                { id: 'inactive', label: 'Inactive' },
              ]}
            />

            <div className="flex items-center gap-2 w-full md:w-80">
              <SearchInput
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Search ID or name…"
                aria-label="Search accounts by ID or name"
                containerClassName="flex-1"
              />
              {hasFilters && (
                <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                  Reset
                </Button>
              )}
            </div>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

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
                    className="h-28 rounded-xl bg-[#F0F4F2] dark:bg-[#252E33] animate-pulse"
                  />
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-3">
                <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">No matching accounts found</p>
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
                  className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-3 bg-white dark:bg-[#151A1E]/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => setDetailAccount(acc)}
                        className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer"
                      >
                        {acc.accountId}
                      </button>
                      <p className="mt-0.5 font-medium text-[#171D21] dark:text-[#F4F7F6]">
                        {acc.name}
                      </p>
                      <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] capitalize">
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

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8E5] dark:border-[#344047] text-xs text-[#68737C] dark:text-[#AAB6B4]">
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
          <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
            {overview.recentAccounts.map((acc) => (
              <li key={acc.accountId} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailAccount(acc)}
                    className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer"
                  >
                    {acc.accountId}
                  </button>
                  <span className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{acc.name}</span>
                  <span className="text-xs text-[#68737C] dark:text-[#AAB6B4] capitalize">
                    {acc.role}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#68737C] dark:text-[#AAB6B4]">
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

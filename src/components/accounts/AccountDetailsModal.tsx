import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Pencil, Power } from 'lucide-react';
import type {
  AccountAuditEntry,
  AccountRecord,
  AuthPrincipal,
} from '../../types';
import { isFirebaseConnectedMode } from '../../services';
import type { IAccountManagementService } from '../../services/contracts/accountService';
import { formatShortDate } from '../../utils/formatters';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { StatusText } from '../ui/StatusText';

interface AccountDetailsModalProps {
  open: boolean;
  account: AccountRecord | null;
  actor: AuthPrincipal | null;
  accountService: IAccountManagementService;
  onClose: () => void;
  onEdit: (account: AccountRecord) => void;
  onToggleStatus: (account: AccountRecord) => void;
  onInitiateReset: (account: AccountRecord) => void;
}

export function AccountDetailsModal({
  open,
  account,
  actor,
  accountService,
  onClose,
  onEdit,
  onToggleStatus,
  onInitiateReset,
}: AccountDetailsModalProps) {
  const [auditEntries, setAuditEntries] = useState<AccountAuditEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !account) {
      return;
    }
    setCopied(false);
    void accountService
      .getAccountAuditLog(actor, account.accountId)
      .then((entries) => setAuditEntries(entries))
      .catch(() => setAuditEntries([]));
  }, [open, account, actor, accountService]);

  if (!account) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.accountId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account.name}
      subtitle={`${account.role === 'teacher' ? 'Teacher' : 'Student'} Account · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo Mode'}`}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5E7EF] dark:border-[#303A55]">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-semibold text-[#7552D9] dark:text-[#A78BFA]">
              {account.accountId}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleCopy()}
              iconLeft={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <StatusText
            tone={account.status === 'active' ? 'nominal' : 'danger'}
            label={account.status === 'active' ? 'Active' : 'Deactivated'}
          />
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Account Type</dt>
            <dd className="mt-0.5 font-medium capitalize">{account.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Phone Number</dt>
            <dd className="mt-0.5 font-mono">{account.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Email Address</dt>
            <dd className="mt-0.5">{account.email ?? 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Created On</dt>
            <dd className="mt-0.5 font-mono text-xs">{formatShortDate(account.createdAt)}</dd>
          </div>
          {account.role === 'student' && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Class & Batch</dt>
              <dd className="mt-0.5 font-medium">
                {account.className ?? 'Unassigned'} · {account.batchName ?? 'Unassigned'}
              </dd>
            </div>
          )}
          {account.updatedAt && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Last Updated</dt>
              <dd className="mt-0.5 font-mono text-xs">{formatShortDate(account.updatedAt)}</dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        <div className="pt-4 border-t border-[#E5E7EF] dark:border-[#303A55] flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(account)}
            iconLeft={<Pencil className="w-3.5 h-3.5" />}
          >
            Edit Details
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onInitiateReset(account)}
            iconLeft={<KeyRound className="w-3.5 h-3.5" />}
          >
            Reset Password (Demo)
          </Button>
          <Button
            variant={account.status === 'active' ? 'danger' : 'primary'}
            size="sm"
            onClick={() => onToggleStatus(account)}
            iconLeft={<Power className="w-3.5 h-3.5" />}
          >
            {account.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </Button>
        </div>

        {/* Audit History */}
        <div className="pt-4 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-2.5">
          <h3 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
            Account Activity History (Passwords Never Stored or Shown)
          </h3>
          {auditEntries.length === 0 ? (
            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">No audit entries recorded.</p>
          ) : (
            <ul className="space-y-2 max-h-40 overflow-y-auto text-xs">
              {auditEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E5E7EF] dark:border-[#303A55] last:border-0"
                >
                  <span className="text-slate-700 dark:text-slate-300">{entry.summary}</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                    {formatShortDate(entry.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

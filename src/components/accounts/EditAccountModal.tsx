import { useEffect, useState, type FormEvent } from 'react';
import type { AccountRecord, AuthPrincipal, DemoClassOption } from '../../types';
import {
  validateOptionalEmail,
  validatePersonName,
  validatePhoneNumber,
} from '../../utils/validation';
import {
  AccountServiceError,
  type IAccountManagementService,
} from '../../services/contracts/accountService';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

interface EditAccountModalProps {
  open: boolean;
  account: AccountRecord | null;
  actor: AuthPrincipal | null;
  accountService: IAccountManagementService;
  classOptions: DemoClassOption[];
  onClose: () => void;
  onUpdated: (account: AccountRecord) => void;
}

export function EditAccountModal({
  open,
  account,
  actor,
  accountService,
  classOptions,
  onClose,
  onUpdated,
}: EditAccountModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [classId, setClassId] = useState('');
  const [batchId, setBatchId] = useState('');

  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !account) {
      return;
    }
    setName(account.name);
    setPhone(account.phone);
    setEmail(account.email ?? '');
    setClassId(account.classId ?? classOptions[0]?.id ?? '');
    setBatchId(account.batchId ?? classOptions[0]?.batches[0]?.id ?? '');
    setConfirming(false);
    setSaving(false);
    setFieldErrors({});
    setFormError(null);
  }, [open, account, classOptions]);

  if (!account) {
    return null;
  }

  const isStudent = account.role === 'student';
  const selectedClass = classOptions.find((c) => c.id === classId);
  const availableBatches = selectedClass?.batches ?? [];

  const handleClassChange = (nextClassId: string) => {
    setClassId(nextClassId);
    const cls = classOptions.find((c) => c.id === nextClassId);
    setBatchId(cls?.batches[0]?.id ?? '');
  };

  const handleValidate = (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const nameCheck = validatePersonName(name, 'Name');
    if (!nameCheck.valid) errors.name = nameCheck.error!;
    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) errors.phone = phoneCheck.error!;
    const emailCheck = validateOptionalEmail(email);
    if (!emailCheck.valid) errors.email = emailCheck.error!;
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      setConfirming(true);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await accountService.updateAccountDetails(actor, account.accountId, {
        name,
        phone,
        email: email.trim() || undefined,
        ...(isStudent ? { classId, batchId } : {}),
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      if (err instanceof AccountServiceError) {
        if (err.field) {
          setFieldErrors((prev) => ({ ...prev, [err.field!]: err.message }));
          setConfirming(false);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Unable to save changes.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Account Details"
      subtitle="Account ID, role, and creation date remain immutable."
    >
      <div className="space-y-4">
        {/* Immutable Reference Header */}
        <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-mono font-semibold text-[var(--accent-text)]">
            {account.accountId}
          </span>
          <span className="text-[var(--text-muted)] capitalize">
            {account.role} · Created {formatShortDate(account.createdAt)}
          </span>
        </div>

        {formError && <Alert tone="error">{formError}</Alert>}

        {confirming ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Confirm updating profile details for{' '}
              <strong className="font-mono">{account.accountId}</strong> ({name.trim()})?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Back
              </Button>
              <Button onClick={handleSave} loading={saving}>
                Confirm Changes
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleValidate} className="space-y-4" noValidate>
            <Input
              label="Full Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, name: '' }));
              }}
              error={fieldErrors.name}
            />

            {isStudent && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Class"
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                >
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setFieldErrors((prev) => ({ ...prev, phone: '' }));
              }}
              error={fieldErrors.phone}
            />

            <Input
              label="Email Address (Optional)"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: '' }));
              }}
              error={fieldErrors.email}
            />

            <div className="pt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Review & Save</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

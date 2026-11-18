import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import type {
  AccountRecord,
  AuthPrincipal,
  DemoClassOption,
  ManagedAccountRole,
  ManagedAccountStatus,
} from '../../types';
import {
  validateInitialPassword,
  validateOptionalEmail,
  validatePersonName,
  validatePhoneNumber,
} from '../../utils/validation';
import { isFirebaseConnectedMode } from '../../services';
import {
  AccountServiceError,
  type IAccountManagementService,
} from '../../services/contracts/accountService';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface CreateAccountModalProps {
  open: boolean;
  role: ManagedAccountRole;
  actor: AuthPrincipal | null;
  accountService: IAccountManagementService;
  classOptions: DemoClassOption[];
  onClose: () => void;
  onCreated: (account: AccountRecord) => void;
}

export function CreateAccountModal({
  open,
  role,
  actor,
  accountService,
  classOptions,
  onClose,
  onCreated,
}: CreateAccountModalProps) {
  const isStudent = role === 'student';

  const [previewId, setPreviewId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<ManagedAccountStatus>('active');
  const [classId, setClassId] = useState('');
  const [batchId, setBatchId] = useState('');

  const [step, setStep] = useState<'form' | 'confirm' | 'created'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<AccountRecord | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName('');
    setPhone('');
    setEmail('');
    setInitialPassword('');
    setShowPassword(false);
    setStatus('active');
    const firstClass = classOptions[0];
    setClassId(firstClass?.id ?? '');
    setBatchId(firstClass?.batches[0]?.id ?? '');
    setStep('form');
    setSubmitting(false);
    setCopied(false);
    setCreatedAccount(null);
    setFieldErrors({});
    setFormError(null);

    void accountService
      .previewNextAccountId(actor, role)
      .then((id) => setPreviewId(id))
      .catch(() => setPreviewId(''));
  }, [open, role, actor, accountService, classOptions]);

  const selectedClass = classOptions.find((c) => c.id === classId);
  const availableBatches = selectedClass?.batches ?? [];
  const selectedBatch = availableBatches.find((b) => b.id === batchId);

  const handleClassChange = (nextClassId: string) => {
    setClassId(nextClassId);
    const cls = classOptions.find((c) => c.id === nextClassId);
    setBatchId(cls?.batches[0]?.id ?? '');
  };

  const handleCopyId = async (idToCopy: string) => {
    try {
      await navigator.clipboard.writeText(idToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const nameCheck = validatePersonName(name, isStudent ? 'Student name' : 'Teacher name');
    if (!nameCheck.valid) errors.name = nameCheck.error!;

    const phoneCheck = validatePhoneNumber(phone);
    if (!phoneCheck.valid) errors.phone = phoneCheck.error!;

    const emailCheck = validateOptionalEmail(email);
    if (!emailCheck.valid) errors.email = emailCheck.error!;

    const passCheck = validateInitialPassword(initialPassword);
    if (!passCheck.valid) errors.initialPassword = passCheck.error!;

    if (isStudent && !classId) {
      errors.classId = 'Please select a class.';
    }
    if (isStudent && !batchId) {
      errors.batchId = 'Please select a batch.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleReviewSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (validateForm()) {
      setStep('confirm');
    }
  };

  const handleConfirmCreate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = isStudent
        ? await accountService.createStudentAccount(actor, {
            name,
            classId,
            batchId,
            phone,
            email: email.trim() || undefined,
            initialPassword,
            status,
          })
        : await accountService.createTeacherAccount(actor, {
            name,
            phone,
            email: email.trim() || undefined,
            initialPassword,
            status,
          });
      setCreatedAccount(created);
      setInitialPassword(''); // Clear password from UI state immediately after creation
      setStep('created');
      onCreated(created);
    } catch (err) {
      if (err instanceof AccountServiceError) {
        if (err.field) {
          setFieldErrors((prev) => ({ ...prev, [err.field!]: err.message }));
          setStep('form');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Unable to create account right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isStudent ? 'Create Student Account' : 'Create Teacher Account'}
      subtitle={
        step === 'created'
          ? isFirebaseConnectedMode()
            ? 'Account provisioned in Firebase Authentication and Cloud Firestore.'
            : 'Account provisioned in local development store (Local Demo Mode).'
          : isStudent
            ? 'Parents share the student login credentials. No separate parent role is created.'
            : 'Teacher accounts are created strictly by Admin with an auto-generated Teacher ID.'
      }
    >
      {step === 'created' && createdAccount ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {createdAccount.name} ({createdAccount.role}) created successfully
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-emerald-800 dark:text-emerald-300">
                Assigned Account ID:{' '}
                <strong className="font-mono text-sm">{createdAccount.accountId}</strong>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyId(createdAccount.accountId)}
                iconLeft={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied ? 'Copied' : 'Copy ID'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            For security, the initial password is not displayed again or stored in readable profile records.
          </p>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="space-y-5">
          {formError && (
            <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] border border-[#E5E7EF] dark:border-[#303A55] rounded-xl text-sm bg-white dark:bg-[#101426]/65">
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Generated ID</span>
              <span className="font-mono font-semibold">{previewId}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Full Name</span>
              <span className="font-medium text-right">{name.trim()}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Role</span>
              <span className="capitalize">{role}</span>
            </div>
            {isStudent && (
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Class & Batch</span>
                <span className="text-right">
                  {selectedClass?.name} · {selectedBatch?.name}
                </span>
              </div>
            )}
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Phone</span>
              <span className="font-mono">{phone.trim()}</span>
            </div>
            {email.trim() && (
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Email</span>
                <span className="truncate">{email.trim()}</span>
              </div>
            )}
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Initial Status</span>
              <span className="capitalize">{status}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => setStep('form')} disabled={submitting}>
              Back to Edit
            </Button>
            <Button onClick={handleConfirmCreate} loading={submitting}>
              Confirm & Create Account
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleReviewSubmit} className="space-y-4" noValidate>
          {formError && (
            <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
              {formError}
            </p>
          )}

          {/* Read-only Auto-generated ID preview */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA]/70 dark:bg-[#101426] px-3.5 py-2.5">
            <div>
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                Auto-Generated {isStudent ? 'Student' : 'Teacher'} ID
              </p>
              <p className="font-mono text-sm font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                {previewId || 'Generating...'}
              </p>
            </div>
            {previewId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleCopyId(previewId)}
                iconLeft={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied ? 'Copied' : 'Copy ID'}
              </Button>
            )}
          </div>

          <Input
            label={isStudent ? 'Student Name' : 'Teacher Name'}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, name: '' }));
            }}
            placeholder={isStudent ? 'e.g. Ananya Sharma' : 'e.g. Vikram Deshmukh'}
            error={fieldErrors.name}
          />

          {isStudent && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Class (Demo Options)
                </label>
                <select
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.classId && (
                  <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.classId}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                  Batch (Demo Options)
                </label>
                <select
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.batchId && (
                  <p className="text-xs text-red-700 dark:text-red-400">{fieldErrors.batchId}</p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setFieldErrors((prev) => ({ ...prev, phone: '' }));
              }}
              placeholder="+91 98201 00000"
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
              placeholder="name@example.com"
              error={fieldErrors.email}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Initial Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={initialPassword}
              onChange={(e) => {
                setInitialPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, initialPassword: '' }));
              }}
              placeholder="Minimum 8 characters"
              error={fieldErrors.initialPassword}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Account Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ManagedAccountStatus)}
                className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              >
                <option value="active">Active</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Review Summary</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

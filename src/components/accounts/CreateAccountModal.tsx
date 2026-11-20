import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { deriveInternalAuthEmail } from '../../lib/firebase/config';
import { LINKED_CONSOLE_UID_REGEX } from '../../lib/firebase/provisioningApp';
import type {
  AccountProvisioningMode,
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
import { Alert } from '../ui/Alert';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

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
  const firebaseConnected = isFirebaseConnectedMode();

  const [previewId, setPreviewId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [provisioningMode, setProvisioningMode] = useState<AccountProvisioningMode>('spark_secondary_auth');
  const [existingAuthUid, setExistingAuthUid] = useState('');
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
    setProvisioningMode('spark_secondary_auth');
    setExistingAuthUid('');
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
  const isManualConsoleMode = firebaseConnected && provisioningMode === 'manual_console_uid';
  const derivedAuthEmail = previewId
    ? deriveInternalAuthEmail(previewId)
    : `${isStudent ? 'stu' : 'tch'}-xxxx@auth.academy-0007.internal`;

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

    if (isManualConsoleMode) {
      if (!LINKED_CONSOLE_UID_REGEX.test(existingAuthUid.trim())) {
        errors.existingAuthUid =
          'Enter a valid Firebase Auth UID (6-128 alphanumeric, "_" or "-" characters).';
      }
    } else {
      const passCheck = validateInitialPassword(initialPassword);
      if (!passCheck.valid) errors.initialPassword = passCheck.error!;
    }

    if (isStudent && classOptions.length > 0 && !classId) {
      errors.classId = 'Please select a class.';
    }
    if (isStudent && availableBatches.length > 0 && !batchId) {
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
      const resolvedMode: AccountProvisioningMode | undefined = firebaseConnected
        ? provisioningMode
        : undefined;
      const resolvedUid = isManualConsoleMode ? existingAuthUid.trim() : undefined;
      const resolvedPassword = isManualConsoleMode ? '' : initialPassword;

      const created = isStudent
        ? await accountService.createStudentAccount(actor, {
            name,
            classId,
            batchId,
            phone,
            email: email.trim() || undefined,
            initialPassword: resolvedPassword,
            status,
            provisioningMode: resolvedMode,
            existingAuthUid: resolvedUid,
          })
        : await accountService.createTeacherAccount(actor, {
            name,
            phone,
            email: email.trim() || undefined,
            initialPassword: resolvedPassword,
            status,
            provisioningMode: resolvedMode,
            existingAuthUid: resolvedUid,
          });
      setCreatedAccount(created);
      setInitialPassword(''); // Clear password from UI state immediately after creation
      setExistingAuthUid('');
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
          ? firebaseConnected
            ? 'Account provisioned in Firebase Authentication and Cloud Firestore (Spark Free Plan).'
            : 'Account provisioned in local development store (Local Demo Mode).'
          : isStudent
            ? 'Parents share the student login credentials. No separate parent role is created.'
            : 'Teacher accounts are created strictly by Admin with an auto-generated Teacher ID.'
      }
    >
      {step === 'created' && createdAccount ? (
        <div className="space-y-5">
          <Alert tone="success" title={`${createdAccount.name} (${createdAccount.role}) created successfully`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span>
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
          </Alert>

          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            For security, passwords are never stored in Firestore or displayed again.
          </p>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="space-y-5">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047] border border-[#E2E8E5] dark:border-[#344047] rounded-xl text-sm bg-white dark:bg-[#151A1E]/70">
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[#68737C] dark:text-[#AAB6B4]">Generated ID</span>
              <span className="font-mono font-semibold">{previewId}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[#68737C] dark:text-[#AAB6B4]">Full Name</span>
              <span className="font-medium text-right">{name.trim()}</span>
            </div>
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[#68737C] dark:text-[#AAB6B4]">Role</span>
              <span className="capitalize">{role}</span>
            </div>
            {isStudent && (
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Class & Batch</span>
                <span className="text-right">
                  {selectedClass && selectedBatch
                    ? `${selectedClass.name} · ${selectedBatch.name}`
                    : 'Not assigned yet'}
                </span>
              </div>
            )}
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[#68737C] dark:text-[#AAB6B4]">Phone</span>
              <span className="font-mono tabular-nums">{phone.trim()}</span>
            </div>
            {email.trim() && (
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Email</span>
                <span className="truncate">{email.trim()}</span>
              </div>
            )}
            <div className="px-4 py-2.5 flex justify-between gap-4">
              <span className="text-[#68737C] dark:text-[#AAB6B4]">Initial Status</span>
              <span className="capitalize">{status}</span>
            </div>
            {firebaseConnected && (
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Provisioning Method</span>
                <span className="text-right text-xs font-medium">
                  {isManualConsoleMode
                    ? `Link Console UID (${existingAuthUid.trim()})`
                    : 'Isolated Spark Secondary Auth'}
                </span>
              </div>
            )}
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
          {formError && <Alert tone="error">{formError}</Alert>}

          {/* Read-only Auto-generated ID preview */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#B8EBD8] dark:border-[#316453] bg-[#DDF8EE]/65 dark:bg-[#244B3E]/55 px-3.5 py-2.5">
            <div>
              <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                Auto-Generated {isStudent ? 'Student' : 'Teacher'} ID
              </p>
              <p className="font-mono text-sm font-semibold text-[#168A63] dark:text-[#42DDA9]">
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

          {firebaseConnected && (
            <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E]/70 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                Spark Account Provisioning Method
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProvisioningMode('spark_secondary_auth');
                    setFieldErrors((prev) => ({ ...prev, existingAuthUid: '' }));
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    provisioningMode === 'spark_secondary_auth'
                      ? 'border-[#35D6A0] bg-[#DDF8EE] dark:border-[#42DDA9] dark:bg-[#244B3E] text-[#171D21] dark:text-[#F4F7F6] font-semibold'
                      : 'border-[#E2E8E5] dark:border-[#344047] text-[#68737C] dark:text-[#AAB6B4]'
                  }`}
                >
                  Isolated Spark Auth (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProvisioningMode('manual_console_uid');
                    setFieldErrors((prev) => ({ ...prev, initialPassword: '' }));
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    provisioningMode === 'manual_console_uid'
                      ? 'border-[#35D6A0] bg-[#DDF8EE] dark:border-[#42DDA9] dark:bg-[#244B3E] text-[#171D21] dark:text-[#F4F7F6] font-semibold'
                      : 'border-[#E2E8E5] dark:border-[#344047] text-[#68737C] dark:text-[#AAB6B4]'
                  }`}
                >
                  Link Pre-Created Console UID
                </button>
              </div>
              {isManualConsoleMode ? (
                <p className="text-[11px] text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                  Create this user in Firebase Console → Authentication → Users with email{' '}
                  <span className="font-mono font-semibold text-[#171D21] dark:text-[#F4F7F6]">{derivedAuthEmail}</span>, then paste its UID below.
                </p>
              ) : (
                <p className="text-[11px] text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                  Creates the account in an isolated in-memory secondary Firebase App so your Admin session remains signed in. Unlinked Auth accounts without an Admin-written Firestore profile cannot access app data.
                </p>
              )}
            </div>
          )}

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
            classOptions.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label={firebaseConnected ? 'Class' : 'Class (Demo Options)'}
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  error={fieldErrors.classId}
                >
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label={firebaseConnected ? 'Batch' : 'Batch (Demo Options)'}
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  error={fieldErrors.batchId}
                >
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <p className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E]/70 px-3.5 py-2.5 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                No active classes or batches are configured yet. You can create this student account now and assign their class/batch later under Academics.
              </p>
            )
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
            {isManualConsoleMode ? (
              <Input
                label="Firebase Auth UID"
                value={existingAuthUid}
                onChange={(e) => {
                  setExistingAuthUid(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, existingAuthUid: '' }));
                }}
                placeholder="Paste UID from Firebase Console"
                error={fieldErrors.existingAuthUid}
              />
            ) : (
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
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#68737C] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:text-[#F4F7F6] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              )}

            <Select
              label="Account Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ManagedAccountStatus)}
            >
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </Select>
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


import { useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import type {
  AccountRecord,
  AuthPrincipal,
  DemoPasswordResetReceipt,
} from '../../types';
import type { IAccountManagementService } from '../../services/contracts/accountService';
import { isFirebaseConnectedMode } from '../../services';
import { Alert } from '../ui/Alert';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface StatusConfirmDialogProps {
  open: boolean;
  account: AccountRecord | null;
  actor: AuthPrincipal | null;
  accountService: IAccountManagementService;
  onClose: () => void;
  onCompleted: (updated: AccountRecord) => void;
}

export function AccountStatusConfirmDialog({
  open,
  account,
  actor,
  accountService,
  onClose,
  onCompleted,
}: StatusConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return null;
  }

  const isDeactivating = account.status === 'active';

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = isDeactivating
        ? await accountService.deactivateAccount(actor, account.accountId)
        : await accountService.reactivateAccount(actor, account.accountId);
      onCompleted(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isDeactivating ? 'Deactivate Account' : 'Reactivate Account'}
      subtitle={`${account.name} (${account.accountId})`}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              isDeactivating
                ? 'text-[var(--error)]'
                : 'text-[var(--accent-text)]'
            }`}
            aria-hidden="true"
          />
          <p>
            {isDeactivating
              ? 'This account will immediately lose sign-in access across the portal. The account record, ID, and history are preserved and never deleted.'
              : 'Reactivating this account restores sign-in eligibility with its existing ID.'}
          </p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={isDeactivating ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={submitting}
          >
            {isDeactivating ? 'Confirm Deactivation' : 'Confirm Reactivation'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface PasswordResetDialogProps {
  open: boolean;
  account: AccountRecord | null;
  actor: AuthPrincipal | null;
  accountService: IAccountManagementService;
  onClose: () => void;
  onResetLogged: () => void;
}

export function PasswordResetDemoDialog({
  open,
  account,
  actor,
  accountService,
  onClose,
  onResetLogged,
}: PasswordResetDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<DemoPasswordResetReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firebaseConnected = isFirebaseConnectedMode();

  if (!account) {
    return null;
  }

  const handleClose = () => {
    setReceipt(null);
    setError(null);
    onClose();
  };

  const handleInitiate = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await accountService.initiatePasswordReset(actor, account.accountId);
      setReceipt(res);
      onResetLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initiate password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={firebaseConnected ? 'Password Reset Procedure (Spark Plan)' : 'Initiate Password Reset (DEMO ONLY)'}
      subtitle={`${account.name} · ${account.accountId}`}
    >
      {receipt ? (
        <div className="space-y-4">
          <Alert tone="success">{receipt.notice}</Alert>
          {receipt.authEmail && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3.5 py-2.5 text-xs">
              <span className="text-[var(--text-muted)]">Firebase Auth Login Email: </span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {receipt.authEmail}
              </span>
            </div>
          )}
          {receipt.manualSteps && receipt.manualSteps.length > 0 && (
            <div className="space-y-2 rounded-lg border border-[var(--border)] p-3.5">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Manual Firebase Console Reset Steps
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-[var(--text-muted)]">
                {receipt.manualSteps.map((stepText, idx) => (
                  <li key={idx}>{stepText}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            <KeyRound className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-2">
              <p>
                Admin cannot view or retrieve existing passwords. Logging a reset records an immutable entry in the account audit trail.
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {firebaseConnected
                  ? 'On the Firebase Spark (free) plan without Admin SDK Cloud Functions, resetting another user\'s password requires Firebase Console access. Teachers and students can change their own password anytime under Settings.'
                  : 'DEMO ONLY: No actual email, SMS, or external notification is sent while Firebase Authentication is disconnected.'}
              </p>
            </div>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleInitiate} loading={submitting}>
              {firebaseConnected ? 'Log Reset & View Console Steps' : 'Initiate Demo Reset'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

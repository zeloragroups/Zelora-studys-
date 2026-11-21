import { AlertTriangle } from 'lucide-react';
import { Button, type ButtonVariant } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  subtitle?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
  tone?: 'warning' | 'danger' | 'neutral';
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  loading = false,
  tone = 'warning',
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidthClass="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          {tone !== 'neutral' && (
            <span
              className={
                tone === 'danger'
                  ? 'w-9 h-9 rounded-xl bg-[var(--error-soft)] border border-[var(--error-border)] text-[var(--error)] flex items-center justify-center shrink-0'
                  : 'w-9 h-9 rounded-xl bg-[var(--warning-soft)] border border-[var(--warning-border)] text-[var(--warning)] flex items-center justify-center shrink-0'
              }
              aria-hidden="true"
            >
              <AlertTriangle className="w-4 h-4" strokeWidth={2} />
            </span>
          )}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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
                  ? 'w-9 h-9 rounded-xl bg-[#FCEBEC] dark:bg-[#3B2125] text-[#D64C55] dark:text-[#EF6D75] flex items-center justify-center shrink-0'
                  : 'w-9 h-9 rounded-xl bg-[#FDF6E7] dark:bg-[#352A18] text-[#A67317] dark:text-[#E5B04D] flex items-center justify-center shrink-0'
              }
              aria-hidden="true"
            >
              <AlertTriangle className="w-4 h-4" strokeWidth={2} />
            </span>
          )}
          <p className="text-sm text-[#343C42] dark:text-[#D4DDDC] leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#E2E8E5] dark:border-[#344047]">
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

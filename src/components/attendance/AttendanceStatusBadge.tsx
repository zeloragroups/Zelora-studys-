import type { AttendanceStatus } from '../../types';
import { StatusText, type SemanticTone } from '../ui/StatusText';

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus;
  corrected?: boolean;
}

const STATUS_META: Record<AttendanceStatus, { tone: SemanticTone; label: string }> = {
  present: { tone: 'nominal', label: 'Present' },
  late: { tone: 'warning', label: 'Late' },
  absent: { tone: 'danger', label: 'Absent' },
  excused: { tone: 'neutral', label: 'Excused' },
};

export function AttendanceStatusBadge({ status, corrected }: AttendanceStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusText tone={meta.tone} label={meta.label} />
      {corrected && (
        <span className="text-[11px] font-medium text-[var(--warning)]">
          · Corrected
        </span>
      )}
    </span>
  );
}

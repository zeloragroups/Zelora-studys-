import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookText, History, Lock, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homeworkService } from '../../services';
import type {
  HomeworkSubmissionStatus,
  StudentHomeworkItem,
} from '../../types';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { Select } from '../ui/Select';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';
import { Textarea } from '../ui/Textarea';

type HomeworkFilterBucket =
  | 'all'
  | 'upcoming'
  | 'due_today'
  | 'overdue'
  | 'submitted'
  | 'reviewed'
  | 'returned';

const HOMEWORK_FILTER_TABS: Array<{ id: HomeworkFilterBucket; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'due_today', label: 'Due Today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'returned', label: 'Returned for Revision' },
];

const SUBMISSION_STATUS_META: Record<
  HomeworkSubmissionStatus,
  { label: string; tone: SemanticTone }
> = {
  assigned: { label: 'Assigned — Pending Submission', tone: 'warning' },
  submitted: { label: 'Submitted On Time', tone: 'nominal' },
  late_submitted: { label: 'Late Submitted', tone: 'warning' },
  reviewed: { label: 'Reviewed', tone: 'nominal' },
  returned_for_correction: { label: 'Returned for Revision', tone: 'danger' },
};

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function matchesHomeworkFilter(
  item: StudentHomeworkItem,
  bucket: HomeworkFilterBucket,
  todayIso: string,
  nowMs: number
): boolean {
  if (bucket === 'all') return true;
  const dueIsoDate = item.homework.dueAt.slice(0, 10);
  const dueMs = new Date(item.homework.dueAt).getTime();
  const isPending = item.effectiveStatus === 'assigned';

  if (bucket === 'upcoming') {
    return (
      item.canSubmitOrResubmit &&
      item.effectiveStatus !== 'returned_for_correction' &&
      dueIsoDate > todayIso &&
      dueMs >= nowMs
    );
  }
  if (bucket === 'due_today') {
    return item.canSubmitOrResubmit && dueIsoDate === todayIso;
  }
  if (bucket === 'overdue') {
    return (
      isPending &&
      (item.indicator === 'overdue' || (Number.isFinite(dueMs) && dueMs < nowMs))
    );
  }
  if (bucket === 'submitted') {
    return (
      item.effectiveStatus === 'submitted' ||
      item.effectiveStatus === 'late_submitted'
    );
  }
  if (bucket === 'reviewed') {
    return item.effectiveStatus === 'reviewed';
  }
  if (bucket === 'returned') {
    return item.effectiveStatus === 'returned_for_correction';
  }
  return true;
}

export function StudentHomeworkModule() {
  const { principal } = useAuth();
  const [items, setItems] = useState<StudentHomeworkItem[]>([]);
  const [filterBucket, setFilterBucket] = useState<HomeworkFilterBucket>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<StudentHomeworkItem | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadHomework = useCallback(async () => {
    if (!principal || principal.role !== 'student') {
      setError('Student authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await homeworkService.listStudentHomework(principal);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load homework.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  if (!principal || principal.role !== 'student') {
    return (
      <Alert tone="error" title="Access Restricted">
        Student homework workspace is accessible only with Student credentials.
      </Alert>
    );
  }

  const openItemModal = (item: StudentHomeworkItem) => {
    setSelectedItem(item);
    setResponseText(item.submission?.responseText ?? '');
    setSubmitError(null);
  };

  const handleSubmitResponse = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const saved = await homeworkService.submitStudentHomework(
        principal,
        selectedItem.homework.id,
        responseText
      );
      setBanner(
        `Homework response saved (${saved.status === 'late_submitted' ? 'Late Submitted' : 'Submitted'}, Revision #${saved.revisionNumber}).`
      );
      setSelectedItem(null);
      await loadHomework();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to submit homework response.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const todayIso = getLocalTodayIso();
  const nowMs = Date.now();
  const subjectOptions = Array.from(
    new Map(items.map((it) => [it.homework.subjectId, it.subjectName])).entries()
  );

  const filteredItems = items.filter((item) => {
    if (subjectFilter !== 'all' && item.homework.subjectId !== subjectFilter) {
      return false;
    }
    return matchesHomeworkFilter(item, filterBucket, todayIso, nowMs);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student & Parent Workspace · Text-Only Homework Policy"
        title="My Homework Assignments"
        rightSlot={<StatusText tone="nominal" label={`Student ID: ${principal.loginId}`} />}
      />

      {banner && (
        <Alert tone="success" onDismiss={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Card
        title="Assigned Class & Batch Homework"
        subtitle="Only published or closed homework for your active enrolled batch is visible here. Strictly text-only — file attachments are not permitted."
        action={
          subjectOptions.length > 1 ? (
            <Select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Filter homework by subject"
              className="min-w-[160px]"
            >
              <option value="all">All Subjects</option>
              {subjectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <Tabs
            ariaLabel="Homework status filters"
            value={filterBucket}
            onChange={setFilterBucket}
            items={HOMEWORK_FILTER_TABS.map((tab) => ({
              id: tab.id,
              label: tab.label,
              count: items.filter(
                (it) =>
                  (subjectFilter === 'all' || it.homework.subjectId === subjectFilter) &&
                  matchesHomeworkFilter(it, tab.id, todayIso, nowMs)
              ).length,
            }))}
          />

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-[#F0F4F2] dark:bg-[#252E33] animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-8 text-center space-y-2">
              <BookText
                className="w-6 h-6 text-[#68737C] dark:text-[#AAB6B4] mx-auto"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                {items.length === 0
                  ? 'No homework assigned to your active batch yet'
                  : 'No homework matches this filter'}
              </p>
              {filterBucket !== 'all' && items.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFilterBucket('all');
                    setSubjectFilter('all');
                  }}
                >
                  Show All Homework
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
              {filteredItems.map((item) => {
                const statusMeta = SUBMISSION_STATUS_META[item.effectiveStatus];
                const lockLabel = item.canSubmitOrResubmit
                  ? item.effectiveStatus === 'returned_for_correction'
                    ? 'Resubmission open (correction requested)'
                    : item.submission
                      ? 'Revision allowed before review'
                      : 'Submission open'
                  : item.homework.status === 'closed'
                    ? 'Locked — homework closed by teacher'
                    : 'Locked — reviewed by teacher';

                return (
                  <article
                    key={item.homework.id}
                    className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                        <span className="font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
                          {item.homework.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.subjectName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.teacherName}</span>
                        <span aria-hidden="true">·</span>
                        <span>Published {formatShortDate(item.homework.assignedAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Due {formatDateTime(item.homework.dueAt)}
                        </span>
                      </div>

                      <h2 className="text-base font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                        {item.homework.title}
                      </h2>

                      <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] line-clamp-2">
                        {item.homework.instructions}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <StatusText tone={statusMeta.tone} label={statusMeta.label} />
                        <span className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          {lockLabel}
                        </span>
                        {item.submission?.reviewedAt && (
                          <span className="text-xs font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                            Reviewed {formatShortDate(item.submission.reviewedAt)}
                          </span>
                        )}
                        {item.submission?.marksAwarded !== undefined && (
                          <span className="text-xs font-mono font-semibold tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
                            Marks: {item.submission.marksAwarded}
                            {item.homework.maximumMarks
                              ? ` / ${item.homework.maximumMarks}`
                              : ''}
                          </span>
                        )}
                        {item.submission?.feedback && (
                          <span className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                            Feedback: {item.submission.feedback}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        variant={item.canSubmitOrResubmit ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => openItemModal(item)}
                      >
                        {item.canSubmitOrResubmit
                          ? item.submission
                            ? 'Revise & Resubmit'
                            : 'Write Response'
                          : 'View Submission'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? selectedItem.homework.title : ''}
        subtitle={
          selectedItem
            ? `${selectedItem.subjectName} · Published ${formatShortDate(selectedItem.homework.assignedAt)} · Due ${formatDateTime(selectedItem.homework.dueAt)}`
            : ''
        }
        maxWidthClass="max-w-2xl"
      >
        {selectedItem && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-4 text-sm text-[#171D21] dark:text-[#F4F7F6] whitespace-pre-line">
              {selectedItem.homework.instructions}
            </div>

            {selectedItem.submission &&
              (selectedItem.submission.feedback ||
                selectedItem.submission.marksAwarded !== undefined) && (
                <div className="rounded-xl border border-[#B8EBD8] dark:border-[#316453] bg-[#DDF8EE] dark:bg-[#244B3E] p-3.5 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      Teacher Review
                      {selectedItem.submission.marksAwarded !== undefined && (
                        <span className="ml-2 font-mono tabular-nums">
                          ({selectedItem.submission.marksAwarded}
                          {selectedItem.homework.maximumMarks
                            ? ` / ${selectedItem.homework.maximumMarks}`
                            : ' marks'}
                          )
                        </span>
                      )}
                    </p>
                    {selectedItem.submission.reviewedAt && (
                      <span className="text-xs font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                        Reviewed {formatDateTime(selectedItem.submission.reviewedAt)}
                      </span>
                    )}
                  </div>
                  {selectedItem.submission.feedback && (
                    <p className="text-xs text-[#171D21] dark:text-[#F4F7F6]">
                      {selectedItem.submission.feedback}
                    </p>
                  )}
                </div>
              )}

            {selectedItem.canSubmitOrResubmit ? (
              <form onSubmit={handleSubmitResponse} className="space-y-3">
                {submitError && <Alert tone="error">{submitError}</Alert>}

                <Textarea
                  label="Your Text-Only Homework Response (File/PDF/Image uploads are not enabled)"
                  rows={6}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  required
                  placeholder="Type your complete answer and working here..."
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSelectedItem(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={submitting}
                    iconLeft={<Send className="w-4 h-4" aria-hidden="true" />}
                  >
                    {selectedItem.submission ? 'Submit Revision' : 'Submit Homework'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3 flex items-center gap-2 text-xs text-[#343C42] dark:text-[#D5E0DD]">
                  <Lock className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9] shrink-0" aria-hidden="true" />
                  <span>
                    {selectedItem.homework.status === 'closed'
                      ? 'This homework has been closed by the teacher. Submissions and edits are locked.'
                      : 'This submission has been reviewed and locked. Edits are allowed only if the teacher returns it for revision.'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4]">
                  Submitted Response
                </p>
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5 text-sm text-[#171D21] dark:text-[#F4F7F6] whitespace-pre-line">
                  {selectedItem.submission?.responseText ?? 'No submission recorded (Homework closed).'}
                </div>
              </div>
            )}

            {selectedItem.submission &&
              selectedItem.submission.revisionHistory.length > 0 && (
                <div className="pt-3 border-t border-[#E2E8E5] dark:border-[#344047] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    <History className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                    <span>
                      Submission Revision History (
                      {selectedItem.submission.revisionHistory.length})
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {selectedItem.submission.revisionHistory.map((rev) => (
                      <li
                        key={rev.revisionNumber}
                        className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3 space-y-1"
                      >
                        <p className="font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                          Revision #{rev.revisionNumber} · {formatDateTime(rev.submittedAt)}
                          {rev.isLate ? ' · Late Submission' : ' · On Time'}
                        </p>
                        <p className="text-[#171D21] dark:text-[#F4F7F6] whitespace-pre-line">
                          {rev.responseText}
                        </p>
                        {rev.feedback && (
                          <p className="text-[#168A63] dark:text-[#42DDA9]">
                            Review ({rev.reviewAction?.replace(/_/g, ' ')}): {rev.feedback}
                            {rev.marksAwarded !== undefined ? ` · Marks: ${rev.marksAwarded}` : ''}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        )}
      </Modal>
    </div>
  );
}

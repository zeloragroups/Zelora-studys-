import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookText, History, Lock, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homeworkService } from '../../services';
import type {
  HomeworkSubmissionStatus,
  StudentHomeworkItem,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { StatusText, type SemanticTone } from '../ui/StatusText';

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
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Student homework workspace is accessible only with Student credentials.
        </p>
      </Card>
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Student & Parent Workspace · Text-Only Homework Policy
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            My Homework Assignments
          </h1>
        </div>
        <StatusText tone="nominal" label={`Student ID: ${principal.loginId}`} />
      </div>

      {banner && (
        <div
          role="status"
          className="rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/30 bg-[#168A62]/10 dark:bg-[#22C58B]/15 p-3.5 text-sm text-[#168A62] dark:text-[#22C58B] flex items-center justify-between gap-3"
        >
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-medium underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3.5 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {error}
        </div>
      )}

      <Card
        title="Assigned Class & Batch Homework"
        subtitle="Only published or closed homework for your active enrolled batch is visible here. Strictly text-only — file attachments are not permitted."
        action={
          subjectOptions.length > 1 ? (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Filter homework by subject"
              className="min-h-[40px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-xs sm:text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              <option value="all">All Subjects</option>
              {subjectOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex overflow-x-auto gap-1.5 pb-1">
            {HOMEWORK_FILTER_TABS.map((tab) => {
              const count = items.filter(
                (it) =>
                  (subjectFilter === 'all' || it.homework.subjectId === subjectFilter) &&
                  matchesHomeworkFilter(it, tab.id, todayIso, nowMs)
              ).length;
              const active = filterBucket === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterBucket(tab.id)}
                  className={cn(
                    'min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                    active
                      ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                      : 'bg-[#F8F9FC] dark:bg-[#101426] text-[#434960] dark:text-[#A6B0C3] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                  )}
                >
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center space-y-2">
              <BookText
                className="w-6 h-6 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
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
            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
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
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                        <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
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

                      <h2 className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {item.homework.title}
                      </h2>

                      <p className="text-sm text-[#687086] dark:text-[#A6B0C3] line-clamp-2">
                        {item.homework.instructions}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center gap-3">
                        <StatusText tone={statusMeta.tone} label={statusMeta.label} />
                        <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {lockLabel}
                        </span>
                        {item.submission?.reviewedAt && (
                          <span className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                            Reviewed {formatShortDate(item.submission.reviewedAt)}
                          </span>
                        )}
                        {item.submission?.marksAwarded !== undefined && (
                          <span className="text-xs font-mono font-semibold tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                            Marks: {item.submission.marksAwarded}
                            {item.homework.maximumMarks
                              ? ` / ${item.homework.maximumMarks}`
                              : ''}
                          </span>
                        )}
                        {item.submission?.feedback && (
                          <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-4 text-sm text-[#17172B] dark:text-[#F8FAFC] whitespace-pre-line">
              {selectedItem.homework.instructions}
            </div>

            {selectedItem.submission &&
              (selectedItem.submission.feedback ||
                selectedItem.submission.marksAwarded !== undefined) && (
                <div className="rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/30 bg-[#168A62]/10 dark:bg-[#22C58B]/15 p-3.5 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#168A62] dark:text-[#22C58B]">
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
                      <span className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                        Reviewed {formatDateTime(selectedItem.submission.reviewedAt)}
                      </span>
                    )}
                  </div>
                  {selectedItem.submission.feedback && (
                    <p className="text-xs text-[#17172B] dark:text-[#F8FAFC]">
                      {selectedItem.submission.feedback}
                    </p>
                  )}
                </div>
              )}

            {selectedItem.canSubmitOrResubmit ? (
              <form onSubmit={handleSubmitResponse} className="space-y-3">
                {submitError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
                  >
                    {submitError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1.5">
                    Your Text-Only Homework Response (File/PDF/Image uploads are not enabled)
                  </label>
                  <textarea
                    rows={6}
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    required
                    placeholder="Type your complete answer and working here..."
                    className="w-full rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] p-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                </div>

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
                <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA] dark:bg-[#202844] p-3 flex items-center gap-2 text-xs text-[#434960] dark:text-[#D4DCEB]">
                  <Lock className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#C4B5FD] shrink-0" aria-hidden="true" />
                  <span>
                    {selectedItem.homework.status === 'closed'
                      ? 'This homework has been closed by the teacher. Submissions and edits are locked.'
                      : 'This submission has been reviewed and locked. Edits are allowed only if the teacher returns it for revision.'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                  Submitted Response
                </p>
                <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3.5 text-sm text-[#17172B] dark:text-[#F8FAFC] whitespace-pre-line">
                  {selectedItem.submission?.responseText ?? 'No submission recorded (Homework closed).'}
                </div>
              </div>
            )}

            {selectedItem.submission &&
              selectedItem.submission.revisionHistory.length > 0 && (
                <div className="pt-3 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    <History className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                    <span>
                      Submission Revision History (
                      {selectedItem.submission.revisionHistory.length})
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs">
                    {selectedItem.submission.revisionHistory.map((rev) => (
                      <li
                        key={rev.revisionNumber}
                        className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3 space-y-1"
                      >
                        <p className="font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                          Revision #{rev.revisionNumber} · {formatDateTime(rev.submittedAt)}
                          {rev.isLate ? ' · Late Submission' : ' · On Time'}
                        </p>
                        <p className="text-[#17172B] dark:text-[#F8FAFC] whitespace-pre-line">
                          {rev.responseText}
                        </p>
                        {rev.feedback && (
                          <p className="text-[#168A62] dark:text-[#22C58B]">
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

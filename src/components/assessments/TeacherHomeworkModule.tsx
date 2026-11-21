import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  CheckCircle2,
  Eye,
  Lock,
  Plus,
  RotateCcw,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homeworkService } from '../../services';
import type { TeacherScopeResources } from '../../services/contracts/assessmentService';
import type {
  HomeworkComputedIndicator,
  HomeworkRecord,
  HomeworkReviewAudit,
  HomeworkStatus,
  TeacherEligibleStudent,
  TeacherHomeworkSummaryItem,
  TeacherSubmissionViewItem,
} from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { Textarea } from '../ui/Textarea';

const INDICATOR_META: Record<
  HomeworkComputedIndicator,
  { label: string; tone: SemanticTone }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'nominal' },
  closing_soon: { label: 'Closing Soon', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'neutral' },
};

function toDateTimeLocalValue(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '2026-11-28T23:59';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

export function TeacherHomeworkModule() {
  const { principal } = useAuth();

  const [scope, setScope] = useState<TeacherScopeResources | null>(null);
  const [items, setItems] = useState<TeacherHomeworkSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HomeworkStatus>('all');
  const [classFilter, setClassFilter] = useState('all');

  // Create / Edit Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<HomeworkRecord | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formClassId, setFormClassId] = useState('');
  const [formBatchId, setFormBatchId] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formDueAt, setFormDueAt] = useState('2026-11-28T23:59');
  const [formMaxMarks, setFormMaxMarks] = useState('');
  const [formPublish, setFormPublish] = useState(true);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<TeacherHomeworkSummaryItem | null>(null);

  // Roster & Submission Review Modal
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterData, setRosterData] = useState<{
    homework: HomeworkRecord;
    assignedStudents: TeacherEligibleStudent[];
    submissions: TeacherSubmissionViewItem[];
    pendingStudents: TeacherEligibleStudent[];
    auditEntries: HomeworkReviewAudit[];
  } | null>(null);

  const [activeSubmission, setActiveSubmission] =
    useState<TeacherSubmissionViewItem | null>(null);
  const [reviewAction, setReviewAction] = useState<
    'reviewed' | 'returned_for_correction' | 'reopened'
  >('reviewed');
  const [reviewMarks, setReviewMarks] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewPrivateNote, setReviewPrivateNote] = useState('');
  const [reviewCorrectionReason, setReviewCorrectionReason] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [scopeRes, listRes] = await Promise.all([
        homeworkService.getTeacherScopeResources(principal),
        homeworkService.listTeacherHomework(principal, {
          search: searchText,
          status: statusFilter,
          classId: classFilter,
        }),
      ]);
      setScope(scopeRes);
      setItems(listRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load homework records.');
    } finally {
      setLoading(false);
    }
  }, [principal, searchText, statusFilter, classFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignedCombinations = useMemo(() => scope?.assignments ?? [], [scope]);

  const availableBatchesForClass = useMemo(() => {
    if (!scope || !formClassId) return [];
    const allowedBatchIds = new Set(
      assignedCombinations
        .filter((a) => a.classId === formClassId)
        .map((a) => a.batchId)
    );
    return scope.batches.filter(
      (b) => b.classId === formClassId && allowedBatchIds.has(b.batchId)
    );
  }, [scope, assignedCombinations, formClassId]);

  const availableSubjectsForCombo = useMemo(() => {
    if (!scope || !formClassId || !formBatchId) return [];
    const allowedSubjectIds = new Set(
      assignedCombinations
        .filter((a) => a.classId === formClassId && a.batchId === formBatchId)
        .map((a) => a.subjectId)
    );
    return scope.subjects.filter((s) => allowedSubjectIds.has(s.subjectId));
  }, [scope, assignedCombinations, formClassId, formBatchId]);

  if (!principal || principal.role !== 'teacher') {
    return (
      <Alert tone="error" title="Access Restricted">
        Homework management is restricted to active Teacher accounts.
      </Alert>
    );
  }

  const openCreateModal = () => {
    const firstAssignment = assignedCombinations[0];
    setEditingHomework(null);
    setFormTitle('');
    setFormInstructions('');
    setFormClassId(firstAssignment?.classId ?? '');
    setFormBatchId(firstAssignment?.batchId ?? '');
    setFormSubjectId(firstAssignment?.subjectId ?? '');
    setFormDueAt('2026-11-28T23:59');
    setFormMaxMarks('20');
    setFormPublish(true);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditModal = (hw: HomeworkRecord) => {
    setEditingHomework(hw);
    setFormTitle(hw.title);
    setFormInstructions(hw.instructions);
    setFormClassId(hw.classId);
    setFormBatchId(hw.batchId);
    setFormSubjectId(hw.subjectId);
    setFormDueAt(toDateTimeLocalValue(hw.dueAt));
    setFormMaxMarks(hw.maximumMarks !== undefined ? String(hw.maximumMarks) : '');
    setFormPublish(hw.status === 'published');
    setFormError(null);
    setEditorOpen(true);
  };

  const handleClassChange = (nextClassId: string) => {
    setFormClassId(nextClassId);
    const matching = assignedCombinations.find((a) => a.classId === nextClassId);
    setFormBatchId(matching?.batchId ?? '');
    setFormSubjectId(matching?.subjectId ?? '');
  };

  const handleBatchChange = (nextBatchId: string) => {
    setFormBatchId(nextBatchId);
    const matching = assignedCombinations.find(
      (a) => a.classId === formClassId && a.batchId === nextBatchId
    );
    setFormSubjectId(matching?.subjectId ?? '');
  };

  const handleSaveHomework = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSaving(true);
    try {
      const parsedMax = formMaxMarks.trim() ? Number(formMaxMarks.trim()) : undefined;
      if (editingHomework) {
        await homeworkService.updateHomework(principal, editingHomework.id, {
          title: formTitle,
          instructions: formInstructions,
          dueAt: formDueAt,
          maximumMarks: parsedMax ?? null,
        });
        setFeedbackBanner(`Updated homework "${formTitle.trim()}".`);
      } else {
        const created = await homeworkService.createHomework(principal, {
          title: formTitle,
          instructions: formInstructions,
          classId: formClassId,
          batchId: formBatchId,
          subjectId: formSubjectId,
          dueAt: formDueAt,
          maximumMarks: parsedMax,
          publishImmediately: formPublish,
        });
        setFeedbackBanner(
          `Created ${created.id} (${created.status === 'published' ? 'Published to batch' : 'Saved as draft'}).`
        );
      }
      setEditorOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save homework.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleStatusChange = async (hwId: string, nextStatus: HomeworkStatus) => {
    setError(null);
    try {
      await homeworkService.setHomeworkStatus(principal, hwId, nextStatus);
      setFeedbackBanner(`Homework ${hwId} marked as ${nextStatus}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    }
  };

  const openRosterModal = async (homeworkId: string) => {
    setRosterOpen(true);
    setRosterLoading(true);
    setActiveSubmission(null);
    setReviewError(null);
    try {
      const detail = await homeworkService.getTeacherHomeworkRosterAndSubmissions(
        principal,
        homeworkId
      );
      setRosterData(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load submissions.');
      setRosterOpen(false);
    } finally {
      setRosterLoading(false);
    }
  };

  const selectSubmissionForReview = (item: TeacherSubmissionViewItem) => {
    setActiveSubmission(item);
    setReviewAction('reviewed');
    setReviewMarks(
      item.submission.marksAwarded !== undefined ? String(item.submission.marksAwarded) : ''
    );
    setReviewFeedback(item.submission.feedback ?? '');
    setReviewPrivateNote(item.submission.privateTeacherNote ?? '');
    setReviewCorrectionReason('');
    setReviewError(null);
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSubmission || !rosterData) return;
    setReviewError(null);
    setReviewSaving(true);
    try {
      const parsedMarks = reviewMarks.trim() ? Number(reviewMarks.trim()) : undefined;
      await homeworkService.reviewHomeworkSubmission(principal, {
        submissionId: activeSubmission.submission.id,
        action: reviewAction,
        marksAwarded: parsedMarks,
        feedback: reviewFeedback,
        privateTeacherNote: reviewPrivateNote,
        correctionReason: reviewCorrectionReason || undefined,
      });
      setFeedbackBanner(
        `Saved review (${reviewAction.replace(/_/g, ' ')}) for ${activeSubmission.studentName}.`
      );
      const refreshed = await homeworkService.getTeacherHomeworkRosterAndSubmissions(
        principal,
        rosterData.homework.id
      );
      setRosterData(refreshed);
      setActiveSubmission(null);
      await loadData();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Unable to save review.');
    } finally {
      setReviewSaving(false);
    }
  };

  const columns: TableColumn<TeacherHomeworkSummaryItem>[] = [
    {
      key: 'homework',
      header: 'Homework',
      render: (row) => (
        <div className="space-y-0.5 max-w-xs">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-mono font-semibold text-[var(--accent-text)]">
              {row.homework.id}
            </span>
            <span aria-hidden="true">·</span>
            <span>{row.subjectName}</span>
          </div>
          <p className="font-semibold text-[var(--text-primary)]">
            {row.homework.title}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {row.className} · {row.batchName}
          </p>
        </div>
      ),
    },
    {
      key: 'dueAt',
      header: 'Due Date & Status',
      render: (row) => {
        const meta = INDICATOR_META[row.indicator];
        return (
          <div className="space-y-1">
            <p className="text-xs font-mono tabular-nums text-[var(--text-primary)]">
              {formatDateTime(row.homework.dueAt)}
            </p>
            <StatusText tone={meta.tone} label={meta.label} />
          </div>
        );
      },
    },
    {
      key: 'counts',
      header: 'Submissions',
      render: (row) => (
        <div className="text-xs space-y-0.5 tabular-nums font-mono">
          <p className="text-[var(--text-primary)]">
            Submitted: {row.submittedCount} / {row.totalAssignedStudents}
          </p>
          <p className="text-[var(--text-muted)]">
            Reviewed: {row.reviewedCount} · Pending: {row.pendingCount}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openRosterModal(row.homework.id)}
          >
            Submissions
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewItem(row)}
            iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Preview
          </Button>
          {row.homework.status !== 'archived' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditModal(row.homework)}
            >
              Edit
            </Button>
          )}
          {row.homework.status === 'draft' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleStatusChange(row.homework.id, 'published')}
              iconLeft={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Publish
            </Button>
          )}
          {row.homework.status === 'published' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleStatusChange(row.homework.id, 'closed')}
              iconLeft={<Lock className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Close
            </Button>
          )}
          {row.homework.status === 'closed' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleStatusChange(row.homework.id, 'published')}
              iconLeft={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Reopen
            </Button>
          )}
          {row.homework.status !== 'archived' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleStatusChange(row.homework.id, 'archived')}
              iconLeft={<Archive className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Teacher Operations · Text-Only Homework (No File/PDF Uploads)"
        title="Homework Management & Submission Review"
        rightSlot={
          <Button
            variant="primary"
            onClick={openCreateModal}
            disabled={assignedCombinations.length === 0}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Assign Homework
          </Button>
        }
      />

      {feedbackBanner && (
        <Alert tone="success" onDismiss={() => setFeedbackBanner(null)}>
          {feedbackBanner}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Card
        title="Assigned Homework List"
        subtitle="Draft, publish, close, archive, and review text responses from assigned batch students."
      >
        <div className="grid gap-3 sm:grid-cols-3 mb-5">
          <SearchInput
            value={searchText}
            onValueChange={setSearchText}
            placeholder="Search by ID, title, or instructions..."
            aria-label="Search homework"
          />
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="all">All Assigned Classes</option>
            {(scope?.classes ?? []).map((cls) => (
              <option key={cls.classId} value={cls.classId}>
                {cls.name}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | HomeworkStatus)}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </Select>
        </div>

        <Table
          columns={columns}
          rows={items}
          rowKey={(r) => r.homework.id}
          loading={loading}
          emptyTitle="No homework found"
          emptyDescription="Create a text-only homework assignment for any class, batch, and subject assigned to you."
          mobileCardRender={(row) => {
            const meta = INDICATOR_META[row.indicator];
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold text-[var(--accent-text)]">
                      {row.homework.id} · {row.subjectName}
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {row.homework.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {row.className} · {row.batchName}
                    </p>
                  </div>
                  <StatusText tone={meta.tone} label={meta.label} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  <span>Due {formatDateTime(row.homework.dueAt)}</span>
                  <span>
                    {row.submittedCount}/{row.totalAssignedStudents} submitted · {row.reviewedCount} reviewed
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openRosterModal(row.homework.id)}
                  >
                    Submissions
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewItem(row)}
                    iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Preview
                  </Button>
                  {row.homework.status !== 'archived' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(row.homework)}
                    >
                      Edit
                    </Button>
                  )}
                  {row.homework.status === 'draft' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleStatusChange(row.homework.id, 'published')}
                    >
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            );
          }}
        />
      </Card>

      {/* Create / Edit Homework Modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingHomework ? `Edit Homework ${editingHomework.id}` : 'Create Text-Only Homework'}
        subtitle="Text-only homework policy: file, image, and PDF uploads are not permitted."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveHomework} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          {!editingHomework && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Class"
                value={formClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                required
              >
                {(scope?.classes ?? []).map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Batch"
                value={formBatchId}
                onChange={(e) => handleBatchChange(e.target.value)}
                required
              >
                {availableBatchesForClass.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Subject"
                value={formSubjectId}
                onChange={(e) => setFormSubjectId(e.target.value)}
                required
              >
                {availableSubjectsForCombo.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Input
            label="Homework Title"
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            required
            placeholder="e.g., Chapter 4 Quadratic Formula Practice"
          />

          <Textarea
            label="Text Instructions"
            rows={4}
            value={formInstructions}
            onChange={(e) => setFormInstructions(e.target.value)}
            required
            placeholder="Write clear, step-by-step instructions. Students will reply with text only."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Due Date & Time"
              type="datetime-local"
              value={formDueAt}
              onChange={(e) => setFormDueAt(e.target.value)}
              required
            />
            <Input
              label="Maximum Marks (Optional)"
              type="number"
              min={1}
              step="1"
              value={formMaxMarks}
              onChange={(e) => setFormMaxMarks(e.target.value)}
              placeholder="Leave blank if ungraded"
              className="tabular-nums"
            />
          </div>

          {!editingHomework && (
            <Checkbox
              checked={formPublish}
              onChange={setFormPublish}
              label="Publish immediately to enrolled batch students"
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={formSaving}>
              {editingHomework ? 'Save Changes' : formPublish ? 'Create & Publish' : 'Save Draft'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        title={previewItem ? `Student View Preview: ${previewItem.homework.id}` : ''}
        subtitle={
          previewItem
            ? `${previewItem.className} · ${previewItem.batchName} · ${previewItem.subjectName}`
            : ''
        }
      >
        {previewItem && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {previewItem.homework.title}
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Due {formatDateTime(previewItem.homework.dueAt)}
                {previewItem.homework.maximumMarks
                  ? ` · Maximum Marks: ${previewItem.homework.maximumMarks}`
                  : ' · Qualitative Review (No Numeric Marks)'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--text-primary)] whitespace-pre-line">
              {previewItem.homework.instructions}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Students see a text-only response box here. File/PDF/image uploads are disabled across the platform.
            </p>
          </div>
        )}
      </Modal>

      {/* Roster, Submissions & Review Modal */}
      <Modal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        title={
          rosterData
            ? `Submissions: ${rosterData.homework.title}`
            : 'Loading Homework Submissions'
        }
        subtitle={
          rosterData
            ? `${rosterData.homework.id} · Due ${formatDateTime(rosterData.homework.dueAt)}`
            : ''
        }
        maxWidthClass="max-w-3xl"
      >
        {rosterLoading || !rosterData ? (
          <div className="h-32 rounded-xl bg-[var(--surface-secondary)] animate-pulse" />
        ) : (
          <div className="space-y-6">
            {/* Pending Students */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-muted)] mb-2">
                Not Yet Submitted ({rosterData.pendingStudents.length})
              </h3>
              {rosterData.pendingStudents.length === 0 ? (
                <p className="text-xs text-[var(--accent-text)]">
                  All eligible batch students have submitted a response.
                </p>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  {rosterData.pendingStudents
                    .map((s) => `${s.studentName} (${s.studentId})`)
                    .join(', ')}
                </p>
              )}
            </div>

            {/* Received Submissions */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                Received Submissions ({rosterData.submissions.length})
              </h3>
              {rosterData.submissions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-muted)]">
                  No student responses submitted yet.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
                  {rosterData.submissions.map((item) => (
                    <div
                      key={item.submission.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.studentName}{' '}
                          <span className="font-mono text-xs text-[var(--accent-text)]">
                            ({item.submission.studentId})
                          </span>
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Rev #{item.submission.revisionNumber} ·{' '}
                          {formatDateTime(item.submission.submittedAt)} · Status:{' '}
                          <span className="font-medium capitalize">
                            {item.submission.status.replace(/_/g, ' ')}
                          </span>
                          {item.submission.marksAwarded !== undefined &&
                            ` · Marks: ${item.submission.marksAwarded}${
                              item.maximumMarks ? ` / ${item.maximumMarks}` : ''
                            }`}
                        </p>
                        <p className="text-xs text-[var(--text-primary)] whitespace-pre-line">
                          {item.submission.responseText}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => selectSubmissionForReview(item)}
                      >
                        Review / Grade
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Review Form */}
            {activeSubmission && (
              <form
                onSubmit={handleSubmitReview}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                    Review {activeSubmission.studentName} ({activeSubmission.submission.id})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveSubmission(null)}
                    className="text-xs text-[var(--accent-text)] underline cursor-pointer"
                  >
                    Close form
                  </button>
                </div>

                {reviewError && <Alert tone="error">{reviewError}</Alert>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Review Decision"
                    value={reviewAction}
                    onChange={(e) =>
                      setReviewAction(
                        e.target.value as
                          | 'reviewed'
                          | 'returned_for_correction'
                          | 'reopened'
                      )
                    }
                  >
                    <option value="reviewed">Mark as Reviewed</option>
                    <option value="returned_for_correction">Return for Correction</option>
                    <option value="reopened">Reopen for Resubmission</option>
                  </Select>

                  <Input
                    label={
                      activeSubmission.maximumMarks !== undefined
                        ? `Marks Awarded (0–${activeSubmission.maximumMarks})`
                        : 'Marks Awarded'
                    }
                    type="number"
                    min={0}
                    max={activeSubmission.maximumMarks}
                    step="0.5"
                    value={reviewMarks}
                    onChange={(e) => setReviewMarks(e.target.value)}
                    disabled={reviewAction === 'reopened'}
                    placeholder="Optional numeric marks"
                    className="tabular-nums"
                  />
                </div>

                <Textarea
                  label="Feedback Visible to Student & Parent"
                  rows={2}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Constructive feedback shown after review or return..."
                />

                <Textarea
                  label="Private Teacher Note (Strictly Hidden from Student)"
                  rows={2}
                  value={reviewPrivateNote}
                  onChange={(e) => setReviewPrivateNote(e.target.value)}
                  placeholder="Internal observation visible only to Teachers and Admin..."
                />

                {activeSubmission.submission.status === 'reviewed' && (
                  <Input
                    label="Correction Reason (Required if changing previously reviewed marks)"
                    type="text"
                    value={reviewCorrectionReason}
                    onChange={(e) => setReviewCorrectionReason(e.target.value)}
                    placeholder="Document reason for modifying existing reviewed marks..."
                  />
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={reviewSaving}
                    iconLeft={<CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
                  >
                    Save Review
                  </Button>
                </div>
              </form>
            )}

            {/* Review Audit Trail */}
            {rosterData.auditEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] mb-2">
                  Review Audit History
                </h4>
                <ul className="divide-y divide-[var(--border)] text-xs">
                  {rosterData.auditEntries.map((aud) => (
                    <li key={aud.id} className="py-2 text-[var(--text-muted)]">
                      <span className="font-mono font-semibold text-[var(--accent-text)]">
                        {aud.id}
                      </span>{' '}
                      · {aud.action.replace(/_/g, ' ')} by {aud.actorId} on{' '}
                      {formatDateTime(aud.timestamp)}
                      {aud.reason ? ` — Reason: ${aud.reason}` : ''}
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

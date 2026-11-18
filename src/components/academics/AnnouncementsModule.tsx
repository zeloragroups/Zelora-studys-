import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, EyeOff, Megaphone, Pencil, Plus, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { academicService, isFirebaseConnectedMode } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AnnouncementAudience,
  AnnouncementPublicationStatus,
  AnnouncementRecord,
  BatchRecord,
  ClassRecord,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText, type SemanticTone } from '../ui/StatusText';

type StatusFilter = 'all' | AnnouncementPublicationStatus;

export function AnnouncementsModule() {
  const { principal } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [targetClassId, setTargetClassId] = useState('');
  const [targetBatchId, setTargetBatchId] = useState('');
  const [publishImmediately, setPublishImmediately] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmTransition, setConfirmTransition] = useState<{
    record: AnnouncementRecord;
    action: 'publish' | 'unpublish' | 'archive';
  } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [annRes, clsRes, batRes] = await Promise.all([
        academicService.listAdminAnnouncements(principal),
        academicService.listClasses(principal),
        academicService.listBatches(principal),
      ]);
      setAnnouncements(annRes);
      setClasses(clsRes);
      setBatches(batRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-red-700 dark:text-red-400">
          Only authenticated Admin accounts can publish or manage announcements.
        </p>
      </Card>
    );
  }

  const classMap = new Map(classes.map((c) => [c.classId, c.name]));
  const batchMap = new Map(batches.map((b) => [b.batchId, b.name]));

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setAudience('all');
    setTargetClassId(classes[0]?.classId ?? '');
    setTargetBatchId(batches[0]?.batchId ?? '');
    setPublishImmediately(true);
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (ann: AnnouncementRecord) => {
    setEditing(ann);
    setTitle(ann.title);
    setContent(ann.content);
    setAudience(ann.audience);
    setTargetClassId(ann.targetClassId ?? classes[0]?.classId ?? '');
    setTargetBatchId(ann.targetBatchId ?? batches[0]?.batchId ?? '');
    setFormError(null);
    setModalMode('edit');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createAnnouncement(principal, {
          title,
          content,
          audience,
          targetClassId: audience === 'class' ? targetClassId : undefined,
          targetBatchId: audience === 'batch' ? targetBatchId : undefined,
          publishImmediately,
        });
        setModalMode(null);
        showToast(
          created.publicationStatus === 'published'
            ? `Published announcement ${created.announcementId}.`
            : `Saved draft ${created.announcementId}.`
        );
        void loadData();
      } else if (modalMode === 'edit' && editing) {
        const updated = await academicService.updateAnnouncement(
          principal,
          editing.announcementId,
          {
            title,
            content,
            audience,
            targetClassId: audience === 'class' ? targetClassId : undefined,
            targetBatchId: audience === 'batch' ? targetBatchId : undefined,
          }
        );
        setModalMode(null);
        showToast(`Updated announcement ${updated.announcementId}.`);
        void loadData();
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError ? err.message : 'Unable to save announcement.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const executeStatusTransition = async () => {
    if (!confirmTransition) return;
    setSubmitting(true);
    try {
      const { record, action } = confirmTransition;
      if (action === 'publish') {
        await academicService.publishAnnouncement(principal, record.announcementId);
        showToast(`Published ${record.announcementId}.`);
      } else if (action === 'unpublish') {
        await academicService.unpublishAnnouncement(principal, record.announcementId);
        showToast(`Unpublished ${record.announcementId}.`);
      } else {
        await academicService.archiveAnnouncement(principal, record.announcementId);
        showToast(`Archived ${record.announcementId}.`);
      }
      setConfirmTransition(null);
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update announcement status.');
      setConfirmTransition(null);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = announcements.filter(
    (a) => statusFilter === 'all' || a.publicationStatus === statusFilter
  );

  const audienceLabel = (ann: AnnouncementRecord) => {
    if (ann.audience === 'all') return 'All Teachers & Students';
    if (ann.audience === 'teachers') return 'Teachers Only';
    if (ann.audience === 'students') return 'Students & Parents';
    if (ann.audience === 'class') {
      return `Class: ${classMap.get(ann.targetClassId ?? '') ?? ann.targetClassId ?? ''}`;
    }
    return `Batch: ${batchMap.get(ann.targetBatchId ?? '') ?? ann.targetBatchId ?? ''}`;
  };

  const statusMeta = (
    st: AnnouncementPublicationStatus
  ): { tone: SemanticTone; label: string } => {
    if (st === 'published') return { tone: 'nominal', label: 'Published' };
    if (st === 'draft') return { tone: 'warning', label: 'Draft' };
    if (st === 'unpublished') return { tone: 'neutral', label: 'Unpublished' };
    return { tone: 'neutral', label: 'Archived' };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Admin-Only Communications · Strictly Text-Only · {isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            Announcements & Notices
          </h1>
        </div>
        <Button
          size="sm"
          onClick={openCreate}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          New Announcement
        </Button>
      </div>

      {toast && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200"
        >
          {toast}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <Card
        title="Announcement Ledger"
        subtitle="Teachers and students see only Published announcements targeted to their role, class, or batch."
      >
        <div className="space-y-4">
          <div
            className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844]"
            role="tablist"
            aria-label="Filter announcements by status"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'published', label: 'Published' },
                { id: 'draft', label: 'Drafts' },
                { id: 'unpublished', label: 'Unpublished' },
                { id: 'archived', label: 'Archived' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                    active
                      ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
                      : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
                  )}
                >
                  {tab.label}
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
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center space-y-2">
              <Megaphone className="w-6 h-6 text-[#687086] dark:text-[#A6B0C3] mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                No announcements match this filter
              </p>
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                Create a text-only announcement targeted to teachers, students, or specific batches.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
              {filtered.map((ann) => {
                const st = statusMeta(ann.publicationStatus);
                return (
                  <article key={ann.announcementId} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {ann.announcementId} · {audienceLabel(ann)} ·{' '}
                          {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                          {ann.title}
                        </h3>
                      </div>
                      <StatusText tone={st.tone} label={st.label} />
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {ann.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(ann)} iconLeft={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}>
                        Edit
                      </Button>

                      {ann.publicationStatus !== 'published' &&
                        ann.publicationStatus !== 'archived' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setConfirmTransition({ record: ann, action: 'publish' })
                            }
                            iconLeft={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
                          >
                            Publish
                          </Button>
                        )}

                      {ann.publicationStatus === 'published' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setConfirmTransition({ record: ann, action: 'unpublish' })
                          }
                          iconLeft={<EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Unpublish
                        </Button>
                      )}

                      {ann.publicationStatus !== 'archived' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfirmTransition({ record: ann, action: 'archive' })
                          }
                          iconLeft={<Archive className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={
          modalMode === 'create'
            ? 'New Text Announcement'
            : `Edit ${editing?.announcementId ?? 'Announcement'}`
        }
        subtitle="Text-only notice without attachments. Visible to selected target groups once published."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-300"
            >
              {formError}
            </div>
          )}

          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Holiday Schedule Update"
            required
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Message (Text-Only)
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write clear centre instructions or schedule notice..."
              required
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
              Target Audience
            </label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
              className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              <option value="all">All Teachers & Students</option>
              <option value="teachers">Teachers Only</option>
              <option value="students">Students & Parents</option>
              <option value="class">Specific Class</option>
              <option value="batch">Specific Batch</option>
            </select>
          </div>

          {audience === 'class' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                Select Target Class
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              >
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name} ({c.classId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {audience === 'batch' && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                Select Target Batch
              </label>
              <select
                value={targetBatchId}
                onChange={(e) => setTargetBatchId(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              >
                {batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name} — {classMap.get(b.classId) ?? b.classId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {modalMode === 'create' && (
            <label className="flex items-center gap-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={publishImmediately}
                onChange={(e) => setPublishImmediately(e.target.checked)}
                className="w-4 h-4 rounded accent-[#7552D9] dark:accent-[#8B5CF6]"
              />
              <span>Publish immediately to selected audience</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {modalMode === 'create'
                ? publishImmediately
                  ? 'Publish Announcement'
                  : 'Save Draft'
                : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmTransition !== null}
        onClose={() => setConfirmTransition(null)}
        title={
          confirmTransition?.action === 'publish'
            ? 'Confirm Publish'
            : confirmTransition?.action === 'unpublish'
              ? 'Confirm Unpublish'
              : 'Confirm Archive'
        }
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {confirmTransition?.action === 'publish' &&
              `Make "${confirmTransition.record.title}" visible to ${audienceLabel(confirmTransition.record)}?`}
            {confirmTransition?.action === 'unpublish' &&
              `Hide "${confirmTransition.record.title}" from teacher and student dashboards?`}
            {confirmTransition?.action === 'archive' &&
              `Archive "${confirmTransition.record.title}"? Archived notices are retained for admin audit and hidden from users.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmTransition(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmTransition?.action === 'archive' ? 'danger' : 'primary'}
              loading={submitting}
              onClick={() => void executeStatusTransition()}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

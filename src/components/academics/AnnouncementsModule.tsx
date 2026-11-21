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
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { Select } from '../ui/Select';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';
import { Textarea } from '../ui/Textarea';

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
        <Alert tone="error">
          Only authenticated Admin accounts can publish or manage announcements.
        </Alert>
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
      <PageHeader
        eyebrow={`Admin-Only Communications · Text-Only · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}`}
        title="Announcements & Notices"
        rightSlot={
          <Button
            size="sm"
            onClick={openCreate}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            New Announcement
          </Button>
        }
      />

      {toast && (
        <Alert tone="success" onDismiss={() => setToast(null)}>
          {toast}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Card
        title="Announcement Ledger"
        subtitle="Teachers and students see only Published announcements targeted to their role, class, or batch."
      >
        <div className="space-y-4">
          <Tabs<StatusFilter>
            items={[
              { id: 'all', label: 'All' },
              { id: 'published', label: 'Published' },
              { id: 'draft', label: 'Drafts' },
              { id: 'unpublished', label: 'Unpublished' },
              { id: 'archived', label: 'Archived' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter announcements by status"
          />

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl bg-[var(--surface-secondary)] animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center space-y-2">
              <Megaphone className="w-6 h-6 text-[var(--text-muted)] mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No announcements match this filter
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Create a text-only announcement targeted to teachers, students, or specific batches.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((ann) => {
                const st = statusMeta(ann.publicationStatus);
                return (
                  <article key={ann.announcementId} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                          {ann.announcementId} · {audienceLabel(ann)} ·{' '}
                          {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                        </p>
                        <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                          {ann.title}
                        </h3>
                      </div>
                      <StatusText tone={st.tone} label={st.label} />
                    </div>

                    <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
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
          {formError && <Alert tone="error">{formError}</Alert>}

          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Holiday Schedule Update"
            required
          />

          <Textarea
            label="Message (Text-Only)"
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write clear centre instructions or schedule notice…"
            required
          />

          <Select
            label="Target Audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
          >
            <option value="all">All Teachers & Students</option>
            <option value="teachers">Teachers Only</option>
            <option value="students">Students & Parents</option>
            <option value="class">Specific Class</option>
            <option value="batch">Specific Batch</option>
          </Select>

          {audience === 'class' && (
            <Select
              label="Select Target Class"
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              required
            >
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.classId})
                </option>
              ))}
            </Select>
          )}

          {audience === 'batch' && (
            <Select
              label="Select Target Batch"
              value={targetBatchId}
              onChange={(e) => setTargetBatchId(e.target.value)}
              required
            >
              {batches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  {b.name} — {classMap.get(b.classId) ?? b.classId}
                </option>
              ))}
            </Select>
          )}

          {modalMode === 'create' && (
            <Checkbox
              checked={publishImmediately}
              onChange={setPublishImmediately}
              label="Publish immediately to selected audience"
            />
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

      <ConfirmDialog
        open={confirmTransition !== null}
        onClose={() => setConfirmTransition(null)}
        onConfirm={() => void executeStatusTransition()}
        title={
          confirmTransition?.action === 'publish'
            ? 'Confirm Publish'
            : confirmTransition?.action === 'unpublish'
              ? 'Confirm Unpublish'
              : 'Confirm Archive'
        }
        description={
          confirmTransition?.action === 'publish'
            ? `Make "${confirmTransition.record.title}" visible to ${audienceLabel(confirmTransition.record)}?`
            : confirmTransition?.action === 'unpublish'
              ? `Hide "${confirmTransition.record.title}" from teacher and student dashboards?`
              : `Archive "${confirmTransition?.record.title ?? ''}"? Archived notices are retained for admin audit and hidden from users.`
        }
        confirmLabel="Confirm"
        confirmVariant={confirmTransition?.action === 'archive' ? 'danger' : 'primary'}
        tone={confirmTransition?.action === 'archive' ? 'danger' : 'warning'}
        loading={submitting}
      />
    </div>
  );
}

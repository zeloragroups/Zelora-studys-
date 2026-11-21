import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  StudentEnrolment,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { Textarea } from '../ui/Textarea';

interface ClassesSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  batches: BatchRecord[];
  enrolments: StudentEnrolment[];
  loading: boolean;
  onChanged: (message: string) => void;
}

export function ClassesSection({
  actor,
  classes,
  batches,
  enrolments,
  loading,
  onChanged,
}: ClassesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingClass, setEditingClass] = useState<ClassRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ClassRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = classes.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.classId.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingClass(null);
    setName('');
    setDescription('');
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (cls: ClassRecord) => {
    setEditingClass(cls);
    setName(cls.name);
    setDescription(cls.description ?? '');
    setFormError(null);
    setModalMode('edit');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createClass(actor, {
          name,
          description: description || undefined,
        });
        setModalMode(null);
        onChanged(`Created class ${created.classId} (${created.name}).`);
      } else if (modalMode === 'edit' && editingClass) {
        const updated = await academicService.updateClass(actor, editingClass.classId, {
          name,
          description: description || undefined,
        });
        setModalMode(null);
        onChanged(`Updated class ${updated.classId}.`);
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError ? err.message : 'Unable to save class.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (cls: ClassRecord) => {
    setActionError(null);
    const nextStatus = cls.status === 'active' ? 'inactive' : 'active';
    try {
      await academicService.setClassStatus(actor, cls.classId, nextStatus);
      onChanged(
        `${cls.classId} (${cls.name}) marked ${nextStatus}.`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update class status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    setSubmitting(true);
    try {
      await academicService.deleteClass(actor, deleteTarget.classId);
      const deletedId = deleteTarget.classId;
      setDeleteTarget(null);
      onChanged(`Deleted unused class ${deletedId}.`);
    } catch (err) {
      setActionError(
        err instanceof AcademicServiceError ? err.message : 'Unable to delete class.'
      );
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  const getBatchCount = (classId: string) =>
    batches.filter((b) => b.classId === classId).length;

  const getStudentCount = (classId: string) =>
    enrolments.filter((e) => e.classId === classId && e.status === 'active').length;

  const columns: TableColumn<ClassRecord>[] = [
    {
      key: 'classId',
      header: 'Class ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[var(--accent-text)]">
          {row.classId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Class Name',
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.name}</p>
          {row.description && (
            <p className="text-xs text-[var(--text-muted)] truncate max-w-[260px]">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      align: 'right',
      render: (row) => <span className="tabular-nums">{getBatchCount(row.classId)}</span>,
    },
    {
      key: 'students',
      header: 'Enrolled',
      align: 'right',
      render: (row) => <span className="tabular-nums">{getStudentCount(row.classId)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusText
          tone={row.status === 'active' ? 'nominal' : 'neutral'}
          label={row.status === 'active' ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {formatShortDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1">
          <IconButton
            size="sm"
            variant="ghost"
            label={`Edit ${row.classId}`}
            title="Edit class"
            onClick={() => openEdit(row)}
            icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.classId}`}
            title={row.status === 'active' ? 'Deactivate class' : 'Activate class'}
            onClick={() => void handleToggleStatus(row)}
            icon={<Power className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="danger"
            label={`Delete ${row.classId}`}
            title="Delete unused class"
            onClick={() => {
              setActionError(null);
              setDeleteTarget(row);
            }}
            icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
          />
        </div>
      ),
    },
  ];

  return (
    <Card
      title="Classes"
      subtitle="Define academic classes or levels. Classes with batches, subjects, or enrolments cannot be deleted."
      action={
        <Button
          size="sm"
          onClick={openCreate}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          New Class
        </Button>
      }
    >
      <div className="space-y-4">
        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search class ID or name…"
          aria-label="Search classes"
          containerClassName="max-w-sm"
        />

        {actionError && <Alert tone="error">{actionError}</Alert>}

        <div className="hidden md:block">
          <Table
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.classId}
            loading={loading}
            emptyTitle="No classes found"
            emptyDescription="Create a class (for example Class 10 — Foundation) to organize batches and subjects."
          />
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
              No matching classes found.
            </p>
          ) : (
            filtered.map((cls) => (
              <div
                key={cls.classId}
                className="rounded-xl border border-[var(--border)] p-4 space-y-2.5 bg-[var(--surface)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[var(--accent-text)]">
                      {cls.classId}
                    </p>
                    <p className="font-medium text-[var(--text-primary)]">{cls.name}</p>
                    {cls.description && (
                      <p className="text-xs text-[var(--text-muted)]">{cls.description}</p>
                    )}
                  </div>
                  <StatusText
                    tone={cls.status === 'active' ? 'nominal' : 'neutral'}
                    label={cls.status === 'active' ? 'Active' : 'Inactive'}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] tabular-nums">
                  {getBatchCount(cls.classId)} batches · {getStudentCount(cls.classId)} enrolled students
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(cls)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggleStatus(cls)}
                  >
                    {cls.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setDeleteTarget(cls);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={modalMode === 'create' ? 'Create Class' : `Edit ${editingClass?.classId ?? 'Class'}`}
        subtitle="Unique class IDs (CLS-0001) are generated sequentially."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Input
            label="Class Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Class 10 — Foundation"
            required
          />
          <Textarea
            label="Description (Optional)"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Curriculum scope or stream notes…"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {modalMode === 'create' ? 'Create Class' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Confirm Class Deletion"
        subtitle="Only unused classes with zero batches, subjects, or enrolments can be deleted."
        description={`Delete class ${deleteTarget?.classId ?? ''} (${deleteTarget?.name ?? ''})?`}
        confirmLabel="Delete Class"
        confirmVariant="danger"
        tone="danger"
        loading={submitting}
      />
    </Card>
  );
}

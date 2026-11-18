import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Search, Trash2, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  StudentEnrolment,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

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
        <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
          {row.classId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Class Name',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
          {row.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
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
      render: (row) => <span>{getBatchCount(row.classId)}</span>,
    },
    {
      key: 'students',
      header: 'Enrolled',
      align: 'right',
      render: (row) => <span>{getStudentCount(row.classId)}</span>,
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
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
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
          <button
            type="button"
            onClick={() => openEdit(row)}
            title="Edit class"
            aria-label={`Edit ${row.classId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            title={row.status === 'active' ? 'Deactivate class' : 'Activate class'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.classId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Power className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setDeleteTarget(row);
            }}
            title="Delete unused class"
            aria-label={`Delete ${row.classId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#D94C5C] hover:bg-[#D94C5C]/10 dark:text-[#F16B75] dark:hover:bg-[#F16B75]/15 cursor-pointer transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
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
        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search class ID or name..."
              aria-label="Search classes"
              className="w-full min-h-[40px] rounded-xl pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="min-h-[40px] px-2.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {actionError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs sm:text-sm text-red-800 dark:text-red-300"
          >
            {actionError}
          </div>
        )}

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
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No matching classes found.
            </p>
          ) : (
            filtered.map((cls) => (
              <div
                key={cls.classId}
                className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2.5 bg-white dark:bg-[#101426]/65"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {cls.classId}
                    </p>
                    <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">{cls.name}</p>
                    {cls.description && (
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">{cls.description}</p>
                    )}
                  </div>
                  <StatusText
                    tone={cls.status === 'active' ? 'nominal' : 'neutral'}
                    label={cls.status === 'active' ? 'Active' : 'Inactive'}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
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
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-300"
            >
              {formError}
            </div>
          )}
          <Input
            label="Class Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Class 10 — Foundation"
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Curriculum scope or stream notes..."
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>
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

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Class Deletion"
        subtitle="Only unused classes with zero batches, subjects, or enrolments can be deleted."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Delete class{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteTarget?.classId} ({deleteTarget?.name})
            </span>
            ?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={submitting} onClick={() => void handleDelete()}>
              Delete Class
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

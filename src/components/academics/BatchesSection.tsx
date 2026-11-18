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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

interface BatchesSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  batches: BatchRecord[];
  enrolments: StudentEnrolment[];
  loading: boolean;
  onChanged: (message: string) => void;
}

export function BatchesSection({
  actor,
  classes,
  batches,
  enrolments,
  loading,
  onChanged,
}: BatchesSectionProps) {
  const [classFilter, setClassFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchRecord | null>(null);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BatchRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeClasses = classes.filter((c) => c.status === 'active');

  const classNameMap = new Map(classes.map((c) => [c.classId, c.name]));

  const filtered = batches.filter((b) => {
    if (classFilter !== 'all' && b.classId !== classFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return b.batchId.toLowerCase().includes(q) || b.name.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditingBatch(null);
    setName('');
    setClassId(activeClasses[0]?.classId ?? '');
    setDescription('');
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (batch: BatchRecord) => {
    setEditingBatch(batch);
    setName(batch.name);
    setClassId(batch.classId);
    setDescription(batch.description ?? '');
    setFormError(null);
    setModalMode('edit');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createBatch(actor, {
          name,
          classId,
          description: description || undefined,
        });
        setModalMode(null);
        onChanged(`Created batch ${created.batchId} (${created.name}).`);
      } else if (modalMode === 'edit' && editingBatch) {
        const updated = await academicService.updateBatch(actor, editingBatch.batchId, {
          name,
          classId,
          description: description || undefined,
        });
        setModalMode(null);
        onChanged(`Updated batch ${updated.batchId}.`);
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError ? err.message : 'Unable to save batch.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (batch: BatchRecord) => {
    setActionError(null);
    const nextStatus = batch.status === 'active' ? 'inactive' : 'active';
    try {
      await academicService.setBatchStatus(actor, batch.batchId, nextStatus);
      onChanged(`${batch.batchId} (${batch.name}) marked ${nextStatus}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update batch status.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    setSubmitting(true);
    try {
      await academicService.deleteBatch(actor, deleteTarget.batchId);
      const id = deleteTarget.batchId;
      setDeleteTarget(null);
      onChanged(`Deleted unused batch ${id}.`);
    } catch (err) {
      setActionError(
        err instanceof AcademicServiceError ? err.message : 'Unable to delete batch.'
      );
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  const getStudentCount = (batchId: string) =>
    enrolments.filter((e) => e.batchId === batchId && e.status === 'active').length;

  const columns: TableColumn<BatchRecord>[] = [
    {
      key: 'batchId',
      header: 'Batch ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
          {row.batchId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Batch Name',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
          {row.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'classId',
      header: 'Class',
      render: (row) => (
        <span className="text-xs text-slate-700 dark:text-slate-300">
          {classNameMap.get(row.classId) ?? row.classId}
        </span>
      ),
    },
    {
      key: 'students',
      header: 'Enrolled',
      align: 'right',
      render: (row) => <span>{getStudentCount(row.batchId)}</span>,
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
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => openEdit(row)}
            title="Edit batch"
            aria-label={`Edit ${row.batchId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            title={row.status === 'active' ? 'Deactivate batch' : 'Activate batch'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.batchId}`}
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
            title="Delete unused batch"
            aria-label={`Delete ${row.batchId}`}
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
      title="Batches"
      subtitle="Manage schedule cohorts belonging to each active class."
      action={
        <Button
          size="sm"
          onClick={openCreate}
          disabled={activeClasses.length === 0}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          New Batch
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search
                className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search batch ID or name..."
                aria-label="Search batches"
                className="w-full min-h-[40px] rounded-xl pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            {(searchQuery || classFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setClassFilter('all');
                }}
                className="min-h-[40px] px-2.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter batches by class"
            className="min-h-[40px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </select>
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
            rowKey={(r) => r.batchId}
            loading={loading}
            emptyTitle="No batches found"
            emptyDescription="Create a batch under an active class."
          />
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No matching batches found.
            </p>
          ) : (
            filtered.map((batch) => (
              <div
                key={batch.batchId}
                className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2.5 bg-white dark:bg-[#101426]/65"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {batch.batchId}
                    </p>
                    <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">{batch.name}</p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {classNameMap.get(batch.classId) ?? batch.classId}
                    </p>
                  </div>
                  <StatusText
                    tone={batch.status === 'active' ? 'nominal' : 'neutral'}
                    label={batch.status === 'active' ? 'Active' : 'Inactive'}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {getStudentCount(batch.batchId)} enrolled students
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(batch)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggleStatus(batch)}
                  >
                    {batch.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setActionError(null);
                      setDeleteTarget(batch);
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
        title={modalMode === 'create' ? 'Create Batch' : `Edit ${editingBatch?.batchId ?? 'Batch'}`}
        subtitle="Each batch belongs to a single class and generates a sequential ID (BAT-0001)."
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
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Parent Class
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              {(modalMode === 'create' ? activeClasses : classes).map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.classId}){c.status === 'inactive' ? ' — Inactive' : ''}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Batch Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Batch A"
            required
          />
          <Input
            label="Timing / Notes (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekday afternoon session"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {modalMode === 'create' ? 'Create Batch' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Batch Deletion"
        subtitle="Batches with active enrolments or timetable records cannot be deleted."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Delete batch{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteTarget?.batchId} ({deleteTarget?.name})
            </span>
            ?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={submitting} onClick={() => void handleDelete()}>
              Delete Batch
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

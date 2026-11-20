import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  StudentEnrolment,
} from '../../types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
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
        <span className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
          {row.batchId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Batch Name',
      render: (row) => (
        <div>
          <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{row.name}</p>
          {row.description && (
            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] truncate max-w-[240px]">
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
        <span className="text-xs text-[#343C42] dark:text-[#D4DDDC]">
          {classNameMap.get(row.classId) ?? row.classId}
        </span>
      ),
    },
    {
      key: 'students',
      header: 'Enrolled',
      align: 'right',
      render: (row) => <span className="tabular-nums">{getStudentCount(row.batchId)}</span>,
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
          <IconButton
            size="sm"
            variant="ghost"
            label={`Edit ${row.batchId}`}
            title="Edit batch"
            onClick={() => openEdit(row)}
            icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.batchId}`}
            title={row.status === 'active' ? 'Deactivate batch' : 'Activate batch'}
            onClick={() => void handleToggleStatus(row)}
            icon={<Power className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="danger"
            label={`Delete ${row.batchId}`}
            title="Delete unused batch"
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
            <SearchInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search batch ID or name…"
              aria-label="Search batches"
              containerClassName="flex-1"
            />
            {classFilter !== 'all' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setClassFilter('all');
                }}
                iconLeft={<X className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Reset
              </Button>
            )}
          </div>

          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter batches by class"
            containerClassName="sm:w-52"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {actionError && <Alert tone="error">{actionError}</Alert>}

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
            <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
              No matching batches found.
            </p>
          ) : (
            filtered.map((batch) => (
              <div
                key={batch.batchId}
                className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-2.5 bg-white dark:bg-[#151A1E]/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {batch.batchId}
                    </p>
                    <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{batch.name}</p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {classNameMap.get(batch.classId) ?? batch.classId}
                    </p>
                  </div>
                  <StatusText
                    tone={batch.status === 'active' ? 'nominal' : 'neutral'}
                    label={batch.status === 'active' ? 'Active' : 'Inactive'}
                  />
                </div>
                <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] tabular-nums">
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
          {formError && <Alert tone="error">{formError}</Alert>}
          <Select
            label="Parent Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            required
          >
            {(modalMode === 'create' ? activeClasses : classes).map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name} ({c.classId}){c.status === 'inactive' ? ' — Inactive' : ''}
              </option>
            ))}
          </Select>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="Confirm Batch Deletion"
        subtitle="Batches with active enrolments or timetable records cannot be deleted."
        description={`Delete batch ${deleteTarget?.batchId ?? ''} (${deleteTarget?.name ?? ''})?`}
        confirmLabel="Delete Batch"
        confirmVariant="danger"
        tone="danger"
        loading={submitting}
      />
    </Card>
  );
}

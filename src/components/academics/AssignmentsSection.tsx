import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AccountRecord,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  SubjectRecord,
  TeacherAssignment,
} from '../../types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconButton } from '../ui/IconButton';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

interface AssignmentsSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  batches: BatchRecord[];
  subjects: SubjectRecord[];
  teacherAccounts: AccountRecord[];
  assignments: TeacherAssignment[];
  loading: boolean;
  onChanged: (message: string) => void;
}

export function AssignmentsSection({
  actor,
  classes,
  batches,
  subjects,
  teacherAccounts,
  assignments,
  loading,
  onChanged,
}: AssignmentsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<TeacherAssignment | null>(null);

  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeTeachers = teacherAccounts.filter((t) => t.status === 'active');
  const activeClasses = classes.filter((c) => c.status === 'active');

  const teacherMap = new Map(teacherAccounts.map((t) => [t.accountId.toUpperCase(), t]));
  const classMap = new Map(classes.map((c) => [c.classId, c]));
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));
  const subjectMap = new Map(subjects.map((s) => [s.subjectId, s]));

  const batchesForClass = (cid: string) =>
    batches.filter((b) => b.classId === cid && b.status === 'active');

  const subjectsForClass = (cid: string) =>
    subjects.filter((s) => s.status === 'active' && s.classIds.includes(cid));

  const openCreate = () => {
    const firstClass = activeClasses[0]?.classId ?? '';
    const firstBatch = firstClass ? batchesForClass(firstClass)[0]?.batchId ?? '' : '';
    const firstSubject = firstClass ? subjectsForClass(firstClass)[0]?.subjectId ?? '' : '';
    setEditing(null);
    setTeacherId(activeTeachers[0]?.accountId ?? '');
    setClassId(firstClass);
    setBatchId(firstBatch);
    setSubjectId(firstSubject);
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (asg: TeacherAssignment) => {
    setEditing(asg);
    setTeacherId(asg.teacherAccountId);
    setClassId(asg.classId);
    setBatchId(asg.batchId);
    setSubjectId(asg.subjectId);
    setFormError(null);
    setModalMode('edit');
  };

  const handleClassChange = (cid: string) => {
    setClassId(cid);
    setBatchId(batchesForClass(cid)[0]?.batchId ?? '');
    setSubjectId(subjectsForClass(cid)[0]?.subjectId ?? '');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createTeacherAssignment(actor, {
          teacherAccountId: teacherId,
          classId,
          batchId,
          subjectId,
        });
        setModalMode(null);
        onChanged(`Created teacher assignment ${created.assignmentId}.`);
      } else if (modalMode === 'edit' && editing) {
        const updated = await academicService.updateTeacherAssignment(
          actor,
          editing.assignmentId,
          {
            teacherAccountId: teacherId,
            classId,
            batchId,
            subjectId,
          }
        );
        setModalMode(null);
        onChanged(`Updated assignment ${updated.assignmentId}.`);
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError
          ? err.message
          : 'Unable to save teacher assignment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (asg: TeacherAssignment) => {
    setActionError(null);
    const next = asg.status === 'active' ? 'inactive' : 'active';
    try {
      await academicService.setTeacherAssignmentStatus(actor, asg.assignmentId, next);
      onChanged(`Assignment ${asg.assignmentId} marked ${next}.`);
    } catch (err) {
      setActionError(
        err instanceof AcademicServiceError
          ? err.message
          : 'Unable to update assignment status.'
      );
    }
  };

  const filtered = assignments.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const teacherName = teacherMap.get(a.teacherAccountId.toUpperCase())?.name ?? '';
    const subjectName = subjectMap.get(a.subjectId)?.name ?? '';
    return (
      a.assignmentId.toLowerCase().includes(q) ||
      a.teacherAccountId.toLowerCase().includes(q) ||
      teacherName.toLowerCase().includes(q) ||
      subjectName.toLowerCase().includes(q)
    );
  });

  const columns: TableColumn<TeacherAssignment>[] = [
    {
      key: 'assignmentId',
      header: 'Assignment ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[var(--accent-text)]">
          {row.assignmentId}
        </span>
      ),
    },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (row) => {
        const t = teacherMap.get(row.teacherAccountId.toUpperCase());
        return (
          <div>
            <p className="font-medium text-[var(--text-primary)]">
              {t?.name ?? row.teacherAccountId}
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)]">
              {row.teacherAccountId}
            </p>
          </div>
        );
      },
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span className="text-sm text-[var(--text-primary)]">
          {subjectMap.get(row.subjectId)?.name ?? row.subjectId}
        </span>
      ),
    },
    {
      key: 'classBatch',
      header: 'Class & Batch',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-[var(--text-primary)]">
            {classMap.get(row.classId)?.name ?? row.classId}
          </p>
          <p className="text-[var(--text-muted)]">
            {batchMap.get(row.batchId)?.name ?? row.batchId}
          </p>
        </div>
      ),
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
            label={`Edit ${row.assignmentId}`}
            title="Edit assignment"
            onClick={() => openEdit(row)}
            icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.assignmentId}`}
            title={row.status === 'active' ? 'Deactivate assignment' : 'Activate assignment'}
            onClick={() => void handleToggleStatus(row)}
            icon={<Power className="w-4 h-4" aria-hidden="true" />}
          />
        </div>
      ),
    },
  ];

  const availableBatches = batchesForClass(classId);
  const availableSubjects = subjectsForClass(classId);

  return (
    <Card
      title="Teacher Assignments"
      subtitle="Assign active teachers to subjects, classes, and batches. Teachers see only their active assignments."
      action={
        <Button
          size="sm"
          onClick={openCreate}
          disabled={activeTeachers.length === 0 || activeClasses.length === 0}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          Assign Teacher
        </Button>
      }
    >
      <div className="space-y-4">
        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search teacher or subject…"
          aria-label="Search teacher assignments"
          containerClassName="max-w-sm"
        />

        {actionError && <Alert tone="error">{actionError}</Alert>}

        <div className="hidden md:block">
          <Table
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.assignmentId}
            loading={loading}
            emptyTitle="No teacher assignments found"
            emptyDescription="Assign a teacher to a subject and batch so timetable sessions can be scheduled."
          />
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4 text-center">
              No matching assignments found.
            </p>
          ) : (
            filtered.map((asg) => {
              const t = teacherMap.get(asg.teacherAccountId.toUpperCase());
              return (
                <div
                  key={asg.assignmentId}
                  className="rounded-xl border border-[var(--border)] p-4 space-y-2.5 bg-[var(--surface)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[var(--accent-text)]">
                        {asg.assignmentId} · {asg.teacherAccountId}
                      </p>
                      <p className="font-medium text-[var(--text-primary)]">
                        {t?.name ?? asg.teacherAccountId} —{' '}
                        {subjectMap.get(asg.subjectId)?.name ?? asg.subjectId}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {classMap.get(asg.classId)?.name ?? asg.classId} ·{' '}
                        {batchMap.get(asg.batchId)?.name ?? asg.batchId}
                      </p>
                    </div>
                    <StatusText
                      tone={asg.status === 'active' ? 'nominal' : 'neutral'}
                      label={asg.status === 'active' ? 'Active' : 'Inactive'}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(asg)}>
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleToggleStatus(asg)}
                    >
                      {asg.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={
          modalMode === 'create'
            ? 'Assign Teacher to Class & Subject'
            : `Edit ${editing?.assignmentId ?? 'Assignment'}`
        }
        subtitle="Requires an active teacher account, active subject linked to the class, and active batch."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <Select
            label="Active Teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            required
          >
            {activeTeachers.map((t) => (
              <option key={t.accountId} value={t.accountId}>
                {t.accountId} — {t.name}
              </option>
            ))}
          </Select>

          <Select
            label="Class"
            value={classId}
            onChange={(e) => handleClassChange(e.target.value)}
            required
          >
            {activeClasses.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name} ({c.classId})
              </option>
            ))}
          </Select>

          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              label="Batch"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              required
            >
              {availableBatches.length === 0 ? (
                <option value="">No active batches</option>
              ) : (
                availableBatches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name}
                  </option>
                ))
              )}
            </Select>

            <Select
              label="Subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              {availableSubjects.length === 0 ? (
                <option value="">No linked subjects</option>
              ) : (
                availableSubjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.name}
                  </option>
                ))
              )}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!teacherId || !classId || !batchId || !subjectId}
            >
              {modalMode === 'create' ? 'Create Assignment' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

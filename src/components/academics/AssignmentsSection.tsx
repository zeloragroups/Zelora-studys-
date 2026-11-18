import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Search, X } from 'lucide-react';
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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
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
        <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
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
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {t?.name ?? row.teacherAccountId}
            </p>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
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
        <span className="text-sm text-slate-800 dark:text-slate-200">
          {subjectMap.get(row.subjectId)?.name ?? row.subjectId}
        </span>
      ),
    },
    {
      key: 'classBatch',
      header: 'Class & Batch',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            {classMap.get(row.classId)?.name ?? row.classId}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
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
          <button
            type="button"
            onClick={() => openEdit(row)}
            title="Edit assignment"
            aria-label={`Edit ${row.assignmentId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            title={row.status === 'active' ? 'Deactivate assignment' : 'Activate assignment'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.assignmentId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Power className="w-4 h-4" aria-hidden="true" />
          </button>
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
              placeholder="Search teacher or subject..."
              aria-label="Search teacher assignments"
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
            rowKey={(r) => r.assignmentId}
            loading={loading}
            emptyTitle="No teacher assignments found"
            emptyDescription="Assign a teacher to a subject and batch so timetable sessions can be scheduled."
          />
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No matching assignments found.
            </p>
          ) : (
            filtered.map((asg) => {
              const t = teacherMap.get(asg.teacherAccountId.toUpperCase());
              return (
                <div
                  key={asg.assignmentId}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2.5 bg-white dark:bg-[#101426]/65"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                        {asg.assignmentId} · {asg.teacherAccountId}
                      </p>
                      <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        {t?.name ?? asg.teacherAccountId} —{' '}
                        {subjectMap.get(asg.subjectId)?.name ?? asg.subjectId}
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
              Active Teacher
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              required
              className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              {activeTeachers.map((t) => (
                <option key={t.accountId} value={t.accountId}>
                  {t.accountId} — {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
              Class
            </label>
            <select
              value={classId}
              onChange={(e) => handleClassChange(e.target.value)}
              required
              className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              {activeClasses.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.name} ({c.classId})
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                Batch
              </label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
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
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                Subject
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
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
              </select>
            </div>
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

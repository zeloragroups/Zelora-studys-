import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Search, UserPlus, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AccountRecord,
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

interface EnrolmentsSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  batches: BatchRecord[];
  enrolments: StudentEnrolment[];
  studentAccounts: AccountRecord[];
  unenrolledStudents: AccountRecord[];
  loading: boolean;
  onChanged: (message: string) => void;
}

export function EnrolmentsSection({
  actor,
  classes,
  batches,
  enrolments,
  studentAccounts,
  unenrolledStudents,
  loading,
  onChanged,
}: EnrolmentsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  const [enrolModalOpen, setEnrolModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [enrolmentDate, setEnrolmentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [editingEnrolment, setEditingEnrolment] = useState<StudentEnrolment | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeClasses = classes.filter((c) => c.status === 'active');
  const activeUnenrolled = unenrolledStudents.filter((s) => s.status === 'active');

  const studentMap = new Map(
    studentAccounts.map((acc) => [acc.accountId.toUpperCase(), acc])
  );
  const classMap = new Map(classes.map((c) => [c.classId, c]));
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));

  const batchesForClass = (cid: string) =>
    batches.filter((b) => b.classId === cid && b.status === 'active');

  const openEnrolModal = (preselectedStudentId?: string) => {
    const firstClass = activeClasses[0]?.classId ?? '';
    const firstBatch = firstClass ? batchesForClass(firstClass)[0]?.batchId ?? '' : '';
    setEditingEnrolment(null);
    setSelectedStudentId(preselectedStudentId ?? activeUnenrolled[0]?.accountId ?? '');
    setSelectedClassId(firstClass);
    setSelectedBatchId(firstBatch);
    setEnrolmentDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setEnrolModalOpen(true);
  };

  const openEditModal = (enr: StudentEnrolment) => {
    setEditingEnrolment(enr);
    setSelectedStudentId(enr.studentAccountId);
    setSelectedClassId(enr.classId);
    setSelectedBatchId(enr.batchId);
    setFormError(null);
    setEnrolModalOpen(true);
  };

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId);
    const matchingBatches = batchesForClass(newClassId);
    setSelectedBatchId(matchingBatches[0]?.batchId ?? '');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingEnrolment) {
        const updated = await academicService.updateEnrolmentClassBatch(
          actor,
          editingEnrolment.enrolmentId,
          {
            classId: selectedClassId,
            batchId: selectedBatchId,
          }
        );
        setEnrolModalOpen(false);
        onChanged(
          `Updated enrolment ${updated.enrolmentId} for ${updated.studentAccountId}.`
        );
      } else {
        const created = await academicService.enrolStudent(actor, {
          studentAccountId: selectedStudentId,
          classId: selectedClassId,
          batchId: selectedBatchId,
          enrolmentDate,
        });
        setEnrolModalOpen(false);
        onChanged(
          `Enrolled ${created.studentAccountId} (${created.enrolmentId}).`
        );
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError ? err.message : 'Unable to save enrolment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (enr: StudentEnrolment) => {
    setActionError(null);
    const next = enr.status === 'active' ? 'inactive' : 'active';
    try {
      await academicService.setEnrolmentStatus(actor, enr.enrolmentId, next);
      onChanged(`Enrolment ${enr.enrolmentId} marked ${next}.`);
    } catch (err) {
      setActionError(
        err instanceof AcademicServiceError
          ? err.message
          : 'Unable to update enrolment status.'
      );
    }
  };

  const filtered = enrolments.filter((enr) => {
    if (classFilter !== 'all' && enr.classId !== classFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const student = studentMap.get(enr.studentAccountId.toUpperCase());
    return (
      enr.enrolmentId.toLowerCase().includes(q) ||
      enr.studentAccountId.toLowerCase().includes(q) ||
      (student?.name ?? '').toLowerCase().includes(q)
    );
  });

  const columns: TableColumn<StudentEnrolment>[] = [
    {
      key: 'enrolmentId',
      header: 'Enrolment ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
          {row.enrolmentId}
        </span>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (row) => {
        const acc = studentMap.get(row.studentAccountId.toUpperCase());
        return (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {acc?.name ?? row.studentAccountId}
            </p>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {row.studentAccountId}
              {acc && acc.status !== 'active' ? ' · Account Inactive' : ''}
            </p>
          </div>
        );
      },
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
      key: 'enrolmentDate',
      header: 'Enrolled On',
      render: (row) => (
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {formatShortDate(row.enrolmentDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Enrolment',
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
            onClick={() => openEditModal(row)}
            title="Change class or batch"
            aria-label={`Change class or batch for ${row.enrolmentId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            title={row.status === 'active' ? 'Deactivate enrolment' : 'Reactivate enrolment'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Reactivate'} ${row.enrolmentId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Power className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  const availableBatchesInForm = batchesForClass(selectedClassId);

  return (
    <div className="space-y-6">
      <Card
        title="Student Enrolments"
        subtitle="Place existing active student accounts into an active class and batch. Deactivated enrolments preserve history."
        action={
          <Button
            size="sm"
            onClick={() => openEnrolModal()}
            disabled={activeUnenrolled.length === 0 || activeClasses.length === 0}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Enrol Student
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
                  placeholder="Search student ID, name, or ENR ID..."
                  aria-label="Search student enrolments"
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
              aria-label="Filter enrolments by class"
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
              rowKey={(r) => r.enrolmentId}
              loading={loading}
              emptyTitle="No student enrolments found"
              emptyDescription="Enrol an active student account into a class and batch."
            />
          </div>

          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                No matching enrolments found.
              </p>
            ) : (
              filtered.map((enr) => {
                const acc = studentMap.get(enr.studentAccountId.toUpperCase());
                return (
                  <div
                    key={enr.enrolmentId}
                    className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2.5 bg-white dark:bg-[#101426]/65"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                          {enr.enrolmentId} · {enr.studentAccountId}
                        </p>
                        <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">
                          {acc?.name ?? enr.studentAccountId}
                        </p>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {classMap.get(enr.classId)?.name ?? enr.classId} ·{' '}
                          {batchMap.get(enr.batchId)?.name ?? enr.batchId}
                        </p>
                      </div>
                      <StatusText
                        tone={enr.status === 'active' ? 'nominal' : 'neutral'}
                        label={enr.status === 'active' ? 'Active' : 'Inactive'}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => openEditModal(enr)}>
                        Change Class/Batch
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleToggleStatus(enr)}
                      >
                        {enr.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Card>

      {/* Unenrolled Students Roster */}
      <Card
        title="Students Without Active Enrolment"
        subtitle="Linked from Phase 3 Student Accounts. Only active accounts may be enrolled."
        padding="sm"
      >
        {unenrolledStudents.length === 0 ? (
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 py-2">
            All student accounts currently have an active class and batch enrolment.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
            {unenrolledStudents.map((stu) => (
              <li
                key={stu.accountId}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {stu.name}
                  </p>
                  <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {stu.accountId} · {stu.phone}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusText
                    tone={stu.status === 'active' ? 'warning' : 'danger'}
                    label={stu.status === 'active' ? 'Unenrolled' : 'Account Inactive'}
                  />
                  {stu.status === 'active' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEnrolModal(stu.accountId)}
                      iconLeft={<UserPlus className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Enrol
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={enrolModalOpen}
        onClose={() => setEnrolModalOpen(false)}
        title={
          editingEnrolment
            ? `Update Class & Batch (${editingEnrolment.studentAccountId})`
            : 'Enrol Student in Class & Batch'
        }
        subtitle="Students may have one active enrolment at a time; batch must belong to the chosen class."
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

          {!editingEnrolment && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                Active Student Account
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              >
                {activeUnenrolled.map((stu) => (
                  <option key={stu.accountId} value={stu.accountId}>
                    {stu.accountId} — {stu.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
              Class
            </label>
            <select
              value={selectedClassId}
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

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
              Batch
            </label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              required
              className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            >
              {availableBatchesInForm.length === 0 ? (
                <option value="">No active batches in selected class</option>
              ) : (
                availableBatchesInForm.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name} ({b.batchId})
                  </option>
                ))
              )}
            </select>
          </div>

          {!editingEnrolment && (
            <Input
              label="Enrolment Date"
              type="date"
              value={enrolmentDate}
              onChange={(e) => setEnrolmentDate(e.target.value)}
              required
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEnrolModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!selectedClassId || !selectedBatchId || (!editingEnrolment && !selectedStudentId)}
            >
              {editingEnrolment ? 'Save Transfer' : 'Confirm Enrolment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

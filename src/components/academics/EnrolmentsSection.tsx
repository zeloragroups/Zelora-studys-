import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, UserPlus, X } from 'lucide-react';
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
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
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
        <span className="font-mono text-xs font-semibold text-[var(--accent-text)]">
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
            <p className="font-medium text-[var(--text-primary)]">
              {acc?.name ?? row.studentAccountId}
            </p>
            <p className="font-mono text-xs text-[var(--text-muted)]">
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
      key: 'enrolmentDate',
      header: 'Enrolled On',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
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
          <IconButton
            size="sm"
            variant="ghost"
            label={`Change class or batch for ${row.enrolmentId}`}
            title="Change class or batch"
            onClick={() => openEditModal(row)}
            icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`${row.status === 'active' ? 'Deactivate' : 'Reactivate'} ${row.enrolmentId}`}
            title={row.status === 'active' ? 'Deactivate enrolment' : 'Reactivate enrolment'}
            onClick={() => void handleToggleStatus(row)}
            icon={<Power className="w-4 h-4" aria-hidden="true" />}
          />
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
              <SearchInput
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="Search student ID, name, or ENR ID…"
                aria-label="Search student enrolments"
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
              aria-label="Filter enrolments by class"
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
              rowKey={(r) => r.enrolmentId}
              loading={loading}
              emptyTitle="No student enrolments found"
              emptyDescription="Enrol an active student account into a class and batch."
            />
          </div>

          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-4 text-center">
                No matching enrolments found.
              </p>
            ) : (
              filtered.map((enr) => {
                const acc = studentMap.get(enr.studentAccountId.toUpperCase());
                return (
                  <div
                    key={enr.enrolmentId}
                    className="rounded-xl border border-[var(--border)] p-4 space-y-2.5 bg-[var(--surface)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-semibold text-[var(--accent-text)]">
                          {enr.enrolmentId} · {enr.studentAccountId}
                        </p>
                        <p className="font-medium text-[var(--text-primary)]">
                          {acc?.name ?? enr.studentAccountId}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
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
        subtitle="Linked from Student Accounts. Only active accounts may be enrolled."
        padding="sm"
      >
        {unenrolledStudents.length === 0 ? (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] py-2">
            All student accounts currently have an active class and batch enrolment.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {unenrolledStudents.map((stu) => (
              <li
                key={stu.accountId}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {stu.name}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
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
          {formError && <Alert tone="error">{formError}</Alert>}

          {!editingEnrolment && (
            <Select
              label="Active Student Account"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              required
            >
              {activeUnenrolled.map((stu) => (
                <option key={stu.accountId} value={stu.accountId}>
                  {stu.accountId} — {stu.name}
                </option>
              ))}
            </Select>
          )}

          <Select
            label="Class"
            value={selectedClassId}
            onChange={(e) => handleClassChange(e.target.value)}
            required
          >
            {activeClasses.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name} ({c.classId})
              </option>
            ))}
          </Select>

          <Select
            label="Batch"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            required
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
          </Select>

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

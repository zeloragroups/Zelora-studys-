import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, Search, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type { AuthPrincipal, ClassRecord, SubjectRecord } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

interface SubjectsSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  loading: boolean;
  onChanged: (message: string) => void;
}

export function SubjectsSection({
  actor,
  classes,
  subjects,
  loading,
  onChanged,
}: SubjectsSectionProps) {
  const [classFilter, setClassFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingSubject, setEditingSubject] = useState<SubjectRecord | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const classMap = new Map(classes.map((c) => [c.classId, c.name]));

  const filtered = subjects.filter((s) => {
    if (classFilter !== 'all' && !s.classIds.includes(classFilter)) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.subjectId.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.code ?? '').toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingSubject(null);
    setName('');
    setCode('');
    const firstActive = classes.find((c) => c.status === 'active')?.classId;
    setSelectedClassIds(firstActive ? [firstActive] : []);
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (sub: SubjectRecord) => {
    setEditingSubject(sub);
    setName(sub.name);
    setCode(sub.code ?? '');
    setSelectedClassIds([...sub.classIds]);
    setFormError(null);
    setModalMode('edit');
  };

  const toggleClassId = (cid: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createSubject(actor, {
          name,
          code: code || undefined,
          classIds: selectedClassIds,
        });
        setModalMode(null);
        onChanged(`Created subject ${created.subjectId} (${created.name}).`);
      } else if (modalMode === 'edit' && editingSubject) {
        const updated = await academicService.updateSubject(
          actor,
          editingSubject.subjectId,
          {
            name,
            code: code || undefined,
            classIds: selectedClassIds,
          }
        );
        setModalMode(null);
        onChanged(`Updated subject ${updated.subjectId}.`);
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError ? err.message : 'Unable to save subject.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (sub: SubjectRecord) => {
    const next = sub.status === 'active' ? 'inactive' : 'active';
    await academicService.setSubjectStatus(actor, sub.subjectId, next);
    onChanged(`${sub.subjectId} (${sub.name}) marked ${next}.`);
  };

  const formatClassesLabel = (ids: string[]) =>
    ids.map((id) => classMap.get(id) ?? id).join(' · ');

  const columns: TableColumn<SubjectRecord>[] = [
    {
      key: 'subjectId',
      header: 'Subject ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
          {row.subjectId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{row.name}</p>
          {row.code && (
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.code}</p>
          )}
        </div>
      ),
    },
    {
      key: 'classes',
      header: 'Associated Classes',
      render: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {formatClassesLabel(row.classIds)}
        </span>
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
            title="Edit subject"
            aria-label={`Edit ${row.subjectId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            title={row.status === 'active' ? 'Deactivate subject' : 'Activate subject'}
            aria-label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.subjectId}`}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] hover:bg-[#F1EEFA] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] dark:hover:bg-[#202844] cursor-pointer transition-colors"
          >
            <Power className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card
      title="Subjects"
      subtitle="Register curriculum subjects and associate them with one or more classes."
      action={
        <Button
          size="sm"
          onClick={openCreate}
          disabled={classes.length === 0}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          New Subject
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
                placeholder="Search subject name, ID, or code..."
                aria-label="Search subjects"
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
            aria-label="Filter subjects by class"
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

        <div className="hidden md:block">
          <Table
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.subjectId}
            loading={loading}
            emptyTitle="No subjects found"
            emptyDescription="Add a subject and link it to relevant classes."
          />
        </div>

        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No matching subjects found.
            </p>
          ) : (
            filtered.map((sub) => (
              <div
                key={sub.subjectId}
                className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2.5 bg-white dark:bg-[#101426]/65"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {sub.subjectId} {sub.code ? `· ${sub.code}` : ''}
                    </p>
                    <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">{sub.name}</p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {formatClassesLabel(sub.classIds)}
                    </p>
                  </div>
                  <StatusText
                    tone={sub.status === 'active' ? 'nominal' : 'neutral'}
                    label={sub.status === 'active' ? 'Active' : 'Inactive'}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(sub)}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToggleStatus(sub)}
                  >
                    {sub.status === 'active' ? 'Deactivate' : 'Activate'}
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
        title={
          modalMode === 'create' ? 'Create Subject' : `Edit ${editingSubject?.subjectId ?? 'Subject'}`
        }
        subtitle="Prevented from duplicating the same subject name within the same class."
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
            label="Subject Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mathematics"
            required
          />
          <Input
            label="Subject Code (Optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. MTH-10"
          />
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Associated Classes
            </span>
            <div className="space-y-2 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3 max-h-44 overflow-y-auto">
              {classes.map((c) => {
                const checked = selectedClassIds.includes(c.classId);
                return (
                  <label
                    key={c.classId}
                    className="flex items-center gap-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClassId(c.classId)}
                      className="w-4 h-4 rounded accent-[#7552D9] dark:accent-[#8B5CF6]"
                    />
                    <span>
                      {c.name}{' '}
                      <span className="font-mono text-xs text-slate-500">({c.classId})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {modalMode === 'create' ? 'Create Subject' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

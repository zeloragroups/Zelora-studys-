import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Power, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type { AuthPrincipal, ClassRecord, SubjectRecord } from '../../types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
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
        <span className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
          {row.subjectId}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{row.name}</p>
          {row.code && (
            <p className="font-mono text-xs text-[#68737C] dark:text-[#AAB6B4]">{row.code}</p>
          )}
        </div>
      ),
    },
    {
      key: 'classes',
      header: 'Associated Classes',
      render: (row) => (
        <span className="text-xs text-[#343C42] dark:text-[#D4DDDC]">
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
          <IconButton
            size="sm"
            variant="ghost"
            label={`Edit ${row.subjectId}`}
            title="Edit subject"
            onClick={() => openEdit(row)}
            icon={<Pencil className="w-4 h-4" aria-hidden="true" />}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={`${row.status === 'active' ? 'Deactivate' : 'Activate'} ${row.subjectId}`}
            title={row.status === 'active' ? 'Deactivate subject' : 'Activate subject'}
            onClick={() => void handleToggleStatus(row)}
            icon={<Power className="w-4 h-4" aria-hidden="true" />}
          />
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
            <SearchInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search subject name, ID, or code…"
              aria-label="Search subjects"
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
            aria-label="Filter subjects by class"
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
            <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
              No matching subjects found.
            </p>
          ) : (
            filtered.map((sub) => (
              <div
                key={sub.subjectId}
                className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-2.5 bg-white dark:bg-[#151A1E]/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {sub.subjectId} {sub.code ? `· ${sub.code}` : ''}
                    </p>
                    <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{sub.name}</p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
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
          {formError && <Alert tone="error">{formError}</Alert>}
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
            <span className="block text-sm font-medium text-[#20262B] dark:text-[#F4F7F6]">
              Associated Classes
            </span>
            <div className="space-y-2.5 rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E] p-3.5 max-h-44 overflow-y-auto">
              {classes.map((c) => {
                const checked = selectedClassIds.includes(c.classId);
                return (
                  <Checkbox
                    key={c.classId}
                    checked={checked}
                    onChange={() => toggleClassId(c.classId)}
                    label={`${c.name} (${c.classId})`}
                  />
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

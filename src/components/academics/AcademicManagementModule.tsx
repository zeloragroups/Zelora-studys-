import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { academicService, accountService, isFirebaseConnectedMode } from '../../services';
import type {
  AcademicOverviewStats,
  AccountRecord,
  BatchRecord,
  ClassRecord,
  StudentEnrolment,
  SubjectRecord,
  TeacherAssignment,
  TimetableEntry,
} from '../../types';
import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { Tabs } from '../ui/Tabs';
import { ClassesSection } from './ClassesSection';
import { BatchesSection } from './BatchesSection';
import { SubjectsSection } from './SubjectsSection';
import { EnrolmentsSection } from './EnrolmentsSection';
import { AssignmentsSection } from './AssignmentsSection';
import { TimetableSection } from './TimetableSection';

export type AcademicTabId =
  | 'classes'
  | 'batches'
  | 'subjects'
  | 'enrolments'
  | 'assignments'
  | 'timetable';

interface AcademicManagementModuleProps {
  initialTab?: AcademicTabId;
}

const ACADEMIC_TABS: Array<{ id: AcademicTabId; label: string }> = [
  { id: 'classes', label: 'Classes' },
  { id: 'batches', label: 'Batches' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'enrolments', label: 'Enrolments' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'timetable', label: 'Timetable' },
];

export function AcademicManagementModule({
  initialTab = 'classes',
}: AcademicManagementModuleProps) {
  const { principal } = useAuth();
  const [activeTab, setActiveTab] = useState<AcademicTabId>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [overview, setOverview] = useState<AcademicOverviewStats | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [enrolments, setEnrolments] = useState<StudentEnrolment[]>([]);
  const [unenrolledStudents, setUnenrolledStudents] = useState<AccountRecord[]>([]);
  const [studentAccounts, setStudentAccounts] = useState<AccountRecord[]>([]);
  const [teacherAccounts, setTeacherAccounts] = useState<AccountRecord[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadAll = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [
        ovRes,
        clsRes,
        batRes,
        subRes,
        enrRes,
        unenrRes,
        studentsRes,
        teachersRes,
        asgRes,
        ttRes,
      ] = await Promise.all([
        academicService.getAcademicOverview(principal),
        academicService.listClasses(principal),
        academicService.listBatches(principal),
        academicService.listSubjects(principal),
        academicService.listEnrolments(principal),
        academicService.listUnenrolledStudents(principal),
        accountService.listAccounts(principal, { role: 'student' }),
        accountService.listAccounts(principal, { role: 'teacher' }),
        academicService.listTeacherAssignments(principal),
        academicService.listTimetableEntries(principal),
      ]);

      setOverview(ovRes);
      setClasses(clsRes);
      setBatches(batRes);
      setSubjects(subRes);
      setEnrolments(enrRes);
      setUnenrolledStudents(unenrRes);
      setStudentAccounts(studentsRes);
      setTeacherAccounts(teachersRes);
      setAssignments(asgRes);
      setTimetable(ttRes);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load academic management data.'
      );
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Card title="Access Restricted">
        <Alert tone="error">
          Only authenticated Admin accounts may manage academic operations.
        </Alert>
      </Card>
    );
  }

  const handleChanged = (msg: string) => {
    showToast(msg);
    void loadAll();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Admin Academic Operations · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Development Adapter'}`}
        title="Academic Management"
      />

      {toast && (
        <Alert tone="success" onDismiss={() => setToast(null)}>
          {toast}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile
            label="Active Classes"
            value={overview.activeClasses}
            caption={`${overview.totalClasses} total`}
          />
          <StatTile
            label="Active Batches"
            value={overview.activeBatches}
            caption={`${overview.totalBatches} total`}
          />
          <StatTile
            label="Enrolled Students"
            value={overview.enrolledStudents}
            caption={`${unenrolledStudents.length} unenrolled`}
          />
          <StatTile
            label="Timetable Sessions"
            value={overview.activeTimetableSessions}
            caption={`${overview.activeAssignments} assignments`}
          />
        </div>
      )}

      <Tabs
        items={ACADEMIC_TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Academic management modules"
      />

      {activeTab === 'classes' && (
        <ClassesSection
          actor={principal}
          classes={classes}
          batches={batches}
          enrolments={enrolments}
          loading={loading}
          onChanged={handleChanged}
        />
      )}

      {activeTab === 'batches' && (
        <BatchesSection
          actor={principal}
          classes={classes}
          batches={batches}
          enrolments={enrolments}
          loading={loading}
          onChanged={handleChanged}
        />
      )}

      {activeTab === 'subjects' && (
        <SubjectsSection
          actor={principal}
          classes={classes}
          subjects={subjects}
          loading={loading}
          onChanged={handleChanged}
        />
      )}

      {activeTab === 'enrolments' && (
        <EnrolmentsSection
          actor={principal}
          classes={classes}
          batches={batches}
          enrolments={enrolments}
          studentAccounts={studentAccounts}
          unenrolledStudents={unenrolledStudents}
          loading={loading}
          onChanged={handleChanged}
        />
      )}

      {activeTab === 'assignments' && (
        <AssignmentsSection
          actor={principal}
          classes={classes}
          batches={batches}
          subjects={subjects}
          teacherAccounts={teacherAccounts}
          assignments={assignments}
          loading={loading}
          onChanged={handleChanged}
        />
      )}

      {activeTab === 'timetable' && (
        <TimetableSection
          actor={principal}
          classes={classes}
          batches={batches}
          subjects={subjects}
          teacherAccounts={teacherAccounts}
          assignments={assignments}
          entries={timetable}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
}

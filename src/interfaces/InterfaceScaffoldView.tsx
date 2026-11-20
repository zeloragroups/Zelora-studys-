import { useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { INTERFACE_SPECS, type WebInterfaceId } from '../config/navigation';
import { useAuth } from '../context/AuthContext';
import { useInterface } from '../context/InterfaceContext';
import { ResponsiveShell } from '../components/layout/ResponsiveShell';
import { Card } from '../components/ui/Card';
import { StatusText } from '../components/ui/StatusText';
import { Button } from '../components/ui/Button';
import { AccountManagementModule } from '../components/accounts/AccountManagementModule';
import { AdminOverviewSection } from '../components/academics/AdminOverviewSection';
import { AcademicManagementModule, type AcademicTabId } from '../components/academics/AcademicManagementModule';
import { AnnouncementsModule } from '../components/academics/AnnouncementsModule';
import { TeacherAcademicWorkspace } from '../components/academics/TeacherAcademicWorkspace';
import { TeacherHomeDashboard } from '../components/academics/TeacherHomeDashboard';
import { StudentAcademicWorkspace } from '../components/academics/StudentAcademicWorkspace';
import { StudentLearningHub } from '../components/academics/StudentLearningHub';
import { AdminAttendanceModule } from '../components/attendance/AdminAttendanceModule';
import { TeacherAttendanceModule } from '../components/attendance/TeacherAttendanceModule';
import { StudentAttendanceModule } from '../components/attendance/StudentAttendanceModule';
import { AdminAssessmentOverviewModule } from '../components/assessments/AdminAssessmentOverviewModule';
import { TeacherHomeworkModule } from '../components/assessments/TeacherHomeworkModule';
import { TeacherTestsExaminationsModule } from '../components/assessments/TeacherTestsExaminationsModule';
import { StudentHomeworkModule } from '../components/assessments/StudentHomeworkModule';
import { StudentTestsAndResultsModule } from '../components/assessments/StudentTestsAndResultsModule';
import { AdminFinanceModule, type AdminFinanceTab } from '../components/finance/AdminFinanceModule';
import { StudentFeesModule } from '../components/finance/StudentFeesModule';
import { TeacherSalaryModule } from '../components/finance/TeacherSalaryModule';
import { RoleProfileView } from '../components/profile/RoleProfileView';
import { AdminSettingsModule } from '../components/settings/AdminSettingsModule';
import { MemberSettingsModule } from '../components/settings/MemberSettingsModule';
import { ROLE_PERMISSION_MATRIX } from '../types';

interface InterfaceScaffoldViewProps {
  interfaceId: Exclude<WebInterfaceId, 'foundation-hub'>;
  roleLabel: string;
  roleAccessSummary: string;
  showBottomThumbBar: boolean;
  onSignOut?: () => void;
  headerRightExtra?: ReactNode;
}

/**
 * Unified Workspace Shell across Admin Website, Admin Web App, Teacher Web App, and Student Web App.
 * Routes every role's 5-slot centered-Home bottom navigation, grouped sidebar/drawer items,
 * and Phase 3–6 operational modules cleanly.
 */
export function InterfaceScaffoldView({
  interfaceId,
  roleLabel,
  roleAccessSummary,
  showBottomThumbBar,
  onSignOut,
  headerRightExtra,
}: InterfaceScaffoldViewProps) {
  const { branding, publicSettings } = useInterface();
  const { principal, session } = useAuth();
  const spec = INTERFACE_SPECS[interfaceId];

  const [activeNavId, setActiveNavId] = useState(spec.navItems[0].id);
  const [adminAcademicTab, setAdminAcademicTab] = useState<AcademicTabId>('classes');
  const [adminFinanceTab, setAdminFinanceTab] = useState<AdminFinanceTab>('overview');
  const [studentLearningTab, setStudentLearningTab] = useState<'homework' | 'academics'>(
    'homework'
  );
  const [studentAssessmentTab, setStudentAssessmentTab] = useState<
    'tests' | 'examinations' | 'results'
  >('tests');
  const [studentNoticeTab, setStudentNoticeTab] = useState<
    'notifications' | 'announcements'
  >('notifications');

  const handleAdminNavigate = (navId: string, subTab?: string) => {
    if (navId === 'reports') {
      setAdminFinanceTab('reports');
      setActiveNavId('finance');
      return;
    }
    if (
      navId === 'academics' &&
      (subTab === 'classes' ||
        subTab === 'batches' ||
        subTab === 'subjects' ||
        subTab === 'enrolments' ||
        subTab === 'assignments' ||
        subTab === 'timetable')
    ) {
      setAdminAcademicTab(subTab);
    } else if (
      navId === 'finance' &&
      (subTab === 'overview' ||
        subTab === 'verification_queue' ||
        subTab === 'student_accounts' ||
        subTab === 'fee_config' ||
        subTab === 'upi_config' ||
        subTab === 'receipts' ||
        subTab === 'salaries' ||
        subTab === 'reports' ||
        subTab === 'audit')
    ) {
      setAdminFinanceTab(subTab);
    }
    setActiveNavId(navId);
  };

  const handleStudentNavigate = (navId: string, subTab?: string) => {
    if (navId === 'learning' && (subTab === 'homework' || subTab === 'academics')) {
      setStudentLearningTab(subTab);
    } else if (
      navId === 'assessments' &&
      (subTab === 'tests' || subTab === 'examinations' || subTab === 'results')
    ) {
      setStudentAssessmentTab(subTab);
    } else if (
      navId === 'notices' &&
      (subTab === 'notifications' || subTab === 'announcements')
    ) {
      setStudentNoticeTab(subTab);
    }
    setActiveNavId(navId);
  };

  const currentSection =
    spec.navItems.find((item) => item.id === activeNavId) ?? spec.navItems[0];

  const permissionCount = principal
    ? ROLE_PERMISSION_MATRIX[principal.role].length
    : 0;

  const renderSectionContent = (): ReactNode => {
    if (activeNavId === 'profile') {
      return (
        <RoleProfileView
          roleLabel={roleLabel}
          roleAccessSummary={roleAccessSummary}
          onSignOut={onSignOut}
        />
      );
    }

    if (
      principal?.role === 'admin' &&
      (interfaceId === 'admin-website' || interfaceId === 'admin-webapp')
    ) {
      if (
        (interfaceId === 'admin-website' && activeNavId === 'home') ||
        (interfaceId === 'admin-webapp' && activeNavId === 'pulse')
      ) {
        return (
          <AdminOverviewSection
            mode={interfaceId === 'admin-website' ? 'website' : 'webapp'}
            variant="home"
            onNavigate={setActiveNavId}
          />
        );
      }
      if (activeNavId === 'overview') {
        return (
          <AdminOverviewSection
            mode={interfaceId === 'admin-website' ? 'website' : 'webapp'}
            variant="overview"
            onNavigate={setActiveNavId}
          />
        );
      }
      if (
        (interfaceId === 'admin-website' && activeNavId === 'accounts') ||
        (interfaceId === 'admin-webapp' && activeNavId === 'lookup')
      ) {
        return <AccountManagementModule />;
      }
      if (activeNavId === 'academics') {
        return <AcademicManagementModule initialTab={adminAcademicTab} />;
      }
      if (activeNavId === 'attendance') {
        return <AdminAttendanceModule />;
      }
      if (activeNavId === 'assessments') {
        return <AdminAssessmentOverviewModule />;
      }
      if (activeNavId === 'finance' || activeNavId === 'verifications') {
        return <AdminFinanceModule initialTab={adminFinanceTab} />;
      }
      if (activeNavId === 'reports') {
        return <AdminFinanceModule initialTab="reports" />;
      }
      if (
        (interfaceId === 'admin-website' && activeNavId === 'announcements') ||
        (interfaceId === 'admin-webapp' && activeNavId === 'notices')
      ) {
        return <AnnouncementsModule />;
      }
      if (activeNavId === 'settings') {
        return (
          <AdminSettingsModule
            onNavigateShortcut={handleAdminNavigate}
            onSignOut={onSignOut}
          />
        );
      }
    }

    if (principal?.role === 'teacher' && interfaceId === 'teacher-webapp') {
      if (activeNavId === 'home') {
        return <TeacherHomeDashboard onNavigate={setActiveNavId} />;
      }
      if (activeNavId === 'classes') {
        return <TeacherAcademicWorkspace section="classes" />;
      }
      if (activeNavId === 'notices') {
        return <TeacherAcademicWorkspace section="notices" />;
      }
      if (activeNavId === 'attendance') {
        return <TeacherAttendanceModule />;
      }
      if (activeNavId === 'homework') {
        return <TeacherHomeworkModule />;
      }
      if (activeNavId === 'assessments') {
        return <TeacherTestsExaminationsModule />;
      }
      if (activeNavId === 'salary') {
        return <TeacherSalaryModule />;
      }
      if (activeNavId === 'settings') {
        return (
          <MemberSettingsModule
            roleLabel={roleLabel}
            roleAccessSummary={roleAccessSummary}
            onNavigate={setActiveNavId}
            onSignOut={onSignOut}
          />
        );
      }
    }

    if (principal?.role === 'student' && interfaceId === 'student-webapp') {
      if (activeNavId === 'dashboard') {
        return (
          <StudentAcademicWorkspace
            section="home"
            onNavigate={handleStudentNavigate}
          />
        );
      }
      if (activeNavId === 'learning') {
        return <StudentLearningHub initialTab={studentLearningTab} />;
      }
      if (activeNavId === 'homework') {
        return <StudentHomeworkModule />;
      }
      if (activeNavId === 'assessments') {
        return <StudentTestsAndResultsModule initialSubTab={studentAssessmentTab} />;
      }
      if (activeNavId === 'attendance') {
        return <StudentAttendanceModule />;
      }
      if (activeNavId === 'academics') {
        return <StudentAcademicWorkspace section="academics" />;
      }
      if (activeNavId === 'fees') {
        return <StudentFeesModule />;
      }
      if (activeNavId === 'notices') {
        return (
          <StudentAcademicWorkspace
            section="notices"
            initialNoticeTab={studentNoticeTab}
            onNavigate={handleStudentNavigate}
          />
        );
      }
      if (activeNavId === 'settings') {
        return (
          <MemberSettingsModule
            roleLabel={roleLabel}
            roleAccessSummary={roleAccessSummary}
            onNavigate={handleStudentNavigate}
            onSignOut={onSignOut}
          />
        );
      }
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
              {spec.audience} · {spec.primaryFormFactors}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] text-balance">
              {currentSection.sectionTitle}
            </h1>
          </div>
          <StatusText
            tone="nominal"
            label={
              principal
                ? `Authenticated: ${principal.loginId} (${roleLabel})`
                : `Planned Phase ${currentSection.plannedPhase}`
            }
          />
        </div>

        <Card
          title="Planned Module Scope"
          subtitle={currentSection.summary}
          action={
            onSignOut ? (
              <Button variant="secondary" size="sm" onClick={onSignOut}>
                Sign Out
              </Button>
            ) : undefined
          }
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                Interface Responsibility
              </h3>
              <p className="mt-1.5 text-sm text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                {spec.responsibility}
              </p>
              <p className="mt-3 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                Module implementation scheduled for Phase {currentSection.plannedPhase}.
              </p>
            </div>

            <div className="sm:border-l sm:border-[#E2E8E5] dark:sm:border-[#344047] sm:pl-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                <ShieldCheck
                  className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9] shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>Role & Session Boundary ({roleLabel})</span>
              </div>
              <p className="mt-1.5 text-sm text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                {roleAccessSummary}
              </p>
              {principal && (
                <p className="mt-3 text-xs font-mono text-[#68737C] dark:text-[#AAB6B4] tabular-nums">
                  Permissions granted: {permissionCount} · Session mode: {session.dataSourceMode}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[#E2E8E5] dark:border-[#344047] flex flex-wrap items-center justify-between gap-3 text-xs text-[#68737C] dark:text-[#AAB6B4]">
            <span>
              {session.dataSourceMode === 'firebase_connected'
                ? 'Firebase Status: Connected (academy-0007)'
                : 'Firebase Status: Local Development Mode (Explicit LOCAL_DEMO)'}
            </span>
            <span>Section Route: /{interfaceId}/{currentSection.id}</span>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <ResponsiveShell
      brandName={branding.centreName}
      logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
      interfaceTitle={spec.title}
      navItems={spec.navItems}
      bottomNav={spec.bottomNav}
      activeNavId={activeNavId}
      onSelectNav={setActiveNavId}
      authenticatedPrincipal={principal}
      onSignOut={onSignOut}
      headerRightExtra={headerRightExtra}
      showBottomThumbBar={showBottomThumbBar}
    >
      {renderSectionContent()}
    </ResponsiveShell>
  );
}

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarCheck2,
  FileSpreadsheet,
  GraduationCap,
  IndianRupee,
  LogOut,
  Megaphone,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  UserCircle2,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { useTheme } from '../../context/ThemeContext';
import { academicService } from '../../services';
import { studentPortalService } from '../../services';
import type { StudentProfileSummary } from '../../services/contracts/studentPortalService';
import type { TeacherWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatusText } from '../ui/StatusText';

interface RoleProfileViewProps {
  interfaceId: 'admin-website' | 'admin-webapp' | 'teacher-webapp' | 'student-webapp';
  roleLabel: string;
  roleAccessSummary: string;
  onSelectNav: (navId: string, subTab?: string) => void;
  onSignOut?: () => void;
}

export function RoleProfileView({
  interfaceId,
  roleLabel,
  roleAccessSummary,
  onSelectNav,
  onSignOut,
}: RoleProfileViewProps) {
  const { principal, session } = useAuth();
  const { branding } = useInterface();
  const {
    theme,
    defaultTheme,
    allowPersonalThemePreference,
    hasPersonalPreference,
    setTheme,
    resetToDefaultTheme,
  } = useTheme();

  const [studentProfile, setStudentProfile] = useState<StudentProfileSummary | null>(null);
  const [teacherWs, setTeacherWs] = useState<TeacherWorkspaceData | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!principal) return;
    if (principal.role === 'student') {
      void studentPortalService
        .getMyStudentProfile(principal)
        .then((res) => {
          if (!cancelled) setStudentProfile(res);
        })
        .catch(() => {});
    } else if (principal.role === 'teacher') {
      void academicService
        .getMyTeacherWorkspace(principal)
        .then((res) => {
          if (!cancelled) setTeacherWs(res);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [principal]);

  if (!principal) return null;

  const shortcuts =
    principal.role === 'admin'
      ? [
          {
            navId: 'settings',
            label: 'Application Settings & Branding',
            description: 'Centre profile, dynamic app name, logo preview & system controls',
            icon: Settings,
          },
          {
            navId: 'finance',
            label: 'Fees & Teacher Salaries',
            description: 'Verify UPI claims, issue receipts & manage payroll',
            icon: IndianRupee,
          },
          {
            navId: interfaceId === 'admin-website' ? 'accounts' : 'lookup',
            label: 'Manage Accounts',
            description: 'Create & manage Teacher and Student IDs',
            icon: Users,
          },
          {
            navId: 'attendance',
            label: 'Attendance & Alerts',
            description: 'Monitor sessions and audited corrections',
            icon: CalendarCheck2,
          },
          {
            navId: interfaceId === 'admin-website' ? 'announcements' : 'notices',
            label: 'Centre Notices',
            description: 'Draft and publish announcements',
            icon: Megaphone,
          },
        ]
      : principal.role === 'teacher'
        ? [
            {
              navId: 'salary',
              label: 'My Salary & Payouts',
              description: 'Inspect monthly calculated salary & payment history',
              icon: Banknote,
            },
            {
              navId: 'assessments',
              label: 'Tests, Exams & Marks',
              description: 'Build online MCQ tests, exams & enter marks',
              icon: FileSpreadsheet,
            },
            {
              navId: 'notices',
              label: 'Centre Notices',
              description: 'Read announcements for your classes',
              icon: Megaphone,
            },
            {
              navId: 'classes',
              label: 'Classes & Timetable',
              description: 'Review assigned batches and weekly timetable',
              icon: BookOpen,
            },
          ]
        : [
            {
              navId: 'fees',
              label: 'Fees & Receipts',
              description: 'View balance, Pay Now via UPI & print verified receipts',
              icon: IndianRupee,
            },
            {
              navId: 'notices',
              label: 'Notices & Alerts',
              description: 'Absence notifications, test alerts & announcements',
              icon: Megaphone,
            },
            {
              navId: 'homework',
              label: 'My Homework',
              description: 'View text-only homework & submit work',
              icon: BookOpen,
            },
            {
              navId: 'assessments',
              label: 'Tests, Exams & Results',
              description: 'Attempt online tests and view released marks',
              icon: FileSpreadsheet,
            },
          ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${branding.academicYearLabel}`}
        title="Account & Preferences"
        subtitle="Manage your theme preference, review your role scope, and jump quickly across sections."
        rightSlot={
          <StatusText
            tone="nominal"
            label={`${principal.loginId} · ${roleLabel}`}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Identity Card */}
        <Card title="Profile Identity" subtitle="Authenticated session details">
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#C4B5FD] flex items-center justify-center shrink-0 border border-[#7552D9]/20 dark:border-[#8B5CF6]/30">
                <UserCircle2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                  {principal.fullName}
                </p>
                <p className="text-xs font-mono text-[#687086] dark:text-[#A6B0C3]">
                  {principal.loginId} · Role: {roleLabel}
                </p>
              </div>
            </div>

            {principal.role === 'student' && studentProfile && (
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[#687086] dark:text-[#A6B0C3]">Student ID</p>
                    <p className="mt-0.5 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {studentProfile.studentId}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#687086] dark:text-[#A6B0C3]">Account Status</p>
                    <div className="mt-0.5">
                      <StatusText
                        tone={studentProfile.accountStatus === 'active' ? 'nominal' : 'danger'}
                        label={studentProfile.accountStatus === 'active' ? 'Active' : 'Deactivated'}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[#687086] dark:text-[#A6B0C3]">Registered Phone</p>
                    <p className="mt-0.5 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {studentProfile.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#687086] dark:text-[#A6B0C3]">Enrolment Status</p>
                    <div className="mt-0.5">
                      <StatusText
                        tone={
                          studentProfile.enrolmentStatus === 'active'
                            ? 'nominal'
                            : studentProfile.enrolmentStatus === 'inactive'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={
                          studentProfile.enrolmentStatus === 'active'
                            ? 'Active Enrolment'
                            : studentProfile.enrolmentStatus === 'inactive'
                              ? 'Inactive Enrolment'
                              : 'Not Enrolled'
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-1">
                  <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                    Class & Batch Placement
                  </p>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    {studentProfile.enrolmentStatus === 'active'
                      ? `${studentProfile.className ?? studentProfile.classId} · ${studentProfile.batchName ?? studentProfile.batchId}`
                      : 'Not currently enrolled in an active batch'}
                  </p>
                  {studentProfile.enrolmentId && (
                    <p className="text-[11px] font-mono text-[#687086] dark:text-[#A6B0C3]">
                      Enrolment ID: {studentProfile.enrolmentId}
                      {studentProfile.enrolmentDate ? ` · Since ${studentProfile.enrolmentDate}` : ''}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                  <p>{studentProfile.immutableNotice}</p>
                  <p>Parents share this Student ID and password to inspect attendance, marks, fees, and notifications.</p>
                </div>
              </div>
            )}

            {principal.role === 'teacher' && teacherWs && (
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 space-y-1">
                <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                  Assigned Teaching Scope
                </p>
                <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                  {teacherWs.assignments.length} active subject-batch assignment(s) ·{' '}
                  {teacherWs.timetable.length} weekly session(s)
                </p>
              </div>
            )}

            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                <ShieldCheck className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                <span>Access & Security Policy</span>
              </div>
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                {roleAccessSummary}
              </p>
              <p className="text-[11px] font-mono text-[#687086] dark:text-[#A6B0C3] pt-1">
                Session:{' '}
                {session.dataSourceMode === 'firebase_connected'
                  ? 'Firebase Production Connected (academy-0007)'
                  : session.dataSourceMode === 'local_demo_adapter'
                    ? 'Local Development Adapter'
                    : 'Firebase Configuration Error'}
              </p>
            </div>
          </div>
        </Card>

        {/* Theme & Session Controls */}
        <Card
          title="Appearance & Session"
          subtitle={
            allowPersonalThemePreference
              ? `Switch between Light and Dark Navy themes (Centre default: ${defaultTheme === 'dark' ? 'Dark Navy' : 'Light Mode'})`
              : `Locked to Centre Default (${defaultTheme === 'dark' ? 'Dark Navy' : 'Light Mode'}) by Administrator`
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Theme preference">
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                disabled={!allowPersonalThemePreference}
                onClick={() => setTheme('light')}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all space-y-2',
                  allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
                  theme === 'light'
                    ? 'border-[#7552D9] bg-[#F1EEFA] ring-2 ring-[#7552D9]/20'
                    : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/60 hover:bg-[#F8F9FC] dark:hover:bg-[#202844]'
                )}
              >
                <div className="flex items-center justify-between">
                  <Sun className="w-4 h-4 text-[#7552D9]" aria-hidden="true" />
                  {theme === 'light' && (
                    <span className="text-[11px] font-semibold text-[#7552D9]">Active</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Light Mode
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Crisp soft white & lavender
                  </p>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                disabled={!allowPersonalThemePreference}
                onClick={() => setTheme('dark')}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all space-y-2',
                  allowPersonalThemePreference ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed',
                  theme === 'dark'
                    ? 'border-[#8B5CF6] bg-[#202844] ring-2 ring-[#8B5CF6]/25'
                    : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/60 hover:bg-[#F8F9FC] dark:hover:bg-[#202844]'
                )}
              >
                <div className="flex items-center justify-between">
                  <Moon className="w-4 h-4 text-[#A78BFA]" aria-hidden="true" />
                  {theme === 'dark' && (
                    <span className="text-[11px] font-semibold text-[#C4B5FD]">Active</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Dark Navy
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Deep navy & electric purple
                  </p>
                </div>
              </button>
            </div>

            {allowPersonalThemePreference && hasPersonalPreference && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                <span>Using personal theme override on this device.</span>
                <button
                  type="button"
                  onClick={resetToDefaultTheme}
                  className="font-medium text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
                >
                  Follow Centre Default ({defaultTheme === 'dark' ? 'Dark Navy' : 'Light Mode'})
                </button>
              </div>
            )}

            {onSignOut && (
              <div className="pt-4 border-t border-[#E5E7EF] dark:border-[#303A55] flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                  Signed in as <span className="font-mono font-semibold">{principal.loginId}</span>
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onSignOut}
                  iconLeft={<LogOut className="w-4 h-4" aria-hidden="true" />}
                >
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Navigation Shortcuts */}
      <Card
        title="Quick Workspace Shortcuts"
        subtitle="Open secondary modules and full tools in one tap."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.navId}
                type="button"
                onClick={() => onSelectNav(item.navId)}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:bg-[#F1EEFA] dark:hover:bg-[#202844] p-4 text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] text-[#7552D9] dark:text-[#A78BFA] inline-flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                      {item.label}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3] mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ArrowRight
                  className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] group-hover:text-[#7552D9] dark:group-hover:text-[#C4B5FD] shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

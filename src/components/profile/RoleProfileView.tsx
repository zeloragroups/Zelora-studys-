import { useEffect, useState, type FormEvent } from 'react';
import {
  KeyRound,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { useTheme } from '../../context/ThemeContext';
import { academicService } from '../../services';
import { studentPortalService } from '../../services';
import type { StudentProfileSummary } from '../../services/contracts/studentPortalService';
import type { TeacherWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { PageHeader } from '../ui/PageHeader';
import { StatusText } from '../ui/StatusText';

interface RoleProfileViewProps {
  roleLabel: string;
  roleAccessSummary: string;
  onSignOut?: () => void;
}

export function RoleProfileView({
  roleLabel,
  roleAccessSummary,
  onSignOut,
}: RoleProfileViewProps) {
  const { principal, session, changeMyPassword } = useAuth();
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

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

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

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (!currentPassword) {
      setPwError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwError('New password must differ from your current password.');
      return;
    }

    setPwSaving(true);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPwSuccess('Your password has been updated cleanly.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to update password right now.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${branding.academicYearLabel}`}
        title="Account & Preferences"
        subtitle="Manage your theme preference, review your role scope, and update your session settings."
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
              <div className="w-12 h-12 rounded-2xl bg-[#20262B] dark:bg-[#244B3E] text-[#35D6A0] dark:text-[#42DDA9] flex items-center justify-center shrink-0 border border-[#343C42] dark:border-[#316453] shadow-xs">
                <UserCircle2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#20262B] dark:text-[#F4F7F6] truncate">
                  {principal.fullName}
                </p>
                <p className="text-xs font-mono text-[#68737C] dark:text-[#AAB6B4]">
                  {principal.loginId} · Role: {roleLabel}
                </p>
              </div>
            </div>

            {principal.role === 'student' && studentProfile && (
              <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E]/70 p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[#68737C] dark:text-[#AAB6B4]">Student ID</p>
                    <p className="mt-0.5 font-mono font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {studentProfile.studentId}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#68737C] dark:text-[#AAB6B4]">Account Status</p>
                    <div className="mt-0.5">
                      <StatusText
                        tone={studentProfile.accountStatus === 'active' ? 'nominal' : 'danger'}
                        label={studentProfile.accountStatus === 'active' ? 'Active' : 'Deactivated'}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[#68737C] dark:text-[#AAB6B4]">Registered Phone</p>
                    <p className="mt-0.5 font-mono font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {studentProfile.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#68737C] dark:text-[#AAB6B4]">Enrolment Status</p>
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

                <div className="pt-2.5 border-t border-[#E2E8E5] dark:border-[#344047] space-y-1">
                  <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
                    Class & Batch Placement
                  </p>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    {studentProfile.enrolmentStatus === 'active'
                      ? `${studentProfile.className ?? studentProfile.classId} · ${studentProfile.batchName ?? studentProfile.batchId}`
                      : 'Not currently enrolled in an active batch'}
                  </p>
                  {studentProfile.enrolmentId && (
                    <p className="text-[11px] font-mono text-[#68737C] dark:text-[#AAB6B4]">
                      Enrolment ID: {studentProfile.enrolmentId}
                      {studentProfile.enrolmentDate ? ` · Since ${studentProfile.enrolmentDate}` : ''}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-[#E2E8E5] dark:border-[#344047] space-y-1 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  <p>{studentProfile.immutableNotice}</p>
                  <p>Parents share this Student ID and password to inspect attendance, marks, fees, and notifications.</p>
                </div>
              </div>
            )}

            {principal.role === 'teacher' && teacherWs && (
              <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E]/70 p-3.5 space-y-1">
                <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
                  Assigned Teaching Scope
                </p>
                <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6] tabular-nums">
                  {teacherWs.assignments.length} active subject-batch assignment(s) ·{' '}
                  {teacherWs.timetable.length} weekly session(s)
                </p>
              </div>
            )}

            <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                <ShieldCheck className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                <span>Access & Security Policy</span>
              </div>
              <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                {roleAccessSummary}
              </p>
              <p className="text-[11px] font-mono text-[#68737C] dark:text-[#AAB6B4] pt-1">
                Session:{' '}
                {session.dataSourceMode === 'firebase_connected'
                  ? 'Firebase Production Connected (academy-0007 · Spark Free Plan)'
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
              ? `Switch between Light and Dark themes (Centre default: ${defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'})`
              : `Locked to Centre Default (${defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'}) by Administrator`
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
                    ? 'border-[#35D6A0] bg-[#DDF8EE]/70 ring-2 ring-[#35D6A0]/25'
                    : 'border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#151A1E]/70 hover:bg-[#F0F4F2] dark:hover:bg-[#252E33]'
                )}
              >
                <div className="flex items-center justify-between">
                  <Sun className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                  {theme === 'light' && (
                    <span className="text-[11px] font-semibold text-[#168A63]">Active</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Light Mode
                  </p>
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    Crisp white, charcoal & mint
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
                    ? 'border-[#42DDA9] bg-[#244B3E] ring-2 ring-[#42DDA9]/25'
                    : 'border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#151A1E]/70 hover:bg-[#F0F4F2] dark:hover:bg-[#252E33]'
                )}
              >
                <div className="flex items-center justify-between">
                  <Moon className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                  {theme === 'dark' && (
                    <span className="text-[11px] font-semibold text-[#42DDA9]">Active</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Dark Charcoal
                  </p>
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    Deep slate & emerald mint
                  </p>
                </div>
              </button>
            </div>

            {allowPersonalThemePreference && hasPersonalPreference && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                <span>Using personal theme override on this device.</span>
                <button
                  type="button"
                  onClick={resetToDefaultTheme}
                  className="font-medium text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer"
                >
                  Follow Centre Default ({defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'})
                </button>
              </div>
            )}

            {onSignOut && (
              <div className="pt-4 border-t border-[#E2E8E5] dark:border-[#344047] flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  Signed in as <span className="font-mono font-semibold text-[#20262B] dark:text-[#F4F7F6]">{principal.loginId}</span>
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

      {/* Self-service Password Change for Teacher & Student */}
      {(principal.role === 'teacher' || principal.role === 'student') && (
        <Card
          title="Change Password"
          subtitle="Update your own sign-in password securely after verifying your current password."
        >
          <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>
            {pwError && <Alert tone="error">{pwError}</Alert>}
            {pwSuccess && <Alert tone="success">{pwSuccess}</Alert>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Current Password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <Input
                label="New Password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
              <Input
                label="Confirm New Password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                loading={pwSaving}
                iconLeft={<KeyRound className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Update Password
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}


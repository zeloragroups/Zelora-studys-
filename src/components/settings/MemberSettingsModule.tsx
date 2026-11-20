import { useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserCircle2,
} from 'lucide-react';
import { APP_PACKAGE_VERSION } from '../../config/branding';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { useTheme } from '../../context/ThemeContext';
import { academicService, isFirebaseConnectedMode, studentPortalService } from '../../services';
import type { StudentProfileSummary } from '../../services/contracts/studentPortalService';
import type { TeacherWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { StatusText } from '../ui/StatusText';
import { SettingsShell, type SettingsCategoryItem } from './SettingsShell';

type MemberSettingsCategory =
  | 'my_account'
  | 'appearance'
  | 'security'
  | 'notifications'
  | 'app_info';

interface MemberSettingsModuleProps {
  roleLabel: string;
  roleAccessSummary: string;
  onNavigate: (navId: string) => void;
  onSignOut?: () => void;
}

/**
 * Strictly role-scoped Settings module for Teachers and Students.
 * Never renders Admin-only branding, centre configuration, system migration, or fee rule controls.
 */
export function MemberSettingsModule({
  roleLabel,
  roleAccessSummary,
  onNavigate,
  onSignOut,
}: MemberSettingsModuleProps) {
  const { principal, session, changeMyPassword } = useAuth();
  const { branding, publicSettings } = useInterface();
  const {
    theme,
    defaultTheme,
    allowPersonalThemePreference,
    hasPersonalPreference,
    setTheme,
    resetToDefaultTheme,
  } = useTheme();

  const [activeCategory, setActiveCategory] = useState<MemberSettingsCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentProfile, setStudentProfile] = useState<StudentProfileSummary | null>(null);
  const [teacherWs, setTeacherWs] = useState<TeacherWorkspaceData | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
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
        .catch(() => undefined);
    } else if (principal.role === 'teacher') {
      void academicService
        .getMyTeacherWorkspace(principal)
        .then((res) => {
          if (!cancelled) setTeacherWs(res);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [principal]);

  if (!principal || (principal.role !== 'teacher' && principal.role !== 'student')) {
    return (
      <Alert tone="error" title="Access Restricted">
        Member settings are available only for authenticated Teacher and Student accounts.
      </Alert>
    );
  }

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
      setPwSuccess('Your password has been updated.');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Unable to update password right now.');
    } finally {
      setPwSaving(false);
    }
  };

  const notifCats = publicSettings.notificationPreferences.enabledCategories;
  const activeAlertCount = [
    notifCats.attendance,
    notifCats.homeworkTests,
    notifCats.examsResults,
    notifCats.feesReceipts,
  ].filter(Boolean).length;

  const categories: SettingsCategoryItem<MemberSettingsCategory>[] = [
    {
      id: 'my_account',
      title: 'My Account',
      description:
        principal.role === 'student'
          ? 'Review your Student ID, registered phone, batch enrolment, and profile policy.'
          : 'Review your Teacher ID, assigned classes and subjects, and account scope.',
      summary: `${principal.loginId} · ${principal.fullName}`,
      group: 'Account & Security',
      keywords: ['profile', 'id', 'batch', 'class', 'phone', 'enrolment'],
      icon: UserCircle2,
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description:
        'Choose your Light Mode or Dark Charcoal theme on this device when allowed by the centre.',
      summary: allowPersonalThemePreference
        ? `${theme === 'dark' ? 'Dark Charcoal' : 'Light Mode'}${hasPersonalPreference ? ' · Personal' : ' · Centre Default'}`
        : `Locked to ${defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'}`,
      group: 'Preferences',
      keywords: ['theme', 'dark', 'light', 'mode', 'charcoal'],
      icon: Palette,
    },
    {
      id: 'security',
      title: 'Security',
      description: 'Update your sign-in password and manage your active session.',
      summary: 'Self-service password update & Sign Out',
      group: 'Account & Security',
      keywords: ['password', 'sign out', 'logout', 'session'],
      icon: ShieldCheck,
    },
    {
      id: 'notifications',
      title: 'Notification Preferences',
      description: 'Inspect active in-app alert categories configured for your portal.',
      summary: `${activeAlertCount} of 4 alert categories active`,
      group: 'Preferences',
      keywords: ['alerts', 'notices', 'in-app', 'sms', 'email'],
      icon: Bell,
    },
    {
      id: 'app_info',
      title: 'Application Information',
      description: 'View current centre branding, application version, and workspace environment.',
      summary: `${branding.centreName} · v${APP_PACKAGE_VERSION}`,
      group: 'About',
      keywords: ['version', 'about', 'centre', 'session'],
      icon: Info,
    },
  ];

  const renderCategoryContent = (categoryId: MemberSettingsCategory) => {
    switch (categoryId) {
      case 'my_account':
        return (
          <Card
            title="Account & Academic Placement"
            subtitle="Identity fields and role scope managed by your tuition centre Administrator."
            action={<StatusText tone="nominal" label={`${roleLabel} · Active`} />}
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5">
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">Full Name</p>
                  <p className="mt-1 font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    {principal.fullName}
                  </p>
                </div>
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/60 p-3.5">
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">Login ID</p>
                  <p className="mt-1 font-mono font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    {principal.loginId}
                  </p>
                </div>
              </div>

              {principal.role === 'student' && studentProfile && (
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[#68737C] dark:text-[#AAB6B4]">Registered Phone</p>
                      <p className="mt-0.5 font-mono font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                        {studentProfile.phone}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#68737C] dark:text-[#AAB6B4]">Enrolment Status</p>
                      <div className="mt-0.5">
                        <StatusText
                          tone={studentProfile.enrolmentStatus === 'active' ? 'nominal' : 'warning'}
                          label={
                            studentProfile.enrolmentStatus === 'active'
                              ? 'Active Enrolment'
                              : 'Not Currently Enrolled'
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="pt-2.5 border-t border-[#E2E8E5] dark:border-[#344047]">
                    <p className="text-[#68737C] dark:text-[#AAB6B4]">Class & Batch</p>
                    <p className="mt-0.5 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                      {studentProfile.enrolmentStatus === 'active'
                        ? `${studentProfile.className ?? studentProfile.classId} · ${studentProfile.batchName ?? studentProfile.batchId}`
                        : 'No active batch assigned'}
                    </p>
                  </div>
                  <p className="text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                    {studentProfile.immutableNotice}
                  </p>
                </div>
              )}

              {principal.role === 'teacher' && teacherWs && (
                <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-1.5 text-xs">
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Assigned Teaching Scope</p>
                  <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] tabular-nums">
                    {teacherWs.assignments.length} active subject-batch assignment(s) ·{' '}
                    {teacherWs.timetable.length} weekly timetable session(s)
                  </p>
                </div>
              )}

              <Alert tone="info" title="Role Boundary">
                {roleAccessSummary}
              </Alert>
            </div>
          </Card>
        );

      case 'appearance':
        return (
          <Card
            title="Device Theme Preference"
            subtitle={
              allowPersonalThemePreference
                ? `Select Light Mode or Dark Charcoal on this device. Centre default is ${defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'}.`
                : `Your centre Administrator has locked this portal to ${defaultTheme === 'dark' ? 'Dark Charcoal' : 'Light Mode'}.`
            }
          >
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Theme preference">
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
                      ? 'border-[#18B985] bg-[#DDF8EE]/70 ring-2 ring-[#35D6A0]/25'
                      : 'border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#151A1E]/70 hover:bg-[#F0F4F2] dark:hover:bg-[#252E33]'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Sun className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                    {theme === 'light' && <StatusText tone="nominal" label="Active" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                      Light Mode
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      Crisp white canvas, charcoal text & mint accents
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
                    <Moon className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                    {theme === 'dark' && <StatusText tone="nominal" label="Active" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                      Dark Charcoal
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      Deep charcoal surfaces & high-contrast mint
                    </p>
                  </div>
                </button>
              </div>

              {allowPersonalThemePreference && hasPersonalPreference && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E2E8E5] dark:border-[#344047] text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  <span>Personal theme override is active on this browser.</span>
                  <Button variant="secondary" size="sm" onClick={resetToDefaultTheme}>
                    Follow Centre Default
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );

      case 'security':
        return (
          <div className="space-y-5">
            <Card
              title="Change Password"
              subtitle="Verify your current password and set a new sign-in password (minimum 8 characters)."
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPasswords((prev) => !prev)}
                  iconLeft={
                    showPasswords ? (
                      <EyeOff className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                    )
                  }
                >
                  {showPasswords ? 'Hide' : 'Show'}
                </Button>
              }
            >
              <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>
                {pwError && <Alert tone="error">{pwError}</Alert>}
                {pwSuccess && <Alert tone="success">{pwSuccess}</Alert>}

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    label="Current Password"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <Input
                    label="New Password"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                  <Input
                    label="Confirm New Password"
                    type={showPasswords ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
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
                    iconLeft={<KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
                  >
                    Update Password
                  </Button>
                </div>
              </form>
            </Card>

            {onSignOut && (
              <Card
                title="Active Session"
                subtitle={`Signed in as ${principal.loginId} (${roleLabel}).`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    Sign out cleanly before leaving a shared classroom or family device.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={onSignOut}
                    iconLeft={<LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                  >
                    Sign Out
                  </Button>
                </div>
              </Card>
            )}
          </div>
        );

      case 'notifications':
        return (
          <Card
            title="In-App Alert Policy"
            subtitle="Categories enabled by your Administrator for portal notifications."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('notices')}
              >
                Open Notices
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047] text-sm">
                {[
                  {
                    label: 'Attendance & Absence Alerts',
                    enabled: notifCats.attendance,
                    desc: 'Recorded absence notices and audited attendance corrections',
                  },
                  {
                    label: 'Homework & Online Tests',
                    enabled: notifCats.homeworkTests,
                    desc: 'Newly published homework, feedback, and objective tests',
                  },
                  {
                    label: 'Examinations & Results',
                    enabled: notifCats.examsResults,
                    desc: 'Examination schedules and teacher-released marks',
                  },
                  {
                    label: 'Fees, Verification & Receipts',
                    enabled: notifCats.feesReceipts,
                    desc: 'Fee due reminders, UPI verification updates, and receipts',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">
                        {item.label}
                      </p>
                      <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">{item.desc}</p>
                    </div>
                    <StatusText
                      tone={item.enabled ? 'nominal' : 'neutral'}
                      label={item.enabled ? 'Enabled' : 'Hidden'}
                    />
                  </div>
                ))}
              </div>

              <Alert tone="info">
                All notifications appear inside the application only. Automated SMS, WhatsApp, email, or external push notifications are not active.
              </Alert>
            </div>
          </Card>
        );

      case 'app_info':
        return (
          <Card
            title="Application Information"
            subtitle="Verified portal identity and release summary."
          >
            <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047] text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Centre Name</span>
                <span className="font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                  {branding.centreName}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Academic Session</span>
                <span className="font-medium text-[#171D21] dark:text-[#F4F7F6]">
                  {branding.academicYearLabel}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Application Version</span>
                <span className="font-mono tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
                  v{APP_PACKAGE_VERSION}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[#68737C] dark:text-[#AAB6B4]">Runtime Connection</span>
                <StatusText
                  tone={isFirebaseConnectedMode() ? 'nominal' : 'info'}
                  label={
                    session.dataSourceMode === 'firebase_connected'
                      ? 'Firebase Connected'
                      : 'Local Development Mode'
                  }
                />
              </div>
            </div>
          </Card>
        );
    }
  };

  return (
    <SettingsShell
      eyebrow={`${branding.centreName} · ${roleLabel}`}
      title="Settings"
      subtitle="Browse your account details, theme preferences, password security, notification visibility, and application details."
      rightSlot={<StatusText tone="nominal" label={`${principal.loginId} · ${roleLabel}`} />}
      categories={categories}
      activeCategoryId={activeCategory}
      onSelectCategory={setActiveCategory}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      renderCategoryContent={renderCategoryContent}
    />
  );
}

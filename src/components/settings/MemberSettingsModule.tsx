import { useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LogOut,
  Palette,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { APP_PACKAGE_VERSION } from '../../config/branding';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT_PALETTE_MAP } from '../../design/palettes';
import { academicService, isFirebaseConnectedMode, studentPortalService } from '../../services';
import type { StudentProfileSummary } from '../../services/contracts/studentPortalService';
import type { TeacherWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { StatusText } from '../ui/StatusText';
import { SettingsShell, type SettingsCategoryItem } from './SettingsShell';
import { ThemeCustomizationPanel } from './ThemeCustomizationPanel';

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
    accentPalette,
    defaultTheme,
    defaultAccentPalette,
    allowPersonalThemePreference,
    hasPersonalPreference,
  } = useTheme();

  const [activeCategory, setActiveCategory] = useState<MemberSettingsCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentProfile, setStudentProfile] = useState<StudentProfileSummary | null>(null);
  const [teacherWs, setTeacherWs] = useState<TeacherWorkspaceData | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  const activePaletteName = ACCENT_PALETTE_MAP[accentPalette].name;
  const defaultPaletteName = ACCENT_PALETTE_MAP[defaultAccentPalette].name;

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
      title: 'Appearance & Accent Colour',
      description:
        'Choose Light or Dark Mode and any of 10 curated accent colour palettes with live preview.',
      summary: allowPersonalThemePreference
        ? `${theme === 'dark' ? 'Dark Mode' : 'Light Mode'} · ${activePaletteName}${hasPersonalPreference ? ' · Personal' : ' · Default'}`
        : `Locked to ${defaultTheme === 'dark' ? 'Dark Mode' : 'Light Mode'} · ${defaultPaletteName}`,
      group: 'Preferences',
      keywords: ['theme', 'dark', 'light', 'mode', 'palette', 'colour', 'accent', 'gold'],
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
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                  <p className="text-xs text-[var(--text-muted)]">Full Name</p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">
                    {principal.fullName}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                  <p className="text-xs text-[var(--text-muted)]">Login ID</p>
                  <p className="mt-1 font-mono font-semibold text-[var(--text-primary)]">
                    {principal.loginId}
                  </p>
                </div>
              </div>

              {principal.role === 'student' && studentProfile && (
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[var(--text-muted)]">Registered Phone</p>
                      <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)]">
                        {studentProfile.phone}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--text-muted)]">Enrolment Status</p>
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
                  <div className="pt-2.5 border-t border-[var(--border)]">
                    <p className="text-[var(--text-muted)]">Class & Batch</p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                      {studentProfile.enrolmentStatus === 'active'
                        ? `${studentProfile.className ?? studentProfile.classId} · ${studentProfile.batchName ?? studentProfile.batchId}`
                        : 'No active batch assigned'}
                    </p>
                  </div>
                  <p className="text-[var(--text-muted)] leading-relaxed">
                    {studentProfile.immutableNotice}
                  </p>
                </div>
              )}

              {principal.role === 'teacher' && teacherWs && (
                <div className="rounded-xl border border-[var(--border)] p-4 space-y-1.5 text-xs">
                  <p className="text-[var(--text-muted)]">Assigned Teaching Scope</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
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
        return <ThemeCustomizationPanel centreName={branding.centreName} />;

      case 'security': {
        const meetsMinLength = newPassword.length >= 8;
        const differsFromCurrent =
          newPassword.length > 0 && (!currentPassword || newPassword !== currentPassword);
        const matchesConfirm =
          confirmNewPassword.length > 0 && newPassword === confirmNewPassword;
        const hasMixedChars =
          /[A-Za-z]/.test(newPassword) &&
          (/[0-9]/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword));
        const strengthLevel: 0 | 1 | 2 | 3 = !newPassword
          ? 0
          : !meetsMinLength
            ? 1
            : newPassword.length >= 10 && hasMixedChars
              ? 3
              : 2;
        const strengthLabel =
          strengthLevel === 3
            ? 'Strong'
            : strengthLevel === 2
              ? 'Good'
              : strengthLevel === 1
                ? 'Too short'
                : 'Not entered';

        return (
          <div className="space-y-5">
            <Card
              title="Change Password"
              subtitle="Verify your current password and choose a strong new password (at least 8 characters)."
              action={
                <StatusText
                  tone={strengthLevel === 3 ? 'nominal' : strengthLevel === 2 ? 'info' : 'neutral'}
                  label={strengthLevel > 0 ? `Strength: ${strengthLabel}` : 'Password Policy'}
                />
              }
            >
              <form onSubmit={handlePasswordChange} className="space-y-5 max-w-2xl" noValidate>
                {pwError && <Alert tone="error">{pwError}</Alert>}
                {pwSuccess && <Alert tone="success">{pwSuccess}</Alert>}

                <Input
                  label="Current Password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (pwError) setPwError(null);
                  }}
                  placeholder="Enter your current password"
                  rightElement={
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      icon={
                        showCurrentPassword ? (
                          <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                        ) : (
                          <Eye className="w-4 h-4" strokeWidth={1.75} />
                        )
                      }
                    />
                  }
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="New Password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (pwError) setPwError(null);
                    }}
                    placeholder="Minimum 8 characters"
                    successMessage={
                      meetsMinLength && differsFromCurrent
                        ? 'Meets minimum length requirement'
                        : undefined
                    }
                    rightElement={
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={showNewPassword ? 'Hide new password' : 'Show new password'}
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        icon={
                          showNewPassword ? (
                            <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                          ) : (
                            <Eye className="w-4 h-4" strokeWidth={1.75} />
                          )
                        }
                      />
                    }
                  />
                  <Input
                    label="Confirm New Password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => {
                      setConfirmNewPassword(e.target.value);
                      if (pwError) setPwError(null);
                    }}
                    placeholder="Re-enter new password"
                    error={
                      confirmNewPassword.length > 0 && !matchesConfirm
                        ? 'Passwords do not match'
                        : undefined
                    }
                    successMessage={
                      matchesConfirm && meetsMinLength ? 'Passwords match' : undefined
                    }
                    rightElement={
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={
                          showConfirmPassword
                            ? 'Hide confirmation password'
                            : 'Show confirmation password'
                        }
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        icon={
                          showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                          ) : (
                            <Eye className="w-4 h-4" strokeWidth={1.75} />
                          )
                        }
                      />
                    }
                  />
                </div>

                {/* Password Strength & Requirement Checklist */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">
                      Password readiness
                    </span>
                    <span className="font-mono text-[var(--text-muted)]">
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                    {[1, 2, 3].map((step) => (
                      <span
                        key={step}
                        className={cn(
                          'h-1.5 rounded-full transition-colors duration-150',
                          strengthLevel >= step
                            ? strengthLevel === 3
                              ? 'bg-[var(--success)]'
                              : strengthLevel === 2
                                ? 'bg-[var(--accent)]'
                                : 'bg-[var(--warning)]'
                            : 'bg-[var(--border)]'
                        )}
                      />
                    ))}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-3 text-xs pt-0.5">
                    <StatusText
                      tone={meetsMinLength ? 'nominal' : 'neutral'}
                      label="8+ characters"
                    />
                    <StatusText
                      tone={differsFromCurrent ? 'nominal' : 'neutral'}
                      label="Differs from current"
                    />
                    <StatusText
                      tone={matchesConfirm ? 'nominal' : 'neutral'}
                      label="Confirmation matches"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-[var(--text-muted)]">
                    Changes apply immediately on your next sign-in.
                  </p>
                  <Button
                    type="submit"
                    size="md"
                    loading={pwSaving}
                    iconLeft={<KeyRound className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
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
                  <p className="text-xs text-[var(--text-muted)]">
                    Sign out cleanly before leaving a shared classroom or family device.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmSignOutOpen(true)}
                    iconLeft={<LogOut className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                  >
                    Sign Out
                  </Button>
                </div>
              </Card>
            )}
          </div>
        );
      }

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
              <div className="divide-y divide-[var(--border)] text-sm">
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
                      <p className="font-medium text-[var(--text-primary)]">
                        {item.label}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{item.desc}</p>
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
            <div className="divide-y divide-[var(--border)] text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[var(--text-muted)]">Centre Name</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {branding.centreName}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[var(--text-muted)]">Academic Session</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {branding.academicYearLabel}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[var(--text-muted)]">Application Version</span>
                <span className="font-mono tabular-nums text-[var(--text-primary)]">
                  v{APP_PACKAGE_VERSION}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-[var(--text-muted)]">Runtime Connection</span>
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
    <>
      <SettingsShell
        eyebrow={`${branding.centreName} · ${roleLabel}`}
        title="Settings"
        subtitle="Browse your account details, theme & accent palette, password security, notification visibility, and application details."
        rightSlot={<StatusText tone="nominal" label={`${principal.loginId} · ${roleLabel}`} />}
        categories={categories}
        activeCategoryId={activeCategory}
        onSelectCategory={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        renderCategoryContent={renderCategoryContent}
      />
      {onSignOut && (
        <ConfirmDialog
          open={confirmSignOutOpen}
          onClose={() => {
            if (!signingOut) setConfirmSignOutOpen(false);
          }}
          onConfirm={async () => {
            setSigningOut(true);
            try {
              await Promise.resolve(onSignOut());
            } finally {
              setSigningOut(false);
              setConfirmSignOutOpen(false);
            }
          }}
          title="Sign Out of Your Account?"
          description={`You will be signed out of ${branding.centreName} on this device and redirected to the sign-in screen.`}
          cancelLabel="Cancel"
          confirmLabel="Sign Out"
          confirmVariant="danger"
          tone="danger"
          loading={signingOut}
        />
      )}
    </>
  );
}

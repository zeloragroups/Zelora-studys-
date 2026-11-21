import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarCheck2,
  Database,
  Eye,
  GraduationCap,
  History,
  ImagePlus,
  IndianRupee,
  Info,
  LogOut,
  Moon,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react';
import { APP_PACKAGE_VERSION } from '../../config/branding';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { useTheme } from '../../context/ThemeContext';
import { ACCENT_PALETTE_MAP, ACCENT_PALETTES, DEFAULT_ACCENT_PALETTE } from '../../design/palettes';
import {
  isFirebaseConnectedMode,
  LOCAL_LOGO_NOTICE,
  settingsService,
  SettingsServiceError,
} from '../../services';
import type {
  AcademicDefaults,
  AdminSystemStatusOverview,
  AppearanceDefaults,
  ApplicationBranding,
  ApplicationIntegrationStatusItem,
  ApplicationSettings,
  CentreProfile,
  NotificationPreferences,
  SettingsAuditEntry,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { StatTile } from '../ui/StatTile';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Switch } from '../ui/Switch';
import { Table, type TableColumn } from '../ui/Table';
import { Textarea } from '../ui/Textarea';
import { AdminMigrationSection } from './AdminMigrationSection';
import { SettingsShell, type SettingsCategoryItem } from './SettingsShell';
import { ThemeCustomizationPanel } from './ThemeCustomizationPanel';

type AdminSettingsCategory =
  | 'account_security'
  | 'centre_profile'
  | 'branding'
  | 'appearance'
  | 'academic'
  | 'fees_payments'
  | 'attendance'
  | 'notifications'
  | 'system_info'
  | 'data_privacy';

const MAX_LOGO_SIZE_BYTES = 250 * 1024;

interface AdminSettingsModuleProps {
  onNavigateShortcut: (navId: string, subTab?: string) => void;
  onSignOut?: () => void;
}

export function AdminSettingsModule({
  onNavigateShortcut,
  onSignOut,
}: AdminSettingsModuleProps) {
  const { principal, session } = useAuth();
  const { resetToDefaultTheme } = useTheme();
  const {
    isPreviewActive,
    setBrandingDraftPreview,
    refreshAppSettings,
  } = useInterface();

  const [activeCategory, setActiveCategory] = useState<AdminSettingsCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [settings, setSettings] = useState<ApplicationSettings | null>(null);
  const [auditEntries, setAuditEntries] = useState<SettingsAuditEntry[]>([]);
  const [integrations, setIntegrations] = useState<ApplicationIntegrationStatusItem[]>([]);
  const [systemOverview, setSystemOverview] = useState<AdminSystemStatusOverview | null>(null);

  const [centreDraft, setCentreDraft] = useState<CentreProfile | null>(null);
  const [brandingDraft, setBrandingDraft] = useState<ApplicationBranding | null>(null);
  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceDefaults | null>(null);
  const [academicDraft, setAcademicDraft] = useState<AcademicDefaults | null>(null);
  const [notifDraft, setNotifDraft] = useState<NotificationPreferences | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [confirmResetBrandingOpen, setConfirmResetBrandingOpen] = useState(false);
  const [confirmNotifDisableOpen, setConfirmNotifDisableOpen] = useState(false);
  const [confirmClearPrefsOpen, setConfirmClearPrefsOpen] = useState(false);
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    return () => {
      setBrandingDraftPreview(null);
    };
  }, [setBrandingDraftPreview]);

  const hydrateDrafts = (loaded: ApplicationSettings) => {
    setCentreDraft({ ...loaded.centreProfile });
    setBrandingDraft({
      ...loaded.applicationBranding,
      logoConfiguration: { ...loaded.applicationBranding.logoConfiguration },
    });
    setAppearanceDraft({ ...loaded.appearanceDefaults });
    setAcademicDraft({ ...loaded.academicDefaults });
    setNotifDraft({
      ...loaded.notificationPreferences,
      enabledCategories: { ...loaded.notificationPreferences.enabledCategories },
    });
  };

  const loadSettingsData = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Access denied. Only active Administrators can access Application Settings.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [loadedSettings, loadedAudit, loadedIntegrations, loadedOverview] =
        await Promise.all([
          settingsService.getApplicationSettings(principal),
          settingsService.listSettingsAuditHistory(principal),
          settingsService.getApplicationIntegrationStatus(principal),
          settingsService.getSystemStatusOverview(principal),
        ]);
      setSettings(loadedSettings);
      hydrateDrafts(loadedSettings);
      setAuditEntries(loadedAudit);
      setIntegrations(loadedIntegrations);
      setSystemOverview(loadedOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadSettingsData();
  }, [loadSettingsData]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Alert tone="error" title="Access Restricted">
        Only authorized Administrators can view or modify tuition centre settings and branding.
      </Alert>
    );
  }

  const handleSaveCentreProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!centreDraft) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const updated = await settingsService.updateCentreProfile(principal, centreDraft);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      showToast('Tuition centre profile saved and updated across headers and receipts.');
    } catch (err) {
      if (err instanceof SettingsServiceError) {
        setFieldError(err.field ?? null);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to save centre profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !brandingDraft) return;

    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) {
      setError('Invalid logo format. Please select a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError('Logo image must be 250 KB or smaller for device-local demo storage.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setError('Unable to read the selected logo image.');
        return;
      }
      const nextBranding: ApplicationBranding = {
        ...brandingDraft,
        logoConfiguration: {
          mode: 'custom_local_image',
          dataUrl: result,
          fileName: file.name,
          mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
          sizeBytes: file.size,
          updatedAt: new Date().toISOString(),
          storageNotice: LOCAL_LOGO_NOTICE,
        },
      };
      setBrandingDraft(nextBranding);
      if (isPreviewActive) {
        setBrandingDraftPreview({ applicationBranding: nextBranding });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    if (!brandingDraft) return;
    const nextBranding: ApplicationBranding = {
      ...brandingDraft,
      logoConfiguration: {
        mode: 'default_icon',
        storageNotice: LOCAL_LOGO_NOTICE,
      },
    };
    setBrandingDraft(nextBranding);
    if (isPreviewActive) {
      setBrandingDraftPreview({ applicationBranding: nextBranding });
    }
  };

  const handleToggleLivePreview = () => {
    if (!brandingDraft) return;
    if (isPreviewActive) {
      setBrandingDraftPreview(null);
      showToast('Live preview turned off. Showing currently saved branding.');
    } else {
      setBrandingDraftPreview({ applicationBranding: brandingDraft });
      showToast('Live preview active across sidebar and top bar. Click Apply Branding to save.');
    }
  };

  const handleCancelBrandingDraft = () => {
    if (!settings) return;
    setBrandingDraft({
      ...settings.applicationBranding,
      logoConfiguration: { ...settings.applicationBranding.logoConfiguration },
    });
    setBrandingDraftPreview(null);
    setError(null);
    setFieldError(null);
    showToast('Unsaved branding changes discarded.');
  };

  const handleApplyBranding = async (e: FormEvent) => {
    e.preventDefault();
    if (!brandingDraft) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const updated = await settingsService.updateApplicationBranding(principal, brandingDraft);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      showToast('Application branding applied across portals, login pages, and receipts.');
    } catch (err) {
      if (err instanceof SettingsServiceError) {
        setFieldError(err.field ?? null);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to apply branding.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmResetBranding = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsService.resetBrandingToDefaults(principal);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      setConfirmResetBrandingOpen(false);
      showToast('Default application branding and icon restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore defaults.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAppearance = async (e: FormEvent) => {
    e.preventDefault();
    if (!appearanceDraft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsService.updateAppearanceDefaults(principal, appearanceDraft);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      showToast('Appearance defaults updated. Existing personal overrides remain respected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save appearance defaults.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAcademicDefaults = async (e: FormEvent) => {
    e.preventDefault();
    if (!academicDraft) return;
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const updated = await settingsService.updateAcademicDefaults(principal, academicDraft);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      showToast('Academic session & default timetable view updated.');
    } catch (err) {
      if (err instanceof SettingsServiceError) {
        setFieldError(err.field ?? null);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to save academic defaults.');
      }
    } finally {
      setSaving(false);
    }
  };

  const persistNotificationPrefs = async () => {
    if (!notifDraft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsService.updateNotificationPreferences(principal, notifDraft);
      setSettings(updated);
      hydrateDrafts(updated);
      await refreshAppSettings();
      const updatedAudit = await settingsService.listSettingsAuditHistory(principal);
      setAuditEntries(updatedAudit);
      setConfirmNotifDisableOpen(false);
      showToast('In-app notification visibility preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!notifDraft) return;
    const anyDisabled =
      !notifDraft.enabledCategories.attendance ||
      !notifDraft.enabledCategories.homeworkTests ||
      !notifDraft.enabledCategories.examsResults ||
      !notifDraft.enabledCategories.feesReceipts;
    if (anyDisabled) {
      setConfirmNotifDisableOpen(true);
    } else {
      void persistNotificationPrefs();
    }
  };

  const handleClearDeviceThemeOverride = () => {
    resetToDefaultTheme();
    setConfirmClearPrefsOpen(false);
    showToast('Local device theme override cleared. Device now follows centre default.');
  };

  const isCentreDirty =
    Boolean(settings && centreDraft) &&
    JSON.stringify(settings?.centreProfile) !== JSON.stringify(centreDraft);

  const isBrandingDirty =
    Boolean(settings && brandingDraft) &&
    JSON.stringify(settings?.applicationBranding) !== JSON.stringify(brandingDraft);

  const auditColumns: TableColumn<SettingsAuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp & Admin',
      render: (r) => (
        <div className="text-xs">
          <p className="font-mono tabular-nums text-[var(--text-primary)]">
            {formatDateTime(r.timestamp)}
          </p>
          <p className="font-mono text-[var(--text-muted)]">
            {r.actorId} · {r.id}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Change',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[var(--text-primary)]">{r.summary}</p>
          <p className="font-mono text-[var(--text-muted)]">
            {r.category.replace(/_/g, ' ')}
          </p>
        </div>
      ),
    },
    {
      key: 'values',
      header: 'Previous → New',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          <p className="text-[var(--text-muted)]">From: {r.previousValues}</p>
          <p className="text-[var(--text-primary)]">To: {r.newValues}</p>
        </div>
      ),
    },
  ];

  const getIntegrationTone = (status: ApplicationIntegrationStatusItem['status']): {
    tone: SemanticTone;
    label: string;
  } => {
    switch (status) {
      case 'existing':
        return { tone: 'nominal', label: 'Active' };
      case 'local_only':
        return { tone: 'warning', label: 'Local Demo Only' };
      case 'not_connected':
        return { tone: 'danger', label: 'Not Connected' };
      case 'not_used':
        return { tone: 'neutral', label: 'Not Used' };
    }
  };

  const categories: SettingsCategoryItem<AdminSettingsCategory>[] = [
    {
      id: 'account_security',
      title: 'Account & Security',
      description: 'Administrator Google identity, session controls, and full settings audit history.',
      summary: `${principal.loginId} · ${auditEntries.length} audit record(s)`,
      group: 'Identity & Governance',
      keywords: ['google', 'sign out', 'audit', 'log', 'security'],
      icon: ShieldCheck,
    },
    {
      id: 'centre_profile',
      title: 'Centre Profile',
      description: 'Official centre name, short label, tagline, and optional contact or receipt details.',
      summary: settings?.centreProfile.centreName ?? 'Tuition Centre',
      group: 'Centre & Brand',
      keywords: ['address', 'phone', 'email', 'website', 'receipt header'],
      icon: Building2,
    },
    {
      id: 'branding',
      title: 'Application Branding',
      description: 'Application display name, portal welcome copy, custom logo upload, and live preview.',
      summary: isPreviewActive
        ? 'Live preview active'
        : settings?.applicationBranding.displayName ?? 'ZELORA STUDYS',
      group: 'Centre & Brand',
      keywords: ['logo', 'preview', 'welcome', 'display name'],
      icon: ImagePlus,
    },
    {
      id: 'appearance',
      title: 'Appearance & Personalisation',
      description: 'Light or Dark Mode, 10 curated accent colour palettes, live theme preview, and override policy.',
      summary: `${settings?.appearanceDefaults.defaultTheme === 'dark' ? 'Dark Mode' : 'Light Mode'} · ${ACCENT_PALETTE_MAP[settings?.appearanceDefaults.defaultAccentPalette ?? DEFAULT_ACCENT_PALETTE].name} · ${settings?.appearanceDefaults.allowPersonalThemePreference ? 'Personal override allowed' : 'Locked to centre default'}`,
      group: 'Centre & Brand',
      keywords: ['theme', 'dark', 'light', 'palette', 'accent', 'gold', 'colour', 'override'],
      icon: Palette,
    },
    {
      id: 'academic',
      title: 'Academic Configuration',
      description: 'Academic year display label, active term label, and default student timetable view.',
      summary: `${settings?.academicDefaults.academicYearDisplay ?? '2026–2027'} · ${settings?.academicDefaults.defaultTimetableView === 'today' ? 'Today focus' : 'Weekly grid'}`,
      group: 'Operations',
      keywords: ['session', 'term', 'timetable', 'year'],
      icon: GraduationCap,
    },
    {
      id: 'fees_payments',
      title: 'Fees & Payments',
      description: 'Inspect Fee Structure and Centre UPI status with direct shortcuts to Finance configuration.',
      summary: systemOverview
        ? `Fee: ${systemOverview.feeConfigStatusLabel} · UPI: ${systemOverview.upiConfigStatusLabel}`
        : 'Managed under Finance',
      group: 'Operations',
      keywords: ['upi', 'fee', 'receipt', 'verification', 'finance'],
      icon: IndianRupee,
    },
    {
      id: 'attendance',
      title: 'Attendance Configuration',
      description: 'Attendance session rules, audited correction logging, and direct link to Attendance.',
      summary: 'Daily & Exam sessions · Mandatory edit reason',
      group: 'Operations',
      keywords: ['absent', 'late', 'corrections', 'alerts'],
      icon: CalendarCheck2,
    },
    {
      id: 'notifications',
      title: 'Notifications & Communication',
      description: 'In-app category visibility switches, unread badges, and external channel disclosure.',
      summary: `Default filter: ${settings?.notificationPreferences.defaultFilterView === 'unread_only' ? 'Unread only' : 'All alerts'}`,
      group: 'Operations',
      keywords: ['alerts', 'sms', 'whatsapp', 'email', 'unread'],
      icon: Bell,
    },
    {
      id: 'system_info',
      title: 'System Information',
      description: 'Package version, Firebase Spark connection state, and service integration inventory.',
      summary: `v${APP_PACKAGE_VERSION} · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}`,
      group: 'System & Data',
      keywords: ['version', 'integrations', 'firebase', 'spark', 'runtime'],
      icon: Info,
    },
    {
      id: 'data_privacy',
      title: 'Data & Privacy',
      description: 'Firebase production sync checks, controlled local migration, and browser cache reset.',
      summary: isFirebaseConnectedMode() ? 'Cloud Firestore active' : 'Local browser storage',
      group: 'System & Data',
      keywords: ['migration', 'firebase', 'cache', 'export', 'clear'],
      icon: Database,
    },
  ];

  const renderCategoryContent = (categoryId: AdminSettingsCategory) => {
    if (!settings || !centreDraft || !brandingDraft || !appearanceDraft || !academicDraft || !notifDraft) {
      return null;
    }

    switch (categoryId) {
      case 'account_security':
        return (
          <div className="space-y-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Administrator Account & Session"
                subtitle="Active Admin identity and authorization boundary (no secrets exposed)."
              >
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Admin ID</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">{principal.loginId}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Display Name</span>
                    <span className="font-semibold text-[var(--text-primary)]">{principal.fullName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Account Status</span>
                    <StatusText tone="nominal" label="Active Administrator" />
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Session Adapter</span>
                    <span className="font-mono text-xs text-[var(--text-primary)]">{session.dataSourceMode}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed pt-1">
                    Admin signs in exclusively via Google Sign-In (07alphabro@gmail.com). Teacher and Student password resets are logged by Admin inside the Accounts module.
                  </p>
                  {onSignOut && (
                    <div className="pt-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmSignOutOpen(true)}
                        iconLeft={<LogOut className="w-4 h-4" aria-hidden="true" />}
                      >
                        Sign Out Admin Session
                      </Button>
                    </div>
                  )}
                </div>
              </Card>

              <Card
                title="Latest Configuration Metadata"
                subtitle="Last persisted Admin change recorded in application settings."
              >
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Updated By</span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">{settings.updatedBy}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Last Updated</span>
                    <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">
                      {formatDateTime(settings.updatedAt)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Schema Version</span>
                    <span className="font-mono text-[var(--text-primary)]">v{settings.schemaVersion}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-[var(--text-muted)]">Audit Entries</span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {auditEntries.length}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title={`Settings Audit History (${auditEntries.length})`}
              subtitle="Append-only log of centre profile, branding, appearance, academic, and notification changes."
              action={<History className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />}
            >
              <Table
                columns={auditColumns}
                rows={auditEntries}
                rowKey={(r) => r.id}
                emptyTitle="No settings changes logged yet"
                emptyDescription="Any updates to centre profile, branding, theme policy, or notification settings appear here."
                mobileCardRender={(r) => (
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {r.summary}
                    </p>
                    <p className="font-mono text-[var(--text-muted)]">
                      {r.actorId} · {formatDateTime(r.timestamp)}
                    </p>
                    <p className="text-[var(--text-muted)]">From: {r.previousValues}</p>
                    <p className="text-[var(--text-primary)]">To: {r.newValues}</p>
                  </div>
                )}
              />
            </Card>
          </div>
        );

      case 'centre_profile':
        return (
          <Card
            title="Tuition Centre Profile"
            subtitle="Official centre name, short label, tagline, and optional contact details printed on new receipts and report headers."
            action={
              isCentreDirty ? (
                <StatusText tone="warning" label="Unsaved changes" />
              ) : (
                <StatusText tone="nominal" label="Saved" />
              )
            }
          >
            <form onSubmit={handleSaveCentreProfile} className="space-y-5" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tuition Centre Name"
                  required
                  value={centreDraft.centreName}
                  onChange={(e) =>
                    setCentreDraft({ ...centreDraft, centreName: e.target.value })
                  }
                  placeholder="e.g., ZELORA STUDYS"
                  error={fieldError === 'centreName' ? error ?? undefined : undefined}
                />
                <Input
                  label="Short Name"
                  required
                  value={centreDraft.shortName}
                  onChange={(e) =>
                    setCentreDraft({ ...centreDraft, shortName: e.target.value })
                  }
                  placeholder="e.g., ZELORA"
                  error={fieldError === 'shortName' ? error ?? undefined : undefined}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Centre Tagline / Slogan"
                    value={centreDraft.tagline}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, tagline: e.target.value })
                    }
                    placeholder="Structured Academic & Centre Operations"
                    error={fieldError === 'tagline' ? error ?? undefined : undefined}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border)] space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Optional Contact & Address Details
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Leave blank if not published yet — blank fields never show fabricated placeholder data on receipts or portals.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Primary Contact Number"
                    value={centreDraft.contactNumber}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, contactNumber: e.target.value })
                    }
                    placeholder="Optional (e.g., +91 98XXXXXXXX)"
                    error={fieldError === 'contactNumber' ? error ?? undefined : undefined}
                  />
                  <Input
                    label="Secondary Contact Number"
                    value={centreDraft.secondaryContactNumber}
                    onChange={(e) =>
                      setCentreDraft({
                        ...centreDraft,
                        secondaryContactNumber: e.target.value,
                      })
                    }
                    placeholder="Optional"
                    error={
                      fieldError === 'secondaryContactNumber'
                        ? error ?? undefined
                        : undefined
                    }
                  />
                  <Input
                    label="Public Contact Email"
                    type="email"
                    value={centreDraft.publicEmail}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, publicEmail: e.target.value })
                    }
                    placeholder="Optional (e.g., office@example.com)"
                    error={fieldError === 'publicEmail' ? error ?? undefined : undefined}
                  />
                  <Input
                    label="Website URL"
                    type="url"
                    value={centreDraft.websiteUrl}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, websiteUrl: e.target.value })
                    }
                    placeholder="Optional (https://...)"
                    error={fieldError === 'websiteUrl' ? error ?? undefined : undefined}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="Street / Building Address"
                      value={centreDraft.address}
                      onChange={(e) =>
                        setCentreDraft({ ...centreDraft, address: e.target.value })
                      }
                      placeholder="Optional street or campus address"
                    />
                  </div>
                  <Input
                    label="City"
                    value={centreDraft.city}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, city: e.target.value })
                    }
                    placeholder="Optional"
                  />
                  <Input
                    label="State / Region"
                    value={centreDraft.state}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, state: e.target.value })
                    }
                    placeholder="Optional"
                  />
                  <Input
                    label="PIN / Postal Code"
                    value={centreDraft.pinCode}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, pinCode: e.target.value })
                    }
                    placeholder="Optional (4–10 characters)"
                    error={fieldError === 'pinCode' ? error ?? undefined : undefined}
                  />
                  <Input
                    label="Country"
                    value={centreDraft.country}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, country: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!isCentreDirty || saving}
                  onClick={() => setCentreDraft({ ...settings.centreProfile })}
                >
                  Discard Edits
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  iconLeft={<Save className="w-4 h-4" aria-hidden="true" />}
                >
                  Save Centre Profile
                </Button>
              </div>
            </form>
          </Card>
        );

      case 'branding':
        return (
          <div className="grid gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <Card
                title="Dynamic Application Branding"
                subtitle="Customize app display name, login portal copy, and local logo mark with live preview before applying."
                action={
                  isBrandingDirty ? (
                    <StatusText tone="warning" label="Draft modified" />
                  ) : (
                    <StatusText tone="nominal" label="Applied" />
                  )
                }
              >
                <form onSubmit={handleApplyBranding} className="space-y-4" noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Application Display Name"
                      required
                      value={brandingDraft.displayName}
                      onChange={(e) => {
                        const next = { ...brandingDraft, displayName: e.target.value };
                        setBrandingDraft(next);
                        if (isPreviewActive) {
                          setBrandingDraftPreview({ applicationBranding: next });
                        }
                      }}
                      error={fieldError === 'displayName' ? error ?? undefined : undefined}
                    />
                    <Input
                      label="Short Application Name"
                      required
                      value={brandingDraft.shortName}
                      onChange={(e) => {
                        const next = { ...brandingDraft, shortName: e.target.value };
                        setBrandingDraft(next);
                        if (isPreviewActive) {
                          setBrandingDraftPreview({ applicationBranding: next });
                        }
                      }}
                      error={fieldError === 'shortName' ? error ?? undefined : undefined}
                    />
                  </div>

                  <Input
                    label="Application Tagline / Subtitle"
                    value={brandingDraft.tagline}
                    onChange={(e) => {
                      const next = { ...brandingDraft, tagline: e.target.value };
                      setBrandingDraft(next);
                      if (isPreviewActive) {
                        setBrandingDraftPreview({ applicationBranding: next });
                      }
                    }}
                    error={fieldError === 'tagline' ? error ?? undefined : undefined}
                  />

                  <Input
                    label="Teacher & Student Portal Welcome Heading"
                    required
                    value={brandingDraft.loginWelcomeHeading}
                    onChange={(e) => {
                      const next = {
                        ...brandingDraft,
                        loginWelcomeHeading: e.target.value,
                      };
                      setBrandingDraft(next);
                      if (isPreviewActive) {
                        setBrandingDraftPreview({ applicationBranding: next });
                      }
                    }}
                    error={
                      fieldError === 'loginWelcomeHeading' ? error ?? undefined : undefined
                    }
                  />

                  <Textarea
                    label="Teacher & Student Portal Supporting Description"
                    required
                    rows={3}
                    value={brandingDraft.loginDescription}
                    onChange={(e) => {
                      const next = {
                        ...brandingDraft,
                        loginDescription: e.target.value,
                      };
                      setBrandingDraft(next);
                      if (isPreviewActive) {
                        setBrandingDraftPreview({ applicationBranding: next });
                      }
                    }}
                    error={
                      fieldError === 'loginDescription' ? error ?? undefined : undefined
                    }
                  />

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <BrandLogoMark
                          logoConfiguration={brandingDraft.logoConfiguration}
                          alt={brandingDraft.displayName}
                          size="lg"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            Application Logo Mark
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {brandingDraft.logoConfiguration.mode === 'custom_local_image' ||
                            brandingDraft.logoConfiguration.mode === 'firebase_storage_image'
                              ? `${brandingDraft.logoConfiguration.fileName ?? 'Custom image'} (${Math.round(
                                  (brandingDraft.logoConfiguration.sizeBytes ?? 0) / 1024
                                )} KB)`
                              : 'Default crisp vector emblem'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="min-h-[40px] px-3 py-2 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] cursor-pointer transition-colors">
                          <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Upload PNG / JPG / WebP</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleLogoFileChange}
                            className="sr-only"
                          />
                        </label>
                        {(brandingDraft.logoConfiguration.mode === 'custom_local_image' ||
                          brandingDraft.logoConfiguration.mode === 'firebase_storage_image') && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveLogo}
                            iconLeft={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {brandingDraft.logoConfiguration.storageNotice || LOCAL_LOGO_NOTICE} Maximum size: 250 KB (local preview) / 2 MB (Firebase Storage).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmResetBrandingOpen(true)}
                      iconLeft={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Restore Defaults
                    </Button>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleToggleLivePreview}
                        iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        {isPreviewActive ? 'Stop App Preview' : 'Preview Across App'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!isBrandingDirty && !isPreviewActive}
                        onClick={handleCancelBrandingDraft}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        loading={saving}
                        iconLeft={<Save className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        Apply Branding
                      </Button>
                    </div>
                  </div>
                </form>
              </Card>
            </div>

            <div className="xl:col-span-5 space-y-4">
              <Card
                title="Live Branding Surface Preview"
                subtitle="Verify header, login screen, sidebar, and receipt presentation before applying."
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      1. Portal Header & Sidebar Badge
                    </p>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogoMark
                          logoConfiguration={brandingDraft.logoConfiguration}
                          alt={brandingDraft.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold font-display text-[var(--text-primary)] truncate">
                            {brandingDraft.displayName || 'Application Name'}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {brandingDraft.shortName} · {academicDraft.academicYearDisplay}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      2. Teacher & Student Login Welcome
                    </p>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1.5">
                      <p className="text-[11px] font-medium text-[var(--accent-text)]">
                        Teacher & Student Portal · {academicDraft.academicYearDisplay}
                      </p>
                      <p className="text-base font-bold text-[var(--text-primary)]">
                        {brandingDraft.loginWelcomeHeading || 'Welcome Back'}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {brandingDraft.loginDescription}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[var(--text-muted)]">
                      3. Receipt & Printable Report Masthead
                    </p>
                    <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3.5 flex items-start gap-3">
                      <BrandLogoMark
                        logoConfiguration={brandingDraft.logoConfiguration}
                        alt={centreDraft.centreName}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[var(--accent-text)]">
                          Official Verified Payment Receipt
                        </p>
                        <p className="text-sm font-bold font-display text-[var(--text-primary)] truncate">
                          {centreDraft.centreName}
                        </p>
                        {brandingDraft.tagline && (
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {brandingDraft.tagline}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <ThemeCustomizationPanel centreName={centreDraft.centreName} />

            <Card
              title="Centre Default Appearance Policy"
              subtitle="Set the institution-wide default Dark or Light Mode and accent colour palette for new sign-ins without overriding personal preferences."
            >
              <form onSubmit={handleSaveAppearance} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAppearanceDraft({ ...appearanceDraft, defaultTheme: 'dark' })
                    }
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors cursor-pointer space-y-3',
                      appearanceDraft.defaultTheme === 'dark'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Moon className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
                        <span>Default: Dark Mode</span>
                      </span>
                      {appearanceDraft.defaultTheme === 'dark' && (
                        <StatusText tone="nominal" label="Selected" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#17191D] border border-[#393D43]" />
                      <span className="w-6 h-6 rounded-lg bg-[#202329] border border-[#393D43]" />
                      <span className="w-6 h-6 rounded-lg bg-[#C5A46D]" />
                      <span className="text-xs text-[var(--text-secondary)]">
                        Deep Graphite & Gold
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAppearanceDraft({ ...appearanceDraft, defaultTheme: 'light' })
                    }
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors cursor-pointer space-y-3',
                      appearanceDraft.defaultTheme === 'light'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Sun className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
                        <span>Default: Light Mode</span>
                      </span>
                      {appearanceDraft.defaultTheme === 'light' && (
                        <StatusText tone="nominal" label="Selected" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#F8F5EF] border border-[#E6E0D5]" />
                      <span className="w-6 h-6 rounded-lg bg-[#FFFFFF] border border-[#E6E0D5]" />
                      <span className="w-6 h-6 rounded-lg bg-[#9C7329]" />
                      <span className="text-xs text-[var(--text-secondary)]">
                        Warm Ivory & Crisp White
                      </span>
                    </div>
                  </button>
                </div>

                <Select
                  label="Centre Default Accent Colour Palette"
                  value={appearanceDraft.defaultAccentPalette ?? DEFAULT_ACCENT_PALETTE}
                  onChange={(e) =>
                    setAppearanceDraft({
                      ...appearanceDraft,
                      defaultAccentPalette: e.target
                        .value as AppearanceDefaults['defaultAccentPalette'],
                    })
                  }
                >
                  {ACCENT_PALETTES.map((palette) => (
                    <option key={palette.id} value={palette.id}>
                      {palette.name} — {palette.description}
                    </option>
                  ))}
                </Select>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
                  <Switch
                    checked={appearanceDraft.allowPersonalThemePreference}
                    onChange={(checked) =>
                      setAppearanceDraft({
                        ...appearanceDraft,
                        allowPersonalThemePreference: checked,
                      })
                    }
                    label="Allow users to choose a personal theme and accent palette"
                    description="When enabled, updating the centre default only applies to users who have not saved a personal preference. Disable to enforce the centre default everywhere."
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    loading={saving}
                    iconLeft={<Save className="w-4 h-4" aria-hidden="true" />}
                  >
                    Save Appearance Policy
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        );

      case 'academic':
        return (
          <Card
            title="Academic Display Configuration"
            subtitle="Configure academic year label, term label, and default student timetable view without altering existing schedules."
          >
            <form onSubmit={handleSaveAcademicDefaults} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Academic Year / Session Display Label"
                  required
                  value={academicDraft.academicYearDisplay}
                  onChange={(e) =>
                    setAcademicDraft({
                      ...academicDraft,
                      academicYearDisplay: e.target.value,
                    })
                  }
                  placeholder="2026–2027 Academic Session"
                  error={
                    fieldError === 'academicYearDisplay' ? error ?? undefined : undefined
                  }
                />
                <Input
                  label="Academic Term / Quarter Label"
                  value={academicDraft.academicTermLabel}
                  onChange={(e) =>
                    setAcademicDraft({
                      ...academicDraft,
                      academicTermLabel: e.target.value,
                    })
                  }
                  placeholder="Annual Academic Session"
                  error={
                    fieldError === 'academicTermLabel' ? error ?? undefined : undefined
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Default Student Timetable View
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setAcademicDraft({ ...academicDraft, defaultTimetableView: 'weekly' })
                    }
                    className={cn(
                      'min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors',
                      academicDraft.defaultTimetableView === 'weekly'
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                    )}
                  >
                    Full Weekly Grid
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAcademicDraft({ ...academicDraft, defaultTimetableView: 'today' })
                    }
                    className={cn(
                      'min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors',
                      academicDraft.defaultTimetableView === 'today'
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                    )}
                  >
                    Today Focus View
                  </button>
                </div>
              </div>

              <Alert tone="info">
                Display defaults never modify saved timetables, attendance percentage formulas, or teacher result-release locks.
              </Alert>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateShortcut('academics', 'classes')}
                  iconRight={<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  Open Academics Module
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  iconLeft={<Save className="w-4 h-4" aria-hidden="true" />}
                >
                  Save Academic Defaults
                </Button>
              </div>
            </form>
          </Card>
        );

      case 'fees_payments':
        return (
          <div className="space-y-5">
            {systemOverview && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatTile
                  label="Active Fee Rule Status"
                  value={systemOverview.feeConfigStatusLabel}
                  caption="Managed inside Finance → Fee Rules"
                />
                <StatTile
                  label="Centre UPI Pay Now"
                  value={systemOverview.upiConfigStatusLabel}
                  caption="Managed inside Finance → UPI Settings"
                />
                <StatTile
                  label="Pending Claim Queue"
                  value={systemOverview.pendingClaimsCount}
                  caption="Awaiting Admin verification"
                  accent={systemOverview.pendingClaimsCount > 0}
                />
              </div>
            )}

            <Card
              title="Fees, UPI & Verification Configuration"
              subtitle="Direct shortcuts into Finance configuration without duplicating fee rules or UPI controls."
            >
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onNavigateShortcut('finance', 'fee_config')}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)] p-4 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Fee Structure Rules
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Configure class/batch fixed INR fee amounts and due dates.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateShortcut('finance', 'upi_config')}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--accent-border)] p-4 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        UPI Pay Now Settings
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Set verified Merchant UPI VPA and payee display name.
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                  </button>
                </div>

                <Alert tone="info">
                  Student payments use direct UPI Pay Now links (`upi://pay?...`) followed by manual Admin receipt verification. Third-party gateways (such as Razorpay or Stripe) are intentionally not connected.
                </Alert>
              </div>
            </Card>
          </div>
        );

      case 'attendance':
        return (
          <Card
            title="Attendance Monitoring & Correction Policy"
            subtitle="Active centre attendance behavior enforced across Teacher submissions and Admin overrides."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateShortcut('attendance')}
                iconRight={<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Open Attendance Module
              </Button>
            }
          >
            <div className="space-y-4">
              <div className="divide-y divide-[var(--border)] text-sm">
                <div className="py-3 first:pt-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      Supported Session Types
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Daily regular batch sessions and scheduled examination attendance.
                    </p>
                  </div>
                  <StatusText tone="nominal" label="Daily & Exam" />
                </div>
                <div className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      Admin Correction Audit Trail
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Every Admin attendance correction requires a written reason and records immutable audit history.
                    </p>
                  </div>
                  <StatusText tone="nominal" label="Required" />
                </div>
                <div className="py-3 last:pb-0 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      Automatic Absence Alerts
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Absent markings generate in-app alerts visible in Admin Attendance and Student Notification Centre.
                    </p>
                  </div>
                  <StatusText tone="nominal" label="In-App Active" />
                </div>
              </div>
            </div>
          </Card>
        );

      case 'notifications':
        return (
          <Card
            title="In-App Notification Preferences"
            subtitle="Control category visibility inside the unified Student Notification Centre. External channels remain disconnected."
          >
            <form onSubmit={handleNotificationSubmit} className="space-y-5">
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4">
                {(
                  [
                    {
                      key: 'attendance',
                      title: 'Attendance & Absence Alerts',
                      desc: 'Absence recordings and attendance correction updates',
                    },
                    {
                      key: 'homeworkTests',
                      title: 'Homework & Online Tests',
                      desc: 'Published homework, review feedback, and scheduled MCQ tests',
                    },
                    {
                      key: 'examsResults',
                      title: 'Examinations & Released Results',
                      desc: 'Exam schedules, schedule updates, and released score notices',
                    },
                    {
                      key: 'feesReceipts',
                      title: 'Fees, Verification & Receipts',
                      desc: 'Due reminders, payment claim decisions, and digital receipts',
                    },
                  ] as const
                ).map((cat) => (
                  <div key={cat.key} className="py-3.5">
                    <Switch
                      checked={notifDraft.enabledCategories[cat.key]}
                      onChange={(checked) =>
                        setNotifDraft({
                          ...notifDraft,
                          enabledCategories: {
                            ...notifDraft.enabledCategories,
                            [cat.key]: checked,
                          },
                        })
                      }
                      label={cat.title}
                      description={cat.desc}
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 items-center">
                <Select
                  label="Default Notification Filter"
                  value={notifDraft.defaultFilterView}
                  onChange={(e) =>
                    setNotifDraft({
                      ...notifDraft,
                      defaultFilterView:
                        e.target.value === 'unread_only' ? 'unread_only' : 'all',
                    })
                  }
                >
                  <option value="all">Show All Alerts</option>
                  <option value="unread_only">Unread Only by Default</option>
                </Select>

                <div className="rounded-xl border border-[var(--border)] p-3.5 sm:mt-6">
                  <Switch
                    checked={notifDraft.showUnreadBadgesInNavigation}
                    onChange={(checked) =>
                      setNotifDraft({
                        ...notifDraft,
                        showUnreadBadgesInNavigation: checked,
                      })
                    }
                    label="Show unread counts on category tabs"
                  />
                </div>
              </div>

              <Alert tone="info" title="External Delivery Channels">
                WhatsApp, SMS, Email, and external push notifications are disabled and not connected. Alerts remain strictly in-app.
              </Alert>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={saving}
                  iconLeft={<Save className="w-4 h-4" aria-hidden="true" />}
                >
                  Save Notification Preferences
                </Button>
              </div>
            </form>
          </Card>
        );

      case 'system_info':
        return (
          <div className="space-y-6">
            {systemOverview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile
                  label="Active Teachers & Students"
                  value={
                    systemOverview.activeTeachersCount +
                    systemOverview.activeStudentsCount
                  }
                  caption={`${systemOverview.activeTeachersCount} teachers · ${systemOverview.activeStudentsCount} students`}
                  icon={<GraduationCap className="w-4 h-4" />}
                />
                <StatTile
                  label="Academic Structure"
                  value={`${systemOverview.configuredClassesCount} / ${systemOverview.configuredBatchesCount}`}
                  caption={`${systemOverview.configuredSubjectsCount} subjects · ${systemOverview.activeTimetableEntriesCount} slots`}
                  icon={<SlidersHorizontal className="w-4 h-4" />}
                />
                <StatTile
                  label="Fee Rule & UPI Status"
                  value={systemOverview.feeConfigStatusLabel}
                  caption={`UPI: ${systemOverview.upiConfigStatusLabel}`}
                  icon={<IndianRupee className="w-4 h-4" />}
                />
                <StatTile
                  label="Pending Claim Queue"
                  value={systemOverview.pendingClaimsCount}
                  caption="Awaiting Admin verification"
                  icon={<Bell className="w-4 h-4" />}
                  accent={systemOverview.pendingClaimsCount > 0}
                />
              </div>
            )}

            <Card
              title="Application Runtime & Environment"
              subtitle="Verified application release, persistence adapter, and Spark Free Plan mode."
              action={
                <StatusText
                  tone={isFirebaseConnectedMode() ? 'nominal' : 'warning'}
                  label={isFirebaseConnectedMode() ? 'FIREBASE_CONNECTED' : 'LOCAL_DEMO'}
                />
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-1.5">
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Application Identity & Package Version
                  </p>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {settings.applicationBranding.displayName} ({settings.centreProfile.centreName})
                  </p>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    Package Version: v{APP_PACKAGE_VERSION}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 space-y-1.5">
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Persistence & Storage Mode
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {isFirebaseConnectedMode()
                      ? 'Connected directly to Firebase project academy-0007 (Authentication & Cloud Firestore on Spark Free Plan; Cloud Functions disabled) with strict role-scoped security rules.'
                      : 'Explicit LOCAL_DEMO development mode active inside this browser.'}
                  </p>
                </div>
              </div>
            </Card>

            <Card
              title="Service & Integration Inventory"
              subtitle="Exact status of frontend modules, Firebase services, and disconnected external services."
            >
              <div className="divide-y divide-[var(--border)]">
                {integrations.map((item) => {
                  const badge = getIntegrationTone(item.status);
                  return (
                    <div
                      key={item.id}
                      className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {item.purpose} — {item.detail}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <StatusText tone={badge.tone} label={badge.label} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        );

      case 'data_privacy':
        return (
          <div className="space-y-6">
            <AdminMigrationSection />

            <Card
              title="Browser Device Preferences"
              subtitle="Reset your local browser theme override back to the centre default without affecting stored data."
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Clears only the local device theme choice stored in this browser.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmClearPrefsOpen(true)}
                >
                  Reset Local Theme Preference
                </Button>
              </div>
            </Card>
          </div>
        );
    }
  };

  return (
    <>
      <SettingsShell
        eyebrow={`${settings?.centreProfile.centreName ?? 'Tuition Centre'} · Admin Settings`}
        title="Settings"
        subtitle="Select a category below to manage your account, centre identity, branding, theme defaults, operations, and data."
        rightSlot={
          <StatusText
            tone={isPreviewActive ? 'warning' : 'nominal'}
            label={
              isPreviewActive
                ? 'Live Branding Preview Active'
                : `${principal.loginId} · Settings Ready`
            }
          />
        }
        alerts={
          (toast || error) && (
            <div className="space-y-2.5">
              {toast && (
                <Alert tone="success" onDismiss={() => setToast(null)}>
                  {toast}
                </Alert>
              )}
              {error && (
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              )}
            </div>
          )
        }
        categories={categories}
        activeCategoryId={activeCategory}
        onSelectCategory={(next) => {
          setActiveCategory(next);
          setError(null);
          setFieldError(null);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={
          loading ||
          !settings ||
          !centreDraft ||
          !brandingDraft ||
          !appearanceDraft ||
          !academicDraft ||
          !notifDraft
        }
        renderCategoryContent={renderCategoryContent}
      />

      <ConfirmDialog
        open={confirmResetBrandingOpen}
        onClose={() => setConfirmResetBrandingOpen(false)}
        onConfirm={() => void handleConfirmResetBranding()}
        title="Restore Default Branding?"
        subtitle="Resets application display name, tagline, login welcome text, and removes any custom logo."
        description="Your Tuition Centre Profile contact details, academic settings, accounts, and financial records will not be altered."
        cancelLabel="Keep Current Branding"
        confirmLabel="Confirm Restore Defaults"
        confirmVariant="danger"
        loading={saving}
        tone="warning"
      />

      <ConfirmDialog
        open={confirmNotifDisableOpen}
        onClose={() => setConfirmNotifDisableOpen(false)}
        onConfirm={() => void persistNotificationPrefs()}
        title="Hide Selected Notification Category?"
        subtitle="Disabling a category hides it from the Student Notification Centre."
        description="Underlying historical attendance, homework, exam, and fee records remain safely stored and unaffected. You can re-enable any category at any time."
        cancelLabel="Review Settings"
        confirmLabel="Confirm & Save"
        confirmVariant="primary"
        loading={saving}
        tone="warning"
      />

      <ConfirmDialog
        open={confirmClearPrefsOpen}
        onClose={() => setConfirmClearPrefsOpen(false)}
        onConfirm={handleClearDeviceThemeOverride}
        title="Reset Local Theme Preference?"
        description="Removes your local device Light/Dark Charcoal override so this browser follows the centre default theme."
        cancelLabel="Keep Preference"
        confirmLabel="Reset Theme Preference"
        confirmVariant="primary"
        tone="neutral"
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
          title="Sign Out of Admin Session?"
          description="You will be signed out of the Admin portal on this device and redirected to the Admin sign-in screen."
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

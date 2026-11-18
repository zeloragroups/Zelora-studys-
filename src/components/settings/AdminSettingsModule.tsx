import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Eye,
  FileBarChart2,
  GraduationCap,
  History,
  ImagePlus,
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
import {
  isFirebaseConnectedMode,
  LOCAL_LOGO_NOTICE,
  settingsService,
  SettingsServiceError,
} from '../../services';
import { AdminMigrationSection } from './AdminMigrationSection';
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
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

type SettingsSectionTab =
  | 'centre_profile'
  | 'branding'
  | 'appearance'
  | 'academic_notifications'
  | 'modules_status'
  | 'security_audit'
  | 'data_migration'
  | 'about_demo';

const SETTINGS_TABS: Array<{
  id: SettingsSectionTab;
  label: string;
  icon: typeof Building2;
}> = [
  { id: 'centre_profile', label: 'Centre Profile', icon: Building2 },
  { id: 'branding', label: 'App Branding', icon: ImagePlus },
  { id: 'appearance', label: 'Theme Defaults', icon: Palette },
  { id: 'academic_notifications', label: 'Academic & Alerts', icon: Bell },
  { id: 'modules_status', label: 'Modules & Status', icon: SlidersHorizontal },
  { id: 'security_audit', label: 'Security & Audit', icon: ShieldCheck },
  { id: 'data_migration', label: 'Firebase & Migration', icon: History },
  { id: 'about_demo', label: 'System Status', icon: Info },
];

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
  const {
    isPreviewActive,
    setBrandingDraftPreview,
    refreshAppSettings,
  } = useInterface();

  const [activeTab, setActiveTab] = useState<SettingsSectionTab>('centre_profile');
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

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  // Clear live preview draft if the Admin navigates away from Settings without applying
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
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Only authorized Administrators can view or modify tuition centre settings and branding.
        </p>
      </Card>
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
      const updated = await settingsService.updateApplicationBranding(
        principal,
        brandingDraft
      );
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
      const updated = await settingsService.updateAppearanceDefaults(
        principal,
        appearanceDraft
      );
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
      const updated = await settingsService.updateAcademicDefaults(
        principal,
        academicDraft
      );
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
      const updated = await settingsService.updateNotificationPreferences(
        principal,
        notifDraft
      );
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
          <p className="font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
            {formatDateTime(r.timestamp)}
          </p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
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
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{r.summary}</p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
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
          <p className="text-[#687086] dark:text-[#A6B0C3]">From: {r.previousValues}</p>
          <p className="text-[#17172B] dark:text-[#F8FAFC]">To: {r.newValues}</p>
        </div>
      ),
    },
  ];

  const moduleShortcuts: Array<{
    title: string;
    description: string;
    navId: string;
    subTab?: string;
  }> = [
    {
      title: 'Accounts & Role IDs',
      description: 'Create and manage Teacher & Student login IDs and passwords',
      navId: 'lookup',
    },
    {
      title: 'Classes',
      description: 'Configure grade levels and active class records',
      navId: 'academics',
      subTab: 'classes',
    },
    {
      title: 'Batches',
      description: 'Manage batch cohorts and schedules under classes',
      navId: 'academics',
      subTab: 'batches',
    },
    {
      title: 'Subjects',
      description: 'Map academic subjects to classes',
      navId: 'academics',
      subTab: 'subjects',
    },
    {
      title: 'Student Enrolments',
      description: 'Assign students to active class and batch placements',
      navId: 'academics',
      subTab: 'enrolments',
    },
    {
      title: 'Teacher Assignments',
      description: 'Link teachers to batches and subjects',
      navId: 'academics',
      subTab: 'assignments',
    },
    {
      title: 'Weekly Timetable',
      description: 'Schedule conflict-checked class timetable entries',
      navId: 'academics',
      subTab: 'timetable',
    },
    {
      title: 'Attendance & Alerts',
      description: 'Review daily/exam sessions and audited corrections',
      navId: 'attendance',
    },
    {
      title: 'Assessments & Marks',
      description: 'Inspect homework, online tests, exams, and audit history',
      navId: 'assessments',
    },
    {
      title: 'Centre Notices',
      description: 'Draft, publish, or archive targeted announcements',
      navId: 'notices',
    },
    {
      title: 'Fee Structure Rules',
      description: 'Configure fixed INR fee templates and due dates',
      navId: 'finance',
      subTab: 'fee_config',
    },
    {
      title: 'UPI Pay Now Settings',
      description: 'Manage Merchant/Centre UPI ID and payee details',
      navId: 'finance',
      subTab: 'upi_config',
    },
    {
      title: 'Payment Verification & Receipts',
      description: 'Verify student UPI claims and issue official receipts',
      navId: 'finance',
      subTab: 'verification_queue',
    },
    {
      title: 'Teacher Salaries & Reports',
      description: 'Manage teacher payroll and export monthly/yearly reports',
      navId: 'finance',
      subTab: 'salaries',
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${settings?.centreProfile.centreName ?? 'Tuition Centre'} · Admin Settings Centre (${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo Adapter'})`}
        title="Application Settings & Configuration"
        subtitle="Configure tuition centre identity, live application branding, appearance defaults, academic defaults, in-app notifications, and inspect system status."
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
      />

      {toast && (
        <div
          role="status"
          className="rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/40 bg-[#168A62]/8 dark:bg-[#22C58B]/12 px-4 py-3 text-sm text-[#168A62] dark:text-[#22C58B] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-4 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {error}
        </div>
      )}

      {/* Sub-Section Tabs */}
      <div
        className="flex flex-wrap gap-2 pb-1"
        role="tablist"
        aria-label="Settings Centre Sections"
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab.id);
                setError(null);
                setFieldError(null);
              }}
              className={cn(
                'inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                active
                  ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white font-semibold shadow-xs'
                  : 'bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] text-[#434960] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading || !settings || !centreDraft || !brandingDraft || !appearanceDraft || !academicDraft || !notifDraft ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="h-44 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844]/70 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* 1. TUITION CENTRE PROFILE */}
          {activeTab === 'centre_profile' && (
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
                    label="Tuition Centre Name *"
                    value={centreDraft.centreName}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, centreName: e.target.value })
                    }
                    placeholder="e.g., Scholars Academy"
                    error={fieldError === 'centreName' ? error ?? undefined : undefined}
                  />
                  <Input
                    label="Short Name *"
                    value={centreDraft.shortName}
                    onChange={(e) =>
                      setCentreDraft({ ...centreDraft, shortName: e.target.value })
                    }
                    placeholder="e.g., Scholars"
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

                <div className="pt-4 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      Optional Contact & Address Details
                    </h3>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
          )}

          {/* 2. DYNAMIC APPLICATION BRANDING & LIVE PREVIEW */}
          {activeTab === 'branding' && (
            <div className="grid gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
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
                        label="Application Display Name *"
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
                        label="Short Application Name *"
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
                      label="Teacher & Student Portal Welcome Heading *"
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

                    <div>
                      <label className="block text-xs font-medium text-[#434960] dark:text-[#D4DCEB] mb-1.5">
                        Teacher & Student Portal Supporting Description *
                      </label>
                      <textarea
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
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-2 focus:outline-[#7552D9] dark:focus:outline-[#8B5CF6]"
                      />
                    </div>

                    {/* Local Logo Uploader */}
                    <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <BrandLogoMark
                            logoConfiguration={brandingDraft.logoConfiguration}
                            alt={brandingDraft.displayName}
                            size="lg"
                          />
                          <div>
                            <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                              Application Logo Mark
                            </p>
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                          <label className="min-h-[40px] px-3 py-2 inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#202844] text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#283254] cursor-pointer">
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
                      <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
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

              {/* Live Visual Preview Surfaces */}
              <div className="lg:col-span-5 space-y-4">
                <Card
                  title="Live Branding Surface Preview"
                  subtitle="Verify header, login screen, sidebar, and receipt presentation before applying."
                >
                  <div className="space-y-4">
                    {/* Preview 1: Top Header */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        1. Portal Header & Sidebar Badge
                      </p>
                      <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BrandLogoMark
                            logoConfiguration={brandingDraft.logoConfiguration}
                            alt={brandingDraft.displayName}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold font-display text-[#17172B] dark:text-[#F8FAFC] truncate">
                              {brandingDraft.displayName || 'Application Name'}
                            </p>
                            <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] truncate">
                              {brandingDraft.shortName} · {academicDraft.academicYearDisplay}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Preview 2: Portal Login Card */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        2. Teacher & Student Login Welcome
                      </p>
                      <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] p-4 space-y-1.5">
                        <p className="text-[11px] font-medium text-[#7552D9] dark:text-[#A78BFA]">
                          Teacher & Student Portal · {academicDraft.academicYearDisplay}
                        </p>
                        <p className="text-base font-bold text-[#17172B] dark:text-[#F8FAFC]">
                          {brandingDraft.loginWelcomeHeading || 'Welcome Back'}
                        </p>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                          {brandingDraft.loginDescription}
                        </p>
                      </div>
                    </div>

                    {/* Preview 3: Receipt Header */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        3. Receipt & Printable Report Masthead
                      </p>
                      <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA]/55 dark:bg-[#202844]/70 p-3.5 flex items-start gap-3">
                        <BrandLogoMark
                          logoConfiguration={brandingDraft.logoConfiguration}
                          alt={centreDraft.centreName}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-[#7552D9] dark:text-[#C4B5FD]">
                            Official Verified Payment Receipt
                          </p>
                          <p className="text-sm font-bold font-display text-[#17172B] dark:text-[#F8FAFC] truncate">
                            {centreDraft.centreName}
                          </p>
                          {brandingDraft.tagline && (
                            <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] truncate">
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
          )}

          {/* 3. THEME & APPEARANCE DEFAULTS */}
          {activeTab === 'appearance' && (
            <Card
              title="Theme & Appearance Defaults"
              subtitle="Set the default Light or Dark Navy theme for new users without overriding anyone's existing personal choice."
            >
              <form onSubmit={handleSaveAppearance} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAppearanceDraft({ ...appearanceDraft, defaultTheme: 'light' })
                    }
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-all cursor-pointer space-y-3',
                      appearanceDraft.defaultTheme === 'light'
                        ? 'border-[#7552D9] bg-[#F1EEFA] ring-2 ring-[#7552D9]/20'
                        : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        <Sun className="w-4 h-4 text-[#7552D9]" aria-hidden="true" />
                        <span>Default: Light Mode</span>
                      </span>
                      {appearanceDraft.defaultTheme === 'light' && (
                        <StatusText tone="nominal" label="Selected" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#F8F9FC] border border-[#E5E7EF]" />
                      <span className="w-6 h-6 rounded-lg bg-[#F1EEFA] border border-[#E5E7EF]" />
                      <span className="w-6 h-6 rounded-lg bg-[#7552D9]" />
                      <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Clean crisp surfaces & violet accent
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAppearanceDraft({ ...appearanceDraft, defaultTheme: 'dark' })
                    }
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-all cursor-pointer space-y-3',
                      appearanceDraft.defaultTheme === 'dark'
                        ? 'border-[#8B5CF6] bg-[#202844] ring-2 ring-[#8B5CF6]/25'
                        : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        <Moon className="w-4 h-4 text-[#A78BFA]" aria-hidden="true" />
                        <span>Default: Dark Navy</span>
                      </span>
                      {appearanceDraft.defaultTheme === 'dark' && (
                        <StatusText tone="nominal" label="Selected" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#101426] border border-[#303A55]" />
                      <span className="w-6 h-6 rounded-lg bg-[#171D34] border border-[#303A55]" />
                      <span className="w-6 h-6 rounded-lg bg-[#8B5CF6]" />
                      <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Rich deep navy & electric purple
                      </span>
                    </div>
                  </button>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appearanceDraft.allowPersonalThemePreference}
                    onChange={(e) =>
                      setAppearanceDraft({
                        ...appearanceDraft,
                        allowPersonalThemePreference: e.target.checked,
                      })
                    }
                    className="mt-0.5 w-4 h-4 accent-[#7552D9]"
                  />
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      Allow users to choose a personal Light / Dark Navy override
                    </span>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      When enabled, changing the centre default only applies to users who have not set a personal theme preference on their device. Disable to enforce the centre default everywhere.
                    </p>
                  </div>
                </label>

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
          )}

          {/* 4. ACADEMIC CONFIGURATION & IN-APP NOTIFICATION PREFERENCES */}
          {activeTab === 'academic_notifications' && (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Academic Display Configuration"
                subtitle="Configure academic year label, term label, and default student timetable view without altering existing schedules."
              >
                <form onSubmit={handleSaveAcademicDefaults} className="space-y-4" noValidate>
                  <Input
                    label="Academic Year / Session Display Label *"
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

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#434960] dark:text-[#D4DCEB]">
                      Default Student Timetable View
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setAcademicDraft({ ...academicDraft, defaultTimetableView: 'weekly' })
                        }
                        className={cn(
                          'min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors',
                          academicDraft.defaultTimetableView === 'weekly'
                            ? 'border-[#7552D9] bg-[#F1EEFA] text-[#7552D9] dark:border-[#8B5CF6] dark:bg-[#202844] dark:text-[#C4B5FD]'
                            : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] text-[#687086] dark:text-[#A6B0C3]'
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
                            ? 'border-[#7552D9] bg-[#F1EEFA] text-[#7552D9] dark:border-[#8B5CF6] dark:bg-[#202844] dark:text-[#C4B5FD]'
                            : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] text-[#687086] dark:text-[#A6B0C3]'
                        )}
                      >
                        Today Focus View
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                    Display defaults never modify saved timetables, attendance percentage formulas, or teacher result-release locks.
                  </p>

                  <div className="flex justify-end pt-1">
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

              <Card
                title="In-App Notification Preferences"
                subtitle="Control category visibility inside the unified Student Notification Centre. External channels remain disconnected."
              >
                <form onSubmit={handleNotificationSubmit} className="space-y-4">
                  <div className="space-y-2.5">
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
                      <label
                        key={cat.key}
                        className="flex items-start gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={notifDraft.enabledCategories[cat.key]}
                          onChange={(e) =>
                            setNotifDraft({
                              ...notifDraft,
                              enabledCategories: {
                                ...notifDraft.enabledCategories,
                                [cat.key]: e.target.checked,
                              },
                            })
                          }
                          className="mt-0.5 w-4 h-4 accent-[#7552D9]"
                        />
                        <div>
                          <p className="text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {cat.title}
                          </p>
                          <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3]">
                            {cat.desc}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-[#434960] dark:text-[#D4DCEB] mb-1.5">
                        Default Notification Filter
                      </label>
                      <select
                        value={notifDraft.defaultFilterView}
                        onChange={(e) =>
                          setNotifDraft({
                            ...notifDraft,
                            defaultFilterView:
                              e.target.value === 'unread_only' ? 'unread_only' : 'all',
                          })
                        }
                        className="w-full min-h-[44px] rounded-xl px-3 text-xs bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55]"
                      >
                        <option value="all">Show All Alerts</option>
                        <option value="unread_only">Unread Only by Default</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-2.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] px-3 py-2 cursor-pointer mt-5 sm:mt-6">
                      <input
                        type="checkbox"
                        checked={notifDraft.showUnreadBadgesInNavigation}
                        onChange={(e) =>
                          setNotifDraft({
                            ...notifDraft,
                            showUnreadBadgesInNavigation: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-[#7552D9]"
                      />
                      <span className="text-xs font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        Show unread counts on category tabs
                      </span>
                    </label>
                  </div>

                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA]/60 dark:bg-[#202844]/60 p-3 text-xs text-[#687086] dark:text-[#A6B0C3]">
                    <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      External Delivery Channels:
                    </span>{' '}
                    WhatsApp, SMS, Email, and external push notifications are disabled and not connected in this local development release.
                  </div>

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
            </div>
          )}

          {/* 5. CENTRALIZED MODULE SHORTCUTS & SYSTEM STATUS */}
          {activeTab === 'modules_status' && (
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
                    icon={<FileBarChart2 className="w-4 h-4" />}
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
                title="Centralized Admin Module Shortcuts"
                subtitle="Jump straight into every operational, academic, and financial configuration section without duplicate forms."
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {moduleShortcuts.map((sc) => (
                    <button
                      key={`${sc.navId}-${sc.subTab ?? 'root'}`}
                      type="button"
                      onClick={() => onNavigateShortcut(sc.navId, sc.subTab)}
                      className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:bg-[#F1EEFA] dark:hover:bg-[#202844] p-4 text-left transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                          {sc.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {sc.description}
                        </p>
                      </div>
                      <ArrowRight
                        className="w-4 h-4 text-[#687086] group-hover:text-[#7552D9] dark:text-[#A6B0C3] dark:group-hover:text-[#C4B5FD] shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* 6. ACCOUNT, SECURITY & AUDIT HISTORY */}
          {activeTab === 'security_audit' && (
            <div className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <Card
                  title="Administrator Account & Session"
                  subtitle="Active Admin identity and authorization boundary (no passwords, tokens, or secret keys exposed)."
                >
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Admin ID</span>
                      <span className="font-mono font-semibold">{principal.loginId}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Display Name</span>
                      <span className="font-semibold">{principal.fullName}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Account Status</span>
                      <StatusText tone="nominal" label="Active Administrator" />
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Session Adapter</span>
                      <span className="font-mono text-xs">{session.dataSourceMode}</span>
                    </div>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed pt-1">
                      Teacher and Student passwords are reset only by Admin inside the Accounts module. Production Admin authentication & recovery will connect in Phase 10.
                    </p>
                    {onSignOut && (
                      <div className="pt-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={onSignOut}
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
                  subtitle="Last persisted Admin change recorded in local application settings."
                >
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Updated By</span>
                      <span className="font-mono font-semibold">{settings.updatedBy}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Last Updated</span>
                      <span className="font-mono text-xs tabular-nums">
                        {formatDateTime(settings.updatedAt)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5E7EF] dark:border-[#303A55]">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Schema Version</span>
                      <span className="font-mono">v{settings.schemaVersion}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[#687086] dark:text-[#A6B0C3]">Audit Entries</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {auditEntries.length}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              <Card
                title={`Settings Audit History (${auditEntries.length})`}
                subtitle="Append-only log of centre profile, branding, appearance, academic, and notification changes."
                action={<History className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />}
              >
                <Table
                  columns={auditColumns}
                  rows={auditEntries}
                  rowKey={(r) => r.id}
                  emptyTitle="No settings changes logged yet"
                  emptyDescription="Any updates to centre profile, branding, theme policy, or notification settings appear here."
                  mobileCardRender={(r) => (
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {r.summary}
                      </p>
                      <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
                        {r.actorId} · {formatDateTime(r.timestamp)}
                      </p>
                      <p className="text-[#687086] dark:text-[#A6B0C3]">From: {r.previousValues}</p>
                      <p className="text-[#17172B] dark:text-[#F8FAFC]">To: {r.newValues}</p>
                    </div>
                  )}
                />
              </Card>
            </div>
          )}

          {/* 7. FIREBASE & CONTROLLED DATA MIGRATION */}
          {activeTab === 'data_migration' && <AdminMigrationSection />}

          {/* 8. SYSTEM STATUS & ENVIRONMENT TRANSPARENCY */}
          {activeTab === 'about_demo' && (
            <div className="space-y-6">
              <Card
                title="Application Runtime & Environment"
                subtitle="Accurate runtime status and Phase 10 Firebase integration telemetry."
                action={
                  <StatusText
                    tone={isFirebaseConnectedMode() ? 'nominal' : 'warning'}
                    label={
                      isFirebaseConnectedMode() ? 'FIREBASE_CONNECTED' : 'LOCAL_DEMO'
                    }
                  />
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 space-y-1.5">
                    <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                      Application Identity & Package Version
                    </p>
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {settings.applicationBranding.displayName} ({settings.centreProfile.centreName})
                    </p>
                    <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                      Package Version: v{APP_PACKAGE_VERSION} · Phase 10 of 10 Active
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 space-y-1.5">
                    <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                      Persistence & Storage Mode
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                      {isFirebaseConnectedMode()
                        ? 'Connected directly to Firebase project academy-0007 (Auth, Cloud Firestore, restricted Storage, and optional Cloud Functions) with strict role-scoped security rules.'
                        : 'Explicit LOCAL_DEMO development mode active inside this browser.'}
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                title="Service & Integration Inventory"
                subtitle="Exact status of existing frontend modules, local adapters, disconnected cloud services, and excluded APIs."
              >
                <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                  {integrations.map((item) => {
                    const badge = getIntegrationTone(item.status);
                    return (
                      <div
                        key={item.id}
                        className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {item.name}
                          </p>
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
          )}
        </>
      )}

      {/* Confirm Restore Default Branding Modal */}
      <Modal
        open={confirmResetBrandingOpen}
        onClose={() => setConfirmResetBrandingOpen(false)}
        title="Restore Default Branding?"
        subtitle="Resets application display name, tagline, login welcome text, and removes any custom uploaded local logo."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 text-xs text-[#687086] dark:text-[#A6B0C3] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#B7791F] dark:text-[#F5B942] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Your Tuition Centre Profile contact details, academic settings, accounts, and financial records will not be altered.
            </span>
          </div>
          <div className="flex justify-end gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmResetBrandingOpen(false)}
            >
              Keep Current Branding
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={saving}
              onClick={() => void handleConfirmResetBranding()}
            >
              Confirm Restore Defaults
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Disabling In-App Notification Category Modal */}
      <Modal
        open={confirmNotifDisableOpen}
        onClose={() => setConfirmNotifDisableOpen(false)}
        title="Hide Selected Notification Category?"
        subtitle="Disabling a category hides it from the Student Notification Centre."
      >
        <div className="space-y-4">
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
            Underlying historical attendance, homework, exam, and fee records remain safely stored and unaffected. You can re-enable any category at any time.
          </p>
          <div className="flex justify-end gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmNotifDisableOpen(false)}
            >
              Review Settings
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={() => void persistNotificationPrefs()}
            >
              Confirm & Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

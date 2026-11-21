import type { AccentPaletteId } from '../design/palettes';

export interface CentreProfile {
  centreName: string;
  shortName: string;
  tagline: string;
  contactNumber: string;
  secondaryContactNumber: string;
  publicEmail: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  websiteUrl: string;
}

export interface LogoConfiguration {
  mode: 'default_icon' | 'custom_local_image' | 'firebase_storage_image';
  dataUrl?: string;
  downloadUrl?: string;
  storagePath?: string;
  fileName?: string;
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes?: number;
  updatedAt?: string;
  storageNotice: string;
}

export interface ApplicationBranding {
  displayName: string;
  shortName: string;
  tagline: string;
  loginWelcomeHeading: string;
  loginDescription: string;
  logoConfiguration: LogoConfiguration;
}

export interface AppearanceDefaults {
  defaultTheme: 'light' | 'dark';
  defaultAccentPalette?: AccentPaletteId;
  allowPersonalThemePreference: boolean;
}

export type TimetableDefaultView = 'weekly' | 'today';

export interface AcademicDefaults {
  academicYearDisplay: string;
  defaultTimetableView: TimetableDefaultView;
  academicTermLabel: string;
}

export interface NotificationCategoryPreferences {
  attendance: boolean;
  homeworkTests: boolean;
  examsResults: boolean;
  feesReceipts: boolean;
}

export interface NotificationPreferences {
  enabledCategories: NotificationCategoryPreferences;
  defaultFilterView: 'all' | 'unread_only';
  showUnreadBadgesInNavigation: boolean;
  externalChannelsStatus: 'disabled_local_demo' | 'in_app_firestore';
}

export interface ApplicationSettings {
  id: 'APP-SETTINGS-001';
  centreProfile: CentreProfile;
  applicationBranding: ApplicationBranding;
  appearanceDefaults: AppearanceDefaults;
  academicDefaults: AcademicDefaults;
  notificationPreferences: NotificationPreferences;
  updatedBy: string;
  updatedAt: string;
  schemaVersion: number;
  environmentMode: 'local_demo_adapter' | 'firebase_connected';
}

export type PublicApplicationSettings = Pick<
  ApplicationSettings,
  | 'centreProfile'
  | 'applicationBranding'
  | 'appearanceDefaults'
  | 'academicDefaults'
  | 'notificationPreferences'
  | 'updatedAt'
  | 'environmentMode'
>;

export type SettingsAuditCategory =
  | 'centre_profile'
  | 'application_branding'
  | 'appearance_defaults'
  | 'academic_defaults'
  | 'notification_preferences'
  | 'branding_reset';

export interface SettingsAuditEntry {
  id: string;
  actorId: string;
  action: string;
  category: SettingsAuditCategory;
  summary: string;
  previousValues: string;
  newValues: string;
  timestamp: string;
}

export type IntegrationStatusBadge =
  | 'existing'
  | 'local_only'
  | 'not_connected'
  | 'not_used';

export interface ApplicationIntegrationStatusItem {
  id: string;
  name: string;
  purpose: string;
  status: IntegrationStatusBadge;
  detail: string;
}

export interface AdminSystemStatusOverview {
  activeTeachersCount: number;
  activeStudentsCount: number;
  configuredClassesCount: number;
  configuredBatchesCount: number;
  configuredSubjectsCount: number;
  activeTimetableEntriesCount: number;
  feeConfigStatusLabel: string;
  upiConfigStatusLabel: string;
  pendingClaimsCount: number;
}

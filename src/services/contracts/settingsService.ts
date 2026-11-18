import type {
  AcademicDefaults,
  AdminSystemStatusOverview,
  AppearanceDefaults,
  ApplicationBranding,
  ApplicationIntegrationStatusItem,
  ApplicationSettings,
  AuthPrincipal,
  CentreProfile,
  NotificationPreferences,
  PublicApplicationSettings,
  SettingsAuditEntry,
} from '../../types';

export type SettingsErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND';

export class SettingsServiceError extends Error {
  code: SettingsErrorCode;
  field?: string;

  constructor(code: SettingsErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'SettingsServiceError';
    this.code = code;
    this.field = field;
  }
}

export interface IApplicationSettingsService {
  getPublicBrandingAndSettings(): Promise<PublicApplicationSettings>;
  getApplicationSettings(actor: AuthPrincipal | null): Promise<ApplicationSettings>;
  updateCentreProfile(
    actor: AuthPrincipal | null,
    input: CentreProfile
  ): Promise<ApplicationSettings>;
  updateApplicationBranding(
    actor: AuthPrincipal | null,
    input: ApplicationBranding
  ): Promise<ApplicationSettings>;
  updateAppearanceDefaults(
    actor: AuthPrincipal | null,
    input: AppearanceDefaults
  ): Promise<ApplicationSettings>;
  updateAcademicDefaults(
    actor: AuthPrincipal | null,
    input: AcademicDefaults
  ): Promise<ApplicationSettings>;
  updateNotificationPreferences(
    actor: AuthPrincipal | null,
    input: NotificationPreferences
  ): Promise<ApplicationSettings>;
  resetBrandingToDefaults(actor: AuthPrincipal | null): Promise<ApplicationSettings>;
  listSettingsAuditHistory(actor: AuthPrincipal | null): Promise<SettingsAuditEntry[]>;
  getApplicationIntegrationStatus(
    actor: AuthPrincipal | null
  ): Promise<ApplicationIntegrationStatusItem[]>;
  getSystemStatusOverview(
    actor: AuthPrincipal | null
  ): Promise<AdminSystemStatusOverview>;
}

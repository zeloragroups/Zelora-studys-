/**
 * Central application branding configuration.
 * Application names are never hardcoded inside UI components;
 * Admin Branding & Settings (Phase 9) will persist updates to this model.
 */
export interface BrandingConfig {
  centreName: string;
  shortName: string;
  tagline: string;
  academicYearLabel: string;
  supportEmailPlaceholder: string;
  defaultTheme: 'light' | 'dark' | 'system';
  currencyCode: 'INR';
  currencySymbol: '₹';
}

export const APP_PACKAGE_VERSION = '0.0.0';

export const DEFAULT_BRANDING_CONFIG: BrandingConfig = {
  centreName: 'Scholars Academy',
  shortName: 'Scholars',
  tagline: 'Structured Academic & Centre Operations',
  academicYearLabel: '2026–2027 Academic Session',
  supportEmailPlaceholder: 'office@centre-domain.example',
  defaultTheme: 'light',
  currencyCode: 'INR',
  currencySymbol: '₹',
};


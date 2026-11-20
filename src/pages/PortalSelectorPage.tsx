import { ArrowRight, Globe, GraduationCap, Mail, MapPin, Phone, Shield } from 'lucide-react';
import { useInterface } from '../context/InterfaceContext';
import { ROUTES, type AppRoutePath } from '../router/routes';
import { BrandLogoMark } from '../components/ui/BrandLogoMark';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ThemeToggle } from '../components/ui/ThemeToggle';

interface PortalSelectorPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

/**
 * Clean entry point separating the two web applications:
 * 1. Admin Web App (Dedicated Google-verified Admin portal)
 * 2. Teacher & Student Portal (Shared login with automatic role routing)
 */
export function PortalSelectorPage({ onNavigate }: PortalSelectorPageProps) {
  const { branding, publicSettings } = useInterface();
  const { centreProfile, applicationBranding } = publicSettings;

  const locationLine = [
    centreProfile.address,
    centreProfile.city,
    centreProfile.state,
    centreProfile.pinCode,
    centreProfile.country,
  ]
    .filter((v) => v && v.trim().length > 0)
    .join(', ');

  const hasCentreContactInfo = Boolean(
    centreProfile.contactNumber ||
      centreProfile.publicEmail ||
      locationLine ||
      centreProfile.websiteUrl
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F8] dark:bg-[#151A1E] text-[#171D21] dark:text-[#F4F7F6]">
      <header className="h-14 px-4 sm:px-6 border-b border-[#E2E8E5] dark:border-[#344047] bg-white/95 dark:bg-[#1D2429]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <BrandLogoMark
              logoConfiguration={applicationBranding.logoConfiguration}
              alt={branding.centreName}
              size="sm"
            />
            <span className="font-display text-base sm:text-lg font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] whitespace-nowrap truncate">
              {branding.centreName}
            </span>
          </div>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl space-y-8">
          <div className="space-y-2.5 max-w-2xl">
            <p className="text-xs font-medium text-[#168A63] dark:text-[#42DDA9]">
              {branding.academicYearLabel}
              {branding.tagline ? ` · ${branding.tagline}` : ''}
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] text-balance">
              Select Your Application Portal
            </h1>
            <p className="text-sm sm:text-base text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
              {centreProfile.centreName !== branding.centreName
                ? `${centreProfile.centreName} — `
                : ''}
              Unified academic, attendance, assessment, and financial operations backed by strict role-based access control.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card
              variant="charcoal"
              title="Admin Web App"
              subtitle="Dedicated centre management application"
            >
              <div className="space-y-5">
                <div className="flex items-start gap-3 text-sm text-[#AAB6B4] leading-relaxed">
                  <span className="w-9 h-9 rounded-xl bg-[#343C42] text-[#35D6A0] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <p>
                    Unified responsive Admin workspace across desktop, tablet, and mobile for authorized administrators.
                  </p>
                </div>
                <Button
                  variant="primary"
                  className="w-full justify-between"
                  onClick={() => onNavigate(ROUTES.ADMIN_LOGIN)}
                >
                  <span>Open Admin Login</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </div>
            </Card>

            <Card
              title="Teacher & Student Portal"
              subtitle="Shared login with automatic role routing"
            >
              <div className="space-y-5">
                <div className="flex items-start gap-3 text-sm text-[#68737C] dark:text-[#AAB6B4] leading-relaxed">
                  <span className="w-9 h-9 rounded-xl bg-[#DDF8EE] dark:bg-[#244B3E] text-[#168A63] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <p>
                    Single login for Teachers, Students, and Parents (using Student ID). Automatically opens the right dashboard after sign-in.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full justify-between"
                  onClick={() => onNavigate(ROUTES.PORTAL_LOGIN)}
                >
                  <span>Open Portal Login</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </div>
            </Card>
          </div>

          {hasCentreContactInfo && (
            <div className="rounded-2xl border border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#1D2429] p-4 sm:p-5 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs text-[#68737C] dark:text-[#AAB6B4]">
              <span className="font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                {centreProfile.centreName}
              </span>
              {centreProfile.contactNumber && (
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                  <span>{centreProfile.contactNumber}</span>
                </span>
              )}
              {centreProfile.publicEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                  <span>{centreProfile.publicEmail}</span>
                </span>
              )}
              {locationLine && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                  <span>{locationLine}</span>
                </span>
              )}
              {centreProfile.websiteUrl && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" strokeWidth={1.75} aria-hidden="true" />
                  <span>{centreProfile.websiteUrl}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

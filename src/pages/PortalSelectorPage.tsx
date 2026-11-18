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
 * 1. Admin Portal (Unified Responsive Admin Web App)
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
    <div className="min-h-screen flex flex-col bg-[#F8F9FC] dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC]">
      <header className="h-14 px-4 sm:px-6 border-b border-[#E5E7EF] dark:border-[#303A55] bg-white/95 dark:bg-[#171D34]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <BrandLogoMark
              logoConfiguration={applicationBranding.logoConfiguration}
              alt={branding.centreName}
              size="sm"
            />
            <span className="font-display text-base sm:text-lg font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] whitespace-nowrap truncate">
              {branding.centreName}
            </span>
          </div>
          <ThemeToggle compact />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl space-y-8">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-[#7552D9] dark:text-[#A78BFA]">
              {branding.academicYearLabel}
              {branding.tagline ? ` · ${branding.tagline}` : ''}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
              Select Your Application Portal
            </h1>
            <p className="text-sm sm:text-base text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
              {centreProfile.centreName !== branding.centreName
                ? `${centreProfile.centreName} — `
                : ''}
              Responsive management & academic workspaces backed by strict role-based access control.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card
              title="Admin Web App"
              subtitle="Dedicated centre management application"
            >
              <div className="space-y-5">
                <div className="flex items-start gap-3 text-sm text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                  <span className="w-9 h-9 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#A78BFA] inline-flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <p>
                    Unified responsive Admin Web App across desktop, laptop, tablet, and mobile for authorized administrators.
                  </p>
                </div>
                <Button
                  className="w-full justify-between"
                  onClick={() => onNavigate(ROUTES.ADMIN_LOGIN)}
                >
                  <span>Open Admin Login</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>

            <Card
              title="Teacher & Student Portal"
              subtitle="Shared login with automatic role routing"
            >
              <div className="space-y-5">
                <div className="flex items-start gap-3 text-sm text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                  <span className="w-9 h-9 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#A78BFA] inline-flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4" aria-hidden="true" />
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
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          </div>

          {hasCentreContactInfo && (
            <div className="rounded-2xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] p-4 sm:p-5 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs text-[#687086] dark:text-[#A6B0C3]">
              <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {centreProfile.centreName}
              </span>
              {centreProfile.contactNumber && (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                  <span>{centreProfile.contactNumber}</span>
                </span>
              )}
              {centreProfile.publicEmail && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                  <span>{centreProfile.publicEmail}</span>
                </span>
              )}
              {locationLine && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                  <span>{locationLine}</span>
                </span>
              )}
              {centreProfile.websiteUrl && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
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

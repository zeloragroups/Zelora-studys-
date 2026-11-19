import { useEffect, useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Button } from '../../components/ui/Button';

interface AdminLoginPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

/**
 * Dedicated Admin Login Page.
 * - Strictly separate from the Teacher & Student login page.
 * - Provides ONLY "Continue with Google" authentication.
 * - Enforces authorized Admin Gmail verification on the backend & Firestore Security Rules.
 */
export function AdminLoginPage({ onNavigate }: AdminLoginPageProps) {
  const { branding, publicSettings } = useInterface();
  const {
    signInAdminWithGoogle,
    isAuthenticated,
    principal,
    authNotice,
    clearAuthNotice,
  } = useAuth();

  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    if (isAuthenticated && principal && principal.role === 'admin') {
      onNavigate(getDefaultRouteForRole('admin'));
    }
  }, [isAuthenticated, principal, onNavigate]);

  const handleGoogleAdminSignIn = async () => {
    clearAuthNotice();
    setFormError(undefined);
    setGoogleSubmitting(true);
    try {
      const session = await signInAdminWithGoogle();
      if (session.principal && session.principal.role === 'admin') {
        onNavigate(getDefaultRouteForRole('admin'));
      }
    } catch (err) {
      if (err instanceof AuthServiceException) {
        setFormError(err.message);
      } else {
        setFormError('Unable to verify Admin Google Sign-In. Please try again.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <LoginShell
      branding={branding}
      logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
      portalLabel="Admin Portal"
      heading="Administrator Sign In"
      subtitle="Sign in with your authorized Administrator Google account to open the Admin Dashboard."
      onNavigateHome={() => onNavigate(ROUTES.HOME)}
    >
      <div className="space-y-4">
        {authNotice && !formError && (
          <div
            role="status"
            className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA] dark:bg-[#202844] px-3.5 py-2.5 text-xs text-[#17172B] dark:text-[#F8FAFC]"
          >
            {authNotice}
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 px-3.5 py-2.5 text-xs font-medium text-[#D94C5C] dark:text-[#F16B75]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <Button
          type="button"
          loading={googleSubmitting}
          onClick={() => void handleGoogleAdminSignIn()}
          iconLeft={
            <ShieldCheck
              className="w-4 h-4 text-white"
              aria-hidden="true"
            />
          }
          className="w-full"
        >
          Continue with Google
        </Button>

        <p className="text-xs text-center text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
          Restricted to authorized Administrator Google accounts. Unauthorized Google accounts are denied access.
        </p>
      </div>
    </LoginShell>
  );
}

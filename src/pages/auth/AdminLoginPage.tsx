import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Alert } from '../../components/ui/Alert';
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
        {authNotice && !formError && <Alert tone="info">{authNotice}</Alert>}

        {formError && <Alert tone="error">{formError}</Alert>}

        <Button
          type="button"
          variant="primary"
          loading={googleSubmitting}
          onClick={() => void handleGoogleAdminSignIn()}
          iconLeft={
            <ShieldCheck
              className="w-4 h-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          }
          className="w-full"
        >
          Continue with Google
        </Button>

        <p className="text-xs text-center text-[var(--text-secondary)] leading-relaxed">
          Restricted to authorized Administrator Google accounts. Unauthorized Google accounts are denied access.
        </p>
      </div>
    </LoginShell>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { isFirebaseConnectedMode } from '../../services';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface AdminLoginPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

export function AdminLoginPage({ onNavigate }: AdminLoginPageProps) {
  const { branding, publicSettings } = useInterface();
  const {
    signIn,
    signInAdminWithGoogle,
    isAuthenticated,
    principal,
    authNotice,
    clearAuthNotice,
  } = useAuth();
  const firebaseMode = isFirebaseConnectedMode();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [idError, setIdError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  useEffect(() => {
    if (isAuthenticated && principal) {
      onNavigate(getDefaultRouteForRole(principal.role));
    }
  }, [isAuthenticated, principal, onNavigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearAuthNotice();
    setIdError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);

    const trimmedId = loginId.trim();
    if (!trimmedId) {
      setIdError('Please enter your Admin ID.');
      return;
    }
    if (!password) {
      setPasswordError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await signIn({
        loginId: trimmedId,
        password,
        portalScope: 'admin_portal',
      });
      if (session.principal) {
        onNavigate(getDefaultRouteForRole(session.principal.role));
      }
    } catch (err) {
      if (err instanceof AuthServiceException) {
        if (err.field === 'loginId') {
          setIdError(err.message);
        } else if (err.field === 'password') {
          setPasswordError(err.message);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Unable to sign in right now. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleOperatorSignIn = async () => {
    clearAuthNotice();
    setFormError(undefined);
    setGoogleSubmitting(true);
    try {
      const session = await signInAdminWithGoogle();
      if (session.principal) {
        onNavigate(getDefaultRouteForRole(session.principal.role));
      }
    } catch (err) {
      if (err instanceof AuthServiceException) {
        setFormError(err.message);
      } else {
        setFormError('Unable to sign in with Google right now. Please try again.');
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
      subtitle="Access centre management, accounts, schedules, fees, and financial controls using your Admin ID."
      onNavigateHome={() => onNavigate(ROUTES.HOME)}
      footerLink={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Teacher or Student?</span>
          <button
            type="button"
            onClick={() => onNavigate(ROUTES.PORTAL_LOGIN)}
            className="font-medium text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
          >
            Go to Teacher & Student Portal
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

        <Input
          label="Admin ID"
          name="loginId"
          type="text"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          value={loginId}
          onChange={(e) => {
            setLoginId(e.target.value);
            setIdError(undefined);
            setFormError(undefined);
          }}
          placeholder="ADM-0001"
          className="font-mono"
          error={idError}
        />

        <Input
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(undefined);
            setFormError(undefined);
          }}
          placeholder="Enter your password"
          error={passwordError}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#687086] hover:text-[#17172B] dark:text-[#A6B0C3] dark:hover:text-[#F8FAFC] cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          }
        />

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onNavigate(ROUTES.ADMIN_FORGOT_PASSWORD)}
            className="text-xs font-medium text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          loading={submitting}
          disabled={googleSubmitting}
          className="w-full"
        >
          Sign In to Admin Portal
        </Button>

        {firebaseMode && (
          <div className="pt-3 border-t border-[#E5E7EF] dark:border-[#303A55] space-y-2.5">
            <Button
              type="button"
              variant="secondary"
              loading={googleSubmitting}
              disabled={submitting}
              onClick={() => void handleGoogleOperatorSignIn()}
              iconLeft={<ShieldCheck className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />}
              className="w-full"
            >
              Sign in with Operator Google Account
            </Button>
            <p className="text-[11px] text-center text-[#687086] dark:text-[#A6B0C3]">
              Authorized Firebase project operator (<span className="font-mono">toutionacademy@gmail.com</span>) or provisioned Admin Google identity.
            </p>
          </div>
        )}
      </form>
    </LoginShell>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface PortalLoginPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

/**
 * Shared Teacher & Student Portal Login Page.
 * - Zero role-selection dropdowns.
 * - Automatically identifies whether the authenticated account belongs to a
 *   Teacher or Student (shared with Parent) and routes accordingly.
 * - Never displays Admin login options or Admin information.
 */
export function PortalLoginPage({ onNavigate }: PortalLoginPageProps) {
  const { branding, publicSettings } = useInterface();
  const { signIn, isAuthenticated, principal, authNotice, clearAuthNotice } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      setIdError('Please enter your Teacher ID or Student ID.');
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
        portalScope: 'member_portal',
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

  return (
    <LoginShell
      branding={branding}
      logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
      portalLabel="Teacher & Student Portal"
      heading={publicSettings.applicationBranding.loginWelcomeHeading || 'Welcome Back'}
      subtitle={
        publicSettings.applicationBranding.loginDescription ||
        "Sign in with your assigned Teacher ID or Student ID. Parents use their child's Student ID and password."
      }
      onNavigateHome={() => onNavigate(ROUTES.HOME)}
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
          label="User ID"
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
          placeholder="TCH-0001 or STU-0001"
          hint="Your dashboard opens automatically based on your account."
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
            onClick={() => onNavigate(ROUTES.PORTAL_FORGOT_PASSWORD)}
            className="text-xs font-medium text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          loading={submitting}
          className="w-full"
        >
          Sign In
        </Button>
      </form>
    </LoginShell>
  );
}

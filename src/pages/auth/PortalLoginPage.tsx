import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Alert } from '../../components/ui/Alert';
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
        {authNotice && !formError && <Alert tone="info">{authNotice}</Alert>}

        {formError && <Alert tone="error">{formError}</Alert>}

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
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#68737C] hover:text-[#171D21] dark:text-[#AAB6B4] dark:hover:text-[#F4F7F6] cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          }
        />

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onNavigate(ROUTES.PORTAL_FORGOT_PASSWORD)}
            className="text-xs font-medium text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          className="w-full"
        >
          Sign In
        </Button>
      </form>
    </LoginShell>
  );
}

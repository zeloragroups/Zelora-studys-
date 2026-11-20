import { useEffect, useState, type FormEvent } from 'react';
import { BookOpenCheck, CalendarCheck2, ClipboardCheck, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { getDefaultRouteForRole, ROUTES, type AppRoutePath } from '../../router/routes';
import { Alert } from '../../components/ui/Alert';
import { BrandLogoMark } from '../../components/ui/BrandLogoMark';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

interface PortalLoginPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

const INSTITUTIONAL_ID_REGEX = /^[A-Za-z]{2,8}-\d{3,10}$/;
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Unified Student & Teacher Login Page for ZELORA STUDYS.
 * - Single shared form with institutional ID + password.
 * - Zero role selection controls, dropdowns, or separate Student/Teacher login cards.
 * - Automatically detects trusted role after authentication and redirects accordingly.
 * - Never links to or surfaces Admin authentication.
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

  const brandTitle = (branding.centreName || 'ZELORA STUDYS').toUpperCase();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) {
      return;
    }

    clearAuthNotice();
    setIdError(undefined);
    setPasswordError(undefined);
    setFormError(undefined);

    const normalizedId = loginId.trim();
    if (!normalizedId) {
      setIdError('Please enter your Student / Teacher ID.');
      return;
    }

    const isValidInstitutionalFormat =
      INSTITUTIONAL_ID_REGEX.test(normalizedId) ||
      (normalizedId.includes('@') && EMAIL_FORMAT_REGEX.test(normalizedId));

    if (!isValidInstitutionalFormat) {
      setIdError('Enter a valid institutional ID format (for example, STU-1024 or TCH-2048).');
      return;
    }

    if (!password) {
      setPasswordError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await signIn({
        loginId: normalizedId,
        password,
        portalScope: 'member_portal',
      });
      if (!session.principal || (session.principal.role !== 'student' && session.principal.role !== 'teacher')) {
        setFormError('Your account does not have permission to access this area.');
        return;
      }
      onNavigate(getDefaultRouteForRole(session.principal.role));
    } catch (err) {
      if (err instanceof AuthServiceException) {
        if (err.code === 'INACTIVE_ACCOUNT') {
          setFormError('Your account is currently inactive. Contact your ZELORA STUDYS administrator.');
        } else if (err.code === 'UNEXPECTED_ERROR') {
          setFormError('Unable to connect. Please try again.');
        } else if (err.code === 'EMPTY_PASSWORD' || err.field === 'password') {
          if (err.code === 'INCORRECT_PASSWORD') {
            setFormError('Invalid ID or password.');
          } else {
            setPasswordError(err.message);
          }
        } else if (err.code === 'EMPTY_ID') {
          setIdError(err.message);
        } else {
          setFormError('Invalid ID or password.');
        }
      } else {
        setFormError('Unable to connect. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9F8] dark:bg-[#151A1E] text-[#20262B] dark:text-[#F4F7F6]">
      {/* Compact Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-[#E2E8E5] dark:border-[#35413F] bg-white/95 dark:bg-[#1D2429]/95 backdrop-blur-md">
        <div className="max-w-5xl mx-auto h-full flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate(ROUTES.HOME)}
            className="inline-flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9] rounded-lg"
          >
            <BrandLogoMark
              logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
              alt={brandTitle}
              size="sm"
            />
            <span className="font-display text-sm sm:text-base font-bold tracking-[0.06em] uppercase text-[#20262B] dark:text-[#F4F7F6] whitespace-nowrap">
              {brandTitle}
            </span>
          </button>

          <ThemeToggle compact />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
          {/* Desktop Left Showcase Panel */}
          <section
            aria-label="Platform Overview"
            className="hidden lg:flex lg:col-span-6 flex-col justify-between rounded-2xl border border-[#E2E8E5] dark:border-[#35413F] bg-white dark:bg-[#1D2429] p-8"
          >
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <BrandLogoMark
                  logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
                  alt={brandTitle}
                  size="md"
                />
                <div>
                  <p className="font-display text-lg font-bold tracking-[0.08em] uppercase text-[#20262B] dark:text-[#F4F7F6]">
                    {brandTitle}
                  </p>
                  <p className="text-xs text-[#66736D] dark:text-[#A8B4B0]">
                    {branding.academicYearLabel}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-3xl font-semibold tracking-tight text-[#20262B] dark:text-[#F4F7F6] text-balance">
                  One Academic Workspace for Students &amp; Faculty
                </h2>
                <p className="text-sm leading-relaxed text-[#66736D] dark:text-[#A8B4B0]">
                  Sign in with your assigned institutional ID and password. Your dashboard, timetable, coursework, and academic records load automatically for your account.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E2E8E5] dark:border-[#35413F] space-y-4">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-[#F0F4F2] dark:bg-[#252E33] text-[#18B985] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Attendance &amp; Class Schedules
                  </p>
                  <p className="text-xs text-[#66736D] dark:text-[#A8B4B0]">
                    Real-time batch timetables and session attendance tracking.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-[#F0F4F2] dark:bg-[#252E33] text-[#18B985] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
                  <BookOpenCheck className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Homework &amp; Online Assessments
                  </p>
                  <p className="text-xs text-[#66736D] dark:text-[#A8B4B0]">
                    Structured assignments, objective tests, and verified feedback.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-[#F0F4F2] dark:bg-[#252E33] text-[#18B985] dark:text-[#42DDA9] inline-flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                    Results &amp; Fee Transparency
                  </p>
                  <p className="text-xs text-[#66736D] dark:text-[#A8B4B0]">
                    Published examination scores, digital receipts, and verified notices.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Unified Sign In Card (Right on Desktop, Primary on Mobile) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex items-center"
          >
            <div className="w-full rounded-2xl bg-white dark:bg-[#1D2429] border border-[#E2E8E5] dark:border-[#35413F] shadow-[0_6px_28px_rgba(23,29,33,0.06)] dark:shadow-none p-6 sm:p-8">
              <div className="mb-6">
                <div className="flex items-center gap-2 text-xs font-medium text-[#168A63] dark:text-[#42DDA9]">
                  <GraduationCap className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>{brandTitle} · Student &amp; Teacher Sign In</span>
                </div>
                <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[#20262B] dark:text-[#F4F7F6] text-balance">
                  {publicSettings.applicationBranding.loginWelcomeHeading || 'Welcome Back'}
                </h1>
                <p className="mt-1.5 text-sm text-[#66736D] dark:text-[#A8B4B0] leading-relaxed">
                  {publicSettings.applicationBranding.loginDescription ||
                    'Enter your institutional ID and password to access your Student or Teacher workspace.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {authNotice && !formError && <Alert tone="info">{authNotice}</Alert>}

                {formError && <Alert tone="error">{formError}</Alert>}

                <Input
                  label="Student / Teacher ID"
                  name="loginId"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  value={loginId}
                  onChange={(e) => {
                    setLoginId(e.target.value);
                    setIdError(undefined);
                    setFormError(undefined);
                  }}
                  placeholder="Enter your institutional ID"
                  hint="Example: STU-1024 or TCH-2048"
                  className="font-mono"
                  error={idError}
                />

                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(undefined);
                    setFormError(undefined);
                  }}
                  placeholder="Enter your password"
                  error={passwordError}
                  rightElement={
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      icon={
                        showPassword ? (
                          <EyeOff className="w-4 h-4" strokeWidth={1.75} />
                        ) : (
                          <Eye className="w-4 h-4" strokeWidth={1.75} />
                        )
                      }
                    />
                  }
                />

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onNavigate(ROUTES.PORTAL_FORGOT_PASSWORD)}
                    className="text-xs font-medium text-[#168A63] dark:text-[#42DDA9] hover:underline cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-[#18B985] dark:focus-visible:outline-[#42DDA9]"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={submitting}
                  disabled={submitting}
                  className="w-full"
                >
                  Sign In
                </Button>
              </form>

              <p className="mt-6 pt-5 border-t border-[#E2E8E5] dark:border-[#35413F] text-xs text-[#66736D] dark:text-[#A8B4B0] leading-relaxed">
                Trouble signing in? Contact your ZELORA STUDYS administrator for institutional ID recovery or account activation.
              </p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

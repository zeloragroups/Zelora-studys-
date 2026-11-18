import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { ROUTES, type AppRoutePath } from '../../router/routes';
import type { PortalScope } from '../../types';
import { LoginShell } from '../../components/auth/LoginShell';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface ForgotPasswordPageProps {
  portalScope: PortalScope;
  onNavigate: (to: AppRoutePath) => void;
}

export function ForgotPasswordPage({ portalScope, onNavigate }: ForgotPasswordPageProps) {
  const { branding, publicSettings } = useInterface();
  const { requestForgotPassword } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idError, setIdError] = useState<string | undefined>();
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  const isAdminPortal = portalScope === 'admin_portal';
  const backRoute = isAdminPortal ? ROUTES.ADMIN_LOGIN : ROUTES.PORTAL_LOGIN;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIdError(undefined);
    setConfirmationMessage(null);

    if (!loginId.trim()) {
      setIdError('Please enter your Account ID.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestForgotPassword({
        loginId: loginId.trim(),
        portalScope,
      });
      setConfirmationMessage(result.message);
    } catch (err) {
      if (err instanceof AuthServiceException) {
        setIdError(err.message);
      } else {
        setIdError('Unable to submit request right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LoginShell
      branding={branding}
      logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
      portalLabel={isAdminPortal ? 'Admin Portal' : 'Teacher & Student Portal'}
      heading="Password Recovery"
      subtitle={
        isAdminPortal
          ? 'Administrator accounts require authorized owner recovery once Firebase Authentication is connected.'
          : 'Password resets are processed securely through your authorized centre administrator. No unverified SMS, email, or WhatsApp reset links are sent.'
      }
      onNavigateHome={() => onNavigate(ROUTES.HOME)}
      footerLink={
        <button
          type="button"
          onClick={() => onNavigate(backRoute)}
          className="inline-flex items-center gap-1.5 font-medium text-[#7552D9] dark:text-[#A78BFA] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Sign In</span>
        </button>
      }
    >
      {confirmationMessage ? (
        <div className="space-y-4">
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/40 bg-[#168A62]/10 dark:bg-[#22C58B]/12 p-4 text-sm text-[#168A62] dark:text-[#22C58B]"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-relaxed">{confirmationMessage}</p>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => onNavigate(backRoute)}
          >
            Return to Sign In
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label={isAdminPortal ? 'Admin ID' : 'Teacher ID or Student ID'}
            name="loginId"
            type="text"
            autoCapitalize="characters"
            spellCheck={false}
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value);
              setIdError(undefined);
            }}
            placeholder={isAdminPortal ? 'ADM-0001' : 'TCH-0001 or STU-0001'}
            className="font-mono"
            error={idError}
          />

          <Button type="submit" loading={submitting} className="w-full">
            Submit Recovery Guidance Request
          </Button>
        </form>
      )}
    </LoginShell>
  );
}

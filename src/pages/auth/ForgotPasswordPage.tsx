import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth, AuthServiceException } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { ROUTES, type AppRoutePath } from '../../router/routes';
import { LoginShell } from '../../components/auth/LoginShell';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface ForgotPasswordPageProps {
  onNavigate: (to: AppRoutePath) => void;
}

export function ForgotPasswordPage({ onNavigate }: ForgotPasswordPageProps) {
  const { branding, publicSettings } = useInterface();
  const { requestForgotPassword } = useAuth();

  const [loginId, setLoginId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [idError, setIdError] = useState<string | undefined>();
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

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
        portalScope: 'member_portal',
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
      portalLabel="Teacher & Student Portal"
      heading="Password Recovery"
      subtitle="Password resets are processed securely through your authorized centre administrator. No unverified SMS, email, or WhatsApp reset links are sent."
      onNavigateHome={() => onNavigate(ROUTES.HOME)}
      footerLink={
        <button
          type="button"
          onClick={() => onNavigate(ROUTES.PORTAL_LOGIN)}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Sign In</span>
        </button>
      }
    >
      {confirmationMessage ? (
        <div className="space-y-4">
          <Alert tone="success">{confirmationMessage}</Alert>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => onNavigate(ROUTES.PORTAL_LOGIN)}
          >
            Return to Sign In
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Teacher ID or Student ID"
            name="loginId"
            type="text"
            autoCapitalize="characters"
            spellCheck={false}
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value);
              setIdError(undefined);
            }}
            placeholder="TCH-0001 or STU-0001"
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

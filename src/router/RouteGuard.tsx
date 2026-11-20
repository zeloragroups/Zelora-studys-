import { useEffect, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { LoadingSpinner } from '../components/feedback/LoadingSpinner';
import {
  getDefaultRouteForRole,
  getLoginRouteForPath,
  type AppRoutePath,
} from './routes';

interface RouteGuardProps {
  currentPath: string;
  requiresAuth: boolean;
  allowedRoles?: readonly UserRole[];
  onNavigate: (to: AppRoutePath) => void;
  children: ReactNode;
}

/**
 * Reusable Role-Based Route Guard.
 * - Blocks unauthenticated access to protected routes and redirects to appropriate login.
 * - Blocks cross-role access with explicit denial screen.
 * - Complements Firestore Security Rules without replacing backend enforcement.
 */
export function RouteGuard({
  currentPath,
  requiresAuth,
  allowedRoles,
  onNavigate,
  children,
}: RouteGuardProps) {
  const {
    isAuthenticated,
    isRestoring,
    principal,
    validateActiveSession,
    setAuthNotice,
  } = useAuth();

  useEffect(() => {
    if (isRestoring) {
      return;
    }

    if (requiresAuth && !isAuthenticated) {
      setAuthNotice('Please sign in to access this workspace.');
      onNavigate(getLoginRouteForPath(currentPath));
      return;
    }

    if (requiresAuth && isAuthenticated) {
      void validateActiveSession().then((stillValid) => {
        if (!stillValid) {
          onNavigate(getLoginRouteForPath(currentPath));
        }
      });
    }
  }, [
    currentPath,
    isAuthenticated,
    isRestoring,
    onNavigate,
    requiresAuth,
    setAuthNotice,
    validateActiveSession,
  ]);

  if (isRestoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9F8] dark:bg-[#151A1E] p-6">
        <LoadingSpinner size="md" label="Checking session..." />
      </div>
    );
  }

  if (requiresAuth && (!isAuthenticated || !principal)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9F8] dark:bg-[#151A1E] p-6">
        <LoadingSpinner size="sm" label="Redirecting to sign in..." />
      </div>
    );
  }

  if (
    requiresAuth &&
    principal &&
    allowedRoles &&
    !allowedRoles.includes(principal.role)
  ) {
    const authorizedHome = getDefaultRouteForRole(principal.role);

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9F8] dark:bg-[#151A1E] p-4 sm:p-6">
        <div className="w-full max-w-md">
          <Card
            title="Access Restricted"
            subtitle="Your account role does not permit viewing this route."
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-sm text-[#68737C] dark:text-[#AAB6B4]">
                <ShieldAlert
                  className="w-5 h-5 text-[#D64C55] dark:text-[#EF6D75] shrink-0 mt-0.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p>
                  Signed in as{' '}
                  <span className="font-mono font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    {principal.loginId}
                  </span>{' '}
                  ({principal.role}). Access to{' '}
                  <span className="font-mono text-xs">{currentPath}</span> is blocked.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap gap-3">
                <Button onClick={() => onNavigate(authorizedHome)}>
                  Go to My Dashboard
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

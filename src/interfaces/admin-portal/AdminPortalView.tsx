import { useAuth } from '../../context/AuthContext';
import { ROUTES, type AppRoutePath } from '../../router/routes';
import { AdminWebAppShell } from '../admin-webapp/AdminWebAppShell';

interface AdminPortalViewProps {
  currentPath: string;
  onNavigate: (to: AppRoutePath) => void;
}

/**
 * Web Application 1 — Unified Admin Portal.
 * Renders solely the responsive Admin Web App experience across desktop, laptop, tablet, and mobile.
 */
export function AdminPortalView({ onNavigate }: AdminPortalViewProps) {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    onNavigate(ROUTES.ADMIN_LOGIN);
  };

  return <AdminWebAppShell onSignOut={handleSignOut} />;
}

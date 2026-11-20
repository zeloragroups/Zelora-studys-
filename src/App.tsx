import { useCallback, useEffect, useState } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { InterfaceProvider, useInterface } from './context/InterfaceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/feedback/ErrorBoundary';
import { FirebaseConfigErrorScreen } from './components/feedback/FirebaseConfigErrorScreen';
import { StartupSplash } from './components/feedback/StartupSplash';
import { validateAndResolveFirebaseConfig } from './lib/firebase/config';
import { runStartupFirestoreConnectionCheck } from './lib/firebase/firestore';
import { AdminLoginPage } from './pages/auth/AdminLoginPage';
import { PortalLoginPage } from './pages/auth/PortalLoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { AdminPortalView } from './interfaces/admin-portal/AdminPortalView';
import { TeacherWebAppShell } from './interfaces/teacher-webapp/TeacherWebAppShell';
import { StudentWebAppShell } from './interfaces/student-webapp/StudentWebAppShell';
import { RouteGuard } from './router/RouteGuard';
import {
  findRoutePolicy,
  normalizePath,
  ROUTES,
  type AppRoutePath,
} from './router/routes';

function AppRouter() {
  const { branding, publicSettings } = useInterface();
  const { signOut, isRestoring, principal, setAuthNotice } = useAuth();
  const { setUserThemeScope } = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? normalizePath(window.location.pathname) : ROUTES.HOME
  );

  useEffect(() => {
    setUserThemeScope(principal?.uid ?? null);
  }, [principal?.uid, setUserThemeScope]);

  const navigate = useCallback((to: AppRoutePath) => {
    const next = normalizePath(to);
    if (typeof window !== 'undefined' && normalizePath(window.location.pathname) !== next) {
      window.history.pushState({}, '', next);
    }
    setCurrentPath(next);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handlePortalSignOut = async () => {
    await signOut();
    navigate(ROUTES.PORTAL_LOGIN);
  };

  const policy = findRoutePolicy(currentPath);

  const renderRouteContent = () => {
    if (!policy) {
      return <PortalLoginPage onNavigate={navigate} />;
    }

    switch (policy.path) {
      case ROUTES.HOME:
      case '/login':
      case ROUTES.PORTAL_LOGIN:
        return <PortalLoginPage onNavigate={navigate} />;
      case ROUTES.ADMIN_LOGIN:
      case '/admin/login':
        return <AdminLoginPage onNavigate={navigate} />;
      case ROUTES.PORTAL_FORGOT_PASSWORD:
        return <ForgotPasswordPage onNavigate={navigate} />;
      case '/admin':
      case ROUTES.ADMIN_DASHBOARD:
      case ROUTES.ADMIN_WEBSITE:
      case ROUTES.ADMIN_APP:
        return (
          <RouteGuard
            currentPath={policy.path}
            requiresAuth={policy.requiresAuth}
            allowedRoles={policy.allowedRoles}
            onNavigate={navigate}
          >
            <AdminPortalView currentPath={policy.path} onNavigate={navigate} />
          </RouteGuard>
        );
      case ROUTES.PORTAL_TEACHER:
        return (
          <RouteGuard
            currentPath={policy.path}
            requiresAuth={policy.requiresAuth}
            allowedRoles={policy.allowedRoles}
            onNavigate={navigate}
          >
            <TeacherWebAppShell onSignOut={handlePortalSignOut} />
          </RouteGuard>
        );
      case ROUTES.PORTAL_STUDENT:
        return (
          <RouteGuard
            currentPath={policy.path}
            requiresAuth={policy.requiresAuth}
            allowedRoles={policy.allowedRoles}
            onNavigate={navigate}
          >
            <StudentWebAppShell onSignOut={handlePortalSignOut} />
          </RouteGuard>
        );
      default:
        return <PortalLoginPage onNavigate={navigate} />;
    }
  };

  return (
    <div key={retryKey}>
      {!splashDone && (
        <StartupSplash
          branding={branding}
          logoConfiguration={publicSettings.applicationBranding.logoConfiguration}
          isReady={!isRestoring}
          onRetry={() => {
            setAuthNotice(null);
            setRetryKey((prev) => prev + 1);
          }}
          onComplete={() => setSplashDone(true)}
        />
      )}
      {renderRouteContent()}
    </div>
  );
}

export default function App() {
  const validation = validateAndResolveFirebaseConfig();

  useEffect(() => {
    if (validation.mode === 'FIREBASE_CONNECTED') {
      runStartupFirestoreConnectionCheck();
    }
  }, [validation.mode]);

  if (validation.mode === 'FIREBASE_CONFIGURATION_ERROR') {
    return (
      <ThemeProvider>
        <FirebaseConfigErrorScreen errors={validation.errors} />
      </ThemeProvider>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <InterfaceProvider>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </InterfaceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

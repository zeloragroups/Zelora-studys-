import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { validateAndResolveFirebaseConfig } from './config';

let cachedApp: FirebaseApp | null = null;
let initErrorMessage: string | null = null;

/**
 * Singleton Firebase App initializer.
 * - Initializes Firebase at most once.
 * - Never initializes Analytics automatically.
 * - Isolates errors so misconfiguration displays safe UI guidance instead of crashing React.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) {
    return cachedApp;
  }

  const validation = validateAndResolveFirebaseConfig();
  if (!validation.valid || validation.mode !== 'FIREBASE_CONNECTED' || !validation.config) {
    initErrorMessage =
      validation.errors.join(' ') ||
      (validation.mode === 'LOCAL_DEMO'
        ? 'Local Demo Adapter active.'
        : 'Firebase configuration is invalid or incomplete.');
    return null;
  }

  try {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(validation.config);
    initErrorMessage = null;
    return cachedApp;
  } catch (err) {
    initErrorMessage =
      err instanceof Error
        ? err.message
        : 'Failed to initialize Firebase application SDK.';
    return null;
  }
}

export function getFirebaseAppInitError(): string | null {
  return initErrorMessage;
}

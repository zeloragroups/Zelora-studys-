import appletConfig from '../../../firebase-applet-config.json';

export const EXPECTED_FIREBASE_PROJECT_ID = 'academy-0007';
export const INTERNAL_AUTH_EMAIL_DOMAIN = 'auth.academy-0007.internal';

export type FirebaseRuntimeMode =
  | 'LOCAL_DEMO'
  | 'FIREBASE_CONNECTED'
  | 'FIREBASE_CONFIGURATION_ERROR';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  measurementId?: string;
}

export interface FirebaseConfigValidationResult {
  valid: boolean;
  mode: FirebaseRuntimeMode;
  config: FirebaseClientConfig | null;
  errors: string[];
  functionsEnabled: boolean;
  storageConfigured: boolean;
}

function readEnv(key: string): string {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const value = (env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolves explicit runtime data mode.
 * - Production builds MUST NEVER silently fall back to local demo data.
 * - Explicit LOCAL_DEMO is active ONLY when VITE_APP_DATA_MODE=local_demo (or under Node unit-test runners when not forced).
 */
export function isExplicitLocalDemoRequested(): boolean {
  const explicitMode = readEnv('VITE_APP_DATA_MODE').toLowerCase();
  if (explicitMode === 'local_demo') {
    return !Boolean((import.meta.env as Record<string, unknown>)?.PROD);
  }
  if (explicitMode === 'firebase') {
    return false;
  }
  return false;
}

export function isCloudFunctionsEnabled(): boolean {
  return readEnv('VITE_FIREBASE_FUNCTIONS_ENABLED').toLowerCase() === 'true';
}

export function validateAndResolveFirebaseConfig(): FirebaseConfigValidationResult {
  if (isExplicitLocalDemoRequested()) {
    return {
      valid: true,
      mode: 'LOCAL_DEMO',
      config: null,
      errors: [],
      functionsEnabled: false,
      storageConfigured: false,
    };
  }

  const candidate: FirebaseClientConfig = {
    apiKey: readEnv('VITE_FIREBASE_API_KEY') || appletConfig.apiKey || '',
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || appletConfig.authDomain || '',
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || appletConfig.projectId || '',
    storageBucket:
      readEnv('VITE_FIREBASE_STORAGE_BUCKET') || appletConfig.storageBucket || '',
    messagingSenderId:
      readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
      appletConfig.messagingSenderId ||
      '',
    appId: readEnv('VITE_FIREBASE_APP_ID') || appletConfig.appId || '',
    firestoreDatabaseId:
      readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
      appletConfig.firestoreDatabaseId ||
      '(default)',
    measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID') || undefined,
  };

  const errors: string[] = [];
  if (!candidate.apiKey) errors.push('Missing Firebase apiKey.');
  if (!candidate.authDomain) errors.push('Missing Firebase authDomain.');
  if (!candidate.projectId) errors.push('Missing Firebase projectId.');
  if (candidate.projectId && candidate.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    errors.push(
      `Firebase project mismatch: expected "${EXPECTED_FIREBASE_PROJECT_ID}", received "${candidate.projectId}".`
    );
  }
  if (!candidate.appId) errors.push('Missing Firebase appId.');
  if (!candidate.messagingSenderId) errors.push('Missing Firebase messagingSenderId.');
  if (!candidate.storageBucket) errors.push('Missing Firebase storageBucket.');

  if (errors.length > 0) {
    return {
      valid: false,
      mode: 'FIREBASE_CONFIGURATION_ERROR',
      config: null,
      errors,
      functionsEnabled: false,
      storageConfigured: false,
    };
  }

  return {
    valid: true,
    mode: 'FIREBASE_CONNECTED',
    config: candidate,
    errors: [],
    functionsEnabled: isCloudFunctionsEnabled(),
    storageConfigured: Boolean(candidate.storageBucket),
  };
}

export function getFirebaseRuntimeMode(): FirebaseRuntimeMode {
  return validateAndResolveFirebaseConfig().mode;
}

/**
 * Deterministic internal Firebase Auth email derived strictly from institutional login ID
 * (ADM-xxxx, TCH-xxxx, STU-xxxx) so users continue signing in with ID + password only.
 */
export function deriveInternalAuthEmail(loginId: string): string {
  const normalized = loginId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${normalized}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

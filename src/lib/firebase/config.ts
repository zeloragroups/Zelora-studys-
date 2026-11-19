import appletConfig from '../../../firebase-applet-config.json';

export const EXPECTED_FIREBASE_PROJECT_ID = 'academy-0007';
export const EXPECTED_FIRESTORE_DATABASE_ID =
  'ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470';
export const INTERNAL_AUTH_EMAIL_DOMAIN = 'auth.academy-0007.internal';

/**
 * Authoritative Firebase Web App configuration supplied by project owner (academy-0007).
 * Preserves the provisioned named Firestore database and prevents truncated/incorrect
 * environment variables from breaking Firebase Authentication or Firestore connectivity.
 */
export const AUTHORITATIVE_FIREBASE_CONFIG: FirebaseClientConfig = {
  apiKey:
    typeof appletConfig.apiKey === 'string' && /^AIza[0-9A-Za-z_-]{35}$/.test(appletConfig.apiKey)
      ? appletConfig.apiKey
      : 'AIzaSyAAt6XAwe3W3FPPe19h3ECuJNW2-A4uPxM',
  authDomain: appletConfig.authDomain || 'academy-0007.firebaseapp.com',
  projectId: appletConfig.projectId || EXPECTED_FIREBASE_PROJECT_ID,
  storageBucket: appletConfig.storageBucket || 'academy-0007.firebasestorage.app',
  messagingSenderId: appletConfig.messagingSenderId || '123258533376',
  appId: '1:123258533376:web:7995a1487a239015b44ae5',
  firestoreDatabaseId: appletConfig.firestoreDatabaseId || EXPECTED_FIRESTORE_DATABASE_ID,
  measurementId: appletConfig.measurementId || 'G-4P37NTXP0R',
};

const VALID_FIREBASE_API_KEY_REGEX = /^AIza[0-9A-Za-z_-]{35}$/;
const VALID_FIREBASE_APP_ID_REGEX = /^1:123258533376:web:[a-f0-9]+$/i;

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
  warnings: string[];
  functionsEnabled: boolean;
  storageConfigured: boolean;
}

function readEnv(key: string, envOverride?: Record<string, unknown>): string {
  const env =
    envOverride ?? ((typeof import.meta !== 'undefined' && import.meta.env) || {});
  const value = (env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolves explicit runtime data mode.
 * - Production builds MUST NEVER silently fall back to local demo data.
 * - Explicit LOCAL_DEMO is active ONLY when VITE_APP_DATA_MODE=local_demo in non-PROD builds.
 */
export function isExplicitLocalDemoRequested(envOverride?: Record<string, unknown>): boolean {
  const explicitMode = readEnv('VITE_APP_DATA_MODE', envOverride).toLowerCase();
  if (explicitMode === 'local_demo') {
    const isProd = envOverride
      ? Boolean(envOverride.PROD)
      : Boolean((import.meta.env as Record<string, unknown>)?.PROD);
    return !isProd;
  }
  if (explicitMode === 'firebase') {
    return false;
  }
  return false;
}

export function isCloudFunctionsEnabled(envOverride?: Record<string, unknown>): boolean {
  return readEnv('VITE_FIREBASE_FUNCTIONS_ENABLED', envOverride).toLowerCase() === 'true';
}

export function validateAndResolveFirebaseConfig(
  envOverride?: Record<string, unknown>
): FirebaseConfigValidationResult {
  if (isExplicitLocalDemoRequested(envOverride)) {
    return {
      valid: true,
      mode: 'LOCAL_DEMO',
      config: null,
      errors: [],
      warnings: [],
      functionsEnabled: false,
      storageConfigured: false,
    };
  }

  const warnings: string[] = [];

  const envApiKey = readEnv('VITE_FIREBASE_API_KEY', envOverride);
  let resolvedApiKey = AUTHORITATIVE_FIREBASE_CONFIG.apiKey;
  if (envApiKey) {
    if (VALID_FIREBASE_API_KEY_REGEX.test(envApiKey)) {
      resolvedApiKey = envApiKey;
    } else {
      warnings.push(
        'Ignored malformed/truncated VITE_FIREBASE_API_KEY environment override; using authoritative academy-0007 Web API key.'
      );
    }
  }

  const envDbId = readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID', envOverride);
  let resolvedDatabaseId = AUTHORITATIVE_FIREBASE_CONFIG.firestoreDatabaseId;
  if (envDbId) {
    if (envDbId === EXPECTED_FIRESTORE_DATABASE_ID) {
      resolvedDatabaseId = envDbId;
    } else {
      warnings.push(
        `Ignored non-matching VITE_FIREBASE_FIRESTORE_DATABASE_ID="${envDbId}"; preserving provisioned database "${EXPECTED_FIRESTORE_DATABASE_ID}".`
      );
    }
  }

  const envAppId = readEnv('VITE_FIREBASE_APP_ID', envOverride);
  const resolvedAppId =
    envAppId && VALID_FIREBASE_APP_ID_REGEX.test(envAppId)
      ? envAppId
      : AUTHORITATIVE_FIREBASE_CONFIG.appId;

  const envAuthDomain = readEnv('VITE_FIREBASE_AUTH_DOMAIN', envOverride);
  const resolvedAuthDomain =
    envAuthDomain &&
    (envAuthDomain === `${EXPECTED_FIREBASE_PROJECT_ID}.firebaseapp.com` ||
      envAuthDomain === `${EXPECTED_FIREBASE_PROJECT_ID}.web.app`)
      ? envAuthDomain
      : AUTHORITATIVE_FIREBASE_CONFIG.authDomain;

  const envProjectId = readEnv('VITE_FIREBASE_PROJECT_ID', envOverride);
  const resolvedProjectId = envProjectId || AUTHORITATIVE_FIREBASE_CONFIG.projectId;

  const candidate: FirebaseClientConfig = {
    apiKey: resolvedApiKey,
    authDomain: resolvedAuthDomain,
    projectId: resolvedProjectId,
    storageBucket:
      readEnv('VITE_FIREBASE_STORAGE_BUCKET', envOverride) ||
      AUTHORITATIVE_FIREBASE_CONFIG.storageBucket,
    messagingSenderId:
      readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', envOverride) ||
      AUTHORITATIVE_FIREBASE_CONFIG.messagingSenderId,
    appId: resolvedAppId,
    firestoreDatabaseId: resolvedDatabaseId,
    measurementId:
      readEnv('VITE_FIREBASE_MEASUREMENT_ID', envOverride) ||
      AUTHORITATIVE_FIREBASE_CONFIG.measurementId,
  };

  const errors: string[] = [];
  if (!candidate.apiKey || !VALID_FIREBASE_API_KEY_REGEX.test(candidate.apiKey)) {
    errors.push('Invalid or missing Firebase apiKey.');
  }
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
  if (!candidate.firestoreDatabaseId) {
    errors.push('Missing Firestore database ID.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      mode: 'FIREBASE_CONFIGURATION_ERROR',
      config: null,
      errors,
      warnings,
      functionsEnabled: false,
      storageConfigured: false,
    };
  }

  return {
    valid: true,
    mode: 'FIREBASE_CONNECTED',
    config: candidate,
    errors: [],
    warnings,
    functionsEnabled: isCloudFunctionsEnabled(envOverride),
    storageConfigured: Boolean(candidate.storageBucket),
  };
}

export function getFirebaseRuntimeMode(): FirebaseRuntimeMode {
  return validateAndResolveFirebaseConfig().mode;
}

/**
 * Deterministic internal Firebase Auth email derived strictly from institutional login ID
 * (TCH-xxxx, STU-xxxx) so Teachers & Students sign in with ID + password only.
 */
export function deriveInternalAuthEmail(loginId: string): string {
  const normalized = loginId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${normalized}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

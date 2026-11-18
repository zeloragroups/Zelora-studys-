/**
 * Firebase Configuration Template (DISCONNECTED BY DESIGN — PHASE 1)
 *
 * CRITICAL RESTRICTIONS:
 * - No Firebase project is created or connected automatically.
 * - Do not place real credentials, API keys, or secrets in frontend source files.
 * - Connection occurs only when the project owner manually supplies environment
 *   variables and authorizes Firebase initialization in a dedicated integration phase.
 */

export interface FirebaseConfigTemplate {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export type FirebaseConnectionStatus = 'disconnected' | 'configured_pending_init' | 'connected';

export function getFirebaseConnectionStatus(): FirebaseConnectionStatus {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return 'disconnected';
  }
  return 'configured_pending_init';
}

export function readFirebaseEnvTemplate(): Partial<FirebaseConfigTemplate> {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || undefined,
  };
}

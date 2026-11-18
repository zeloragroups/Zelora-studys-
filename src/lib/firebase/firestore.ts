import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseApp } from './app';
import { getFirebaseAuth } from './auth';
import { validateAndResolveFirebaseConfig } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let cachedDb: Firestore | null = null;

export type FirestoreConnectivityState =
  | 'uninitialized'
  | 'checking'
  | 'connected'
  | 'offline'
  | 'error';

let lastConnectivityState: FirestoreConnectivityState = 'uninitialized';
let lastConnectivityMessage = 'Not tested yet.';
let connectionTestStarted = false;

export function getFirestoreDb(): Firestore | null {
  if (cachedDb) {
    return cachedDb;
  }
  const app = getFirebaseApp();
  const validation = validateAndResolveFirebaseConfig();
  if (!app || validation.mode !== 'FIREBASE_CONNECTED' || !validation.config) {
    return null;
  }
  try {
    cachedDb = validation.config.firestoreDatabaseId
      ? getFirestore(app, validation.config.firestoreDatabaseId)
      : getFirestore(app);
    return cachedDb;
  } catch {
    return null;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{
  state: FirestoreConnectivityState;
  message: string;
}> {
  const db = getFirestoreDb();
  if (!db) {
    lastConnectivityState = 'error';
    lastConnectivityMessage = 'Firestore client is not initialized.';
    return { state: lastConnectivityState, message: lastConnectivityMessage };
  }

  lastConnectivityState = 'checking';
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    lastConnectivityState = 'connected';
    lastConnectivityMessage = 'Firestore server connection verified.';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('the client is offline')) {
      lastConnectivityState = 'offline';
      lastConnectivityMessage =
        'Firestore client appears offline or project database configuration could not be reached.';
      console.error('Please check your Firebase configuration.');
    } else if (message.toLowerCase().includes('permission')) {
      // Security rules responded from server — network connection to Firestore is live
      lastConnectivityState = 'connected';
      lastConnectivityMessage = 'Firestore server reachable (rules active).';
    } else {
      lastConnectivityState = 'error';
      lastConnectivityMessage = message;
    }
  }
  return { state: lastConnectivityState, message: lastConnectivityMessage };
}

export function getFirestoreConnectivitySnapshot(): {
  state: FirestoreConnectivityState;
  message: string;
} {
  return {
    state: lastConnectivityState,
    message: lastConnectivityMessage,
  };
}

export function runStartupFirestoreConnectionCheck(): void {
  if (connectionTestStarted || typeof window === 'undefined') {
    return;
  }
  const validation = validateAndResolveFirebaseConfig();
  if (validation.mode !== 'FIREBASE_CONNECTED') {
    return;
  }
  connectionTestStarted = true;
  void testFirestoreConnection();
}

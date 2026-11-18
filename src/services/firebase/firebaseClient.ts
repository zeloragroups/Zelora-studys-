import {
  getFirebaseRuntimeMode,
  validateAndResolveFirebaseConfig,
  type FirebaseRuntimeMode,
} from '../../lib/firebase/config';
import {
  getFirestoreConnectivitySnapshot,
  type FirestoreConnectivityState,
} from '../../lib/firebase/firestore';

export type FirebaseClientStatus =
  | 'connected'
  | 'disconnected'
  | 'configuration_error';

export interface FirebaseClientDescriptor {
  runtimeMode: FirebaseRuntimeMode;
  status: FirebaseClientStatus;
  projectId: string | null;
  firestoreDatabaseId: string | null;
  storageBucket: string | null;
  functionsEnabled: boolean;
  firestoreState: FirestoreConnectivityState;
  servicesActive: readonly string[];
  isInitialized: boolean;
  message: string;
  errors: string[];
}

export function getFirebaseClientDescriptor(): FirebaseClientDescriptor {
  const validation = validateAndResolveFirebaseConfig();
  const runtimeMode: FirebaseRuntimeMode = getFirebaseRuntimeMode();
  const firestoreSnapshot = getFirestoreConnectivitySnapshot();

  if (validation.mode === 'LOCAL_DEMO') {
    return {
      runtimeMode: 'LOCAL_DEMO',
      status: 'disconnected',
      projectId: null,
      firestoreDatabaseId: null,
      storageBucket: null,
      functionsEnabled: false,
      firestoreState: 'uninitialized',
      servicesActive: ['Local Browser Development Adapters (Explicit LOCAL_DEMO Mode)'],
      isInitialized: false,
      message:
        'Explicit LOCAL_DEMO mode is active (VITE_APP_DATA_MODE=local_demo). Firebase SDK is intentionally disconnected.',
      errors: [],
    };
  }

  if (validation.mode === 'FIREBASE_CONFIGURATION_ERROR' || !validation.config) {
    return {
      runtimeMode: 'FIREBASE_CONFIGURATION_ERROR',
      status: 'configuration_error',
      projectId: null,
      firestoreDatabaseId: null,
      storageBucket: null,
      functionsEnabled: false,
      firestoreState: 'error',
      servicesActive: [],
      isInitialized: false,
      message:
        'Firebase configuration validation failed. Silent fallback to local demo data is disabled.',
      errors: validation.errors,
    };
  }

  return {
    runtimeMode: 'FIREBASE_CONNECTED',
    status: 'connected',
    projectId: validation.config.projectId,
    firestoreDatabaseId: validation.config.firestoreDatabaseId,
    storageBucket: validation.config.storageBucket,
    functionsEnabled: validation.functionsEnabled,
    firestoreState: firestoreSnapshot.state,
    servicesActive: [
      'Firebase Authentication',
      `Cloud Firestore (${validation.config.firestoreDatabaseId})`,
      `Firebase Storage (${validation.config.storageBucket})`,
      validation.functionsEnabled
        ? 'Cloud Functions (Enabled)'
        : 'Cloud Functions (Callable Disabled — Client Transaction Fallback)',
    ],
    isInitialized: true,
    message: `Connected to Firebase project "${validation.config.projectId}" (${firestoreSnapshot.message}).`,
    errors: [],
  };
}

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getFirebaseAuth } from './auth';
import { validateAndResolveFirebaseConfig } from './config';

const PROVISIONING_APP_NAME = 'spark-provisioning';

export const LINKED_CONSOLE_UID_REGEX = /^[a-zA-Z0-9_-]{6,128}$/;

function getOrCreateProvisioningApp(): FirebaseApp {
  const validation = validateAndResolveFirebaseConfig();
  if (!validation.valid || validation.mode !== 'FIREBASE_CONNECTED' || !validation.config) {
    throw new Error('Firebase is not properly configured for account provisioning.');
  }

  const existing = getApps().find((app) => app.name === PROVISIONING_APP_NAME);
  if (existing) {
    return existing;
  }
  return initializeApp(validation.config, PROVISIONING_APP_NAME);
}

/**
 * Firebase Spark-compatible isolated account provisioning helper.
 *
 * Security & architecture guarantees:
 * - Uses a dedicated secondary FirebaseApp ("spark-provisioning") with
 *   `inMemoryPersistence` so the primary Admin Google session is never signed
 *   out, overwritten, or persisted to browser storage.
 * - Verifies an active primary Firebase Auth user before provisioning.
 * - Executes `onAuthCreated(uid)` on the primary Admin-authenticated Firestore
 *   session immediately after creating the Auth account; if Firestore rejects or
 *   fails, rolls back the newly created Firebase Auth user via `deleteUser`.
 * - Always signs out the secondary Auth instance in `finally`.
 *
 * Honest client-side boundary:
 * - Client-side Firebase SDK calls to `createUserWithEmailAndPassword` use the
 *   public Firebase Identity Toolkit API. Although this app only exposes account
 *   creation in the Admin interface and Firestore Security Rules deny any user
 *   without an Admin-created `users/{uid}` mapping, client-side provisioning
 *   alone cannot technically stop external HTTP callers with the public Web API
 *   key from creating unlinked Firebase Auth users. Enabling Firebase App Check
 *   or disabling "Enable create (sign-up)" in Console + using Manual Console UID
 *   linking closes that surface without Blaze Cloud Functions.
 */
export async function provisionWithSecondaryFirebaseAuth<T>(
  authEmail: string,
  password: string,
  onAuthCreated: (uid: string) => Promise<T>
): Promise<T> {
  const primaryAuth = getFirebaseAuth();
  if (!primaryAuth?.currentUser) {
    throw new Error('Primary Admin Firebase Auth session is required before provisioning.');
  }

  const secondaryApp = getOrCreateProvisioningApp();
  const secondaryAuth = getAuth(secondaryApp);
  await setPersistence(secondaryAuth, inMemoryPersistence);

  if (secondaryAuth.currentUser) {
    await firebaseSignOut(secondaryAuth).catch(() => undefined);
  }

  let createdCred: Awaited<ReturnType<typeof createUserWithEmailAndPassword>> | null = null;
  try {
    createdCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
    return await onAuthCreated(createdCred.user.uid);
  } catch (error) {
    if (createdCred?.user) {
      await deleteUser(createdCred.user).catch(() => undefined);
    }
    throw error;
  } finally {
    await firebaseSignOut(secondaryAuth).catch(() => undefined);
  }
}

import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseAuth } from '../../lib/firebase/auth';
import {
  getFirestoreDb,
  handleFirestoreError,
  OperationType,
} from '../../lib/firebase/firestore';
import type { AuthPrincipal, UserRole } from '../../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'toutionacademy@gmail.com';

let cachedAdminUids: string[] | null = null;
let cachedAtMs = 0;

export function requireFirestoreDb(): Firestore {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error(
      'Cloud Firestore is not initialized. Check your Firebase configuration and runtime mode.'
    );
  }
  return db;
}

export function requireVerifiedActor(
  actor: AuthPrincipal | null,
  allowedRoles: UserRole[]
): AuthPrincipal {
  if (!actor) {
    throw new Error('Authentication is required.');
  }
  if (actor.status !== 'active') {
    throw new Error('Active account status is required.');
  }
  if (!allowedRoles.includes(actor.role)) {
    throw new Error(`Access denied for role "${actor.role}".`);
  }
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) {
    throw new Error('Firebase Authentication session is not active.');
  }
  return actor;
}

export async function getActiveAdminUids(db: Firestore): Promise<string[]> {
  const now = Date.now();
  if (cachedAdminUids && now - cachedAtMs < 30_000) {
    return cachedAdminUids;
  }
  const currentUid = getFirebaseAuth()?.currentUser?.uid;
  try {
    const snap = await getDocs(
      query(collection(db, 'admins'), where('status', '==', 'active'), limit(10))
    );
    const uids = snap.docs.map((d) => d.id);
    if (currentUid && !uids.includes(currentUid)) {
      uids.unshift(currentUid);
    }
    cachedAdminUids = uids.slice(0, 10);
    cachedAtMs = now;
    return cachedAdminUids.length > 0 ? cachedAdminUids : [currentUid || 'bootstrap-admin'];
  } catch {
    return currentUid ? [currentUid] : ['bootstrap-admin'];
  }
}

export function clearAdminUidsCache(): void {
  cachedAdminUids = null;
  cachedAtMs = 0;
}

export function generateSafeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export function stripUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export async function withFirestoreErrorHandling<T>(
  operationType: OperationType,
  path: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (msg.includes('permission') || msg.includes('insufficient permissions')) {
      handleFirestoreError(error, operationType, path);
    }
    throw error;
  }
}

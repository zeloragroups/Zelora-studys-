import { getAuth, type Auth } from 'firebase/auth';
import { getFirebaseApp } from './app';

let cachedAuth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) {
    return cachedAuth;
  }
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  try {
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch {
    return null;
  }
}

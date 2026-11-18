import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from './app';
import { validateAndResolveFirebaseConfig } from './config';

let cachedStorage: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage | null {
  if (cachedStorage) {
    return cachedStorage;
  }
  const app = getFirebaseApp();
  const validation = validateAndResolveFirebaseConfig();
  if (!app || !validation.storageConfigured || validation.mode !== 'FIREBASE_CONNECTED') {
    return null;
  }
  try {
    cachedStorage = getStorage(app);
    return cachedStorage;
  } catch {
    return null;
  }
}

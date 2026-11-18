import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseApp } from './app';
import { isCloudFunctionsEnabled } from './config';

let cachedFunctions: Functions | null = null;

export function getFirebaseFunctions(): Functions | null {
  if (!isCloudFunctionsEnabled()) {
    return null;
  }
  if (cachedFunctions) {
    return cachedFunctions;
  }
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  try {
    cachedFunctions = getFunctions(app);
    return cachedFunctions;
  } catch {
    return null;
  }
}

export async function invokeCloudCallable<TReq, TRes>(
  functionName: string,
  payload: TReq
): Promise<TRes> {
  const fns = getFirebaseFunctions();
  if (!fns) {
    throw new Error(
      `Cloud Function "${functionName}" is not enabled (VITE_FIREBASE_FUNCTIONS_ENABLED=false). Deploy /functions on Firebase Blaze plan and set VITE_FIREBASE_FUNCTIONS_ENABLED=true.`
    );
  }
  const callable = httpsCallable<TReq, TRes>(fns, functionName);
  const result = await callable(payload);
  return result.data;
}

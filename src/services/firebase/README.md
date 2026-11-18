# Firebase Integration Guide (Disconnected by Design — Phase 1)

This directory holds the planned Firebase backend integration layer.
Per project governance, **no Firebase project has been created, linked, or deployed**.

## Planned Services
1. **Firebase Authentication** — Custom ID-to-email mapping or custom token sign-in for Admin ID, Teacher ID, and Student ID (no public self-signup).
2. **Cloud Firestore** — Primary multi-role persistent store secured by strict role-based Firestore Security Rules.
3. **Firebase Storage (Restricted)** — Reserved solely for optional branding logo assets; strictly excluded from homework uploads.

## Manual Connection Steps (Future Integration Phase)
1. Create your Firebase project manually in the Firebase Console.
2. Enable **Authentication** (Email/Password or Custom Token flow without public signup) and **Cloud Firestore**.
3. Supply your `VITE_FIREBASE_*` environment variables locally (never commit secrets).
4. Authorize the Firebase SDK wiring phase so `FirebaseAuthService` and `FirestoreDataService` replace `localDevAdapter.ts`.

# Firebase Production Deployment & Operations Guide (`academy-0007`)

## 1. Current Provisioning & Deployment Status

| Component | Target / Location | Current Status in Workspace |
| :--- | :--- | :--- |
| **Firebase Project** | `academy-0007` | Provisioned via AI Studio (`firebase-applet-config.json`) |
| **Named Cloud Firestore DB** | `ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470` | Provisioned and bound via `getFirestore(app, firestoreDatabaseId)` |
| **Firestore Security Rules** | `/firestore.rules` | Passed `npx eslint firestore.rules` and **deployed live** to `academy-0007` |
| **Firestore Composite Indexes** | `/firestore.indexes.json` | Defined in repo; deploy via Firebase CLI |
| **Firebase Storage Rules** | `/storage.rules` | Defined in repo (`academy-0007.firebasestorage.app`); requires Storage initialization + CLI deploy |
| **Cloud Functions** | `/functions/src/index.ts` | Authored TypeScript source; requires **Blaze Plan** + CLI build/deploy (NOT deployed from sandbox) |
| **Auth Sign-In Providers** | Google + Email/Password | Google Login provisioned; Email/Password for `ADM-xxxx` / `TCH-xxxx` / `STU-xxxx` requires manual Console toggle |
| **Security Rules Emulator Tests** | `/tests/firestore.rules.test.ts` | Authored for `@firebase/rules-unit-testing`; requires local Java 17+ + Firebase CLI to run emulator |

---

## 2. Environment Variables (`.env.example`)

Public web client configuration is loaded from `/firebase-applet-config.json` and optionally overridden with `VITE_*` variables:

```env
VITE_APP_DATA_MODE="firebase"
VITE_FIREBASE_FUNCTIONS_ENABLED="false"
VITE_FIREBASE_PROJECT_ID="academy-0007"
VITE_FIREBASE_STORAGE_BUCKET="academy-0007.firebasestorage.app"
```

### Runtime Modes (`src/lib/firebase/config.ts` & `src/services/index.ts`)
1. `FIREBASE_CONNECTED` (default): Uses live Firebase Auth, Cloud Firestore (`ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470`), and Firebase Storage.
2. `LOCAL_DEMO`: Activated **only** in local development when `VITE_APP_DATA_MODE="local_demo"`. Ignored in `vite build` (`import.meta.env.PROD === true`).
3. `FIREBASE_CONFIGURATION_ERROR`: Shown explicitly via `FirebaseConfigErrorScreen` if `projectId !== "academy-0007"` or required fields are missing. **Production never falls back silently to local demo data.**

> **Security Rule**: Never place Firebase Admin SDK service-account JSON files, private keys, or `FIREBASE_TOKEN` in `.env`, `.env.example`, or any `VITE_*` variable.

---

## 3. Manual Setup Checklist (Firebase Console & CLI)

Complete these steps in order using your own authenticated Firebase Console / local terminal:

### Step 1 — Enable Email/Password Sign-In Provider (Required for ID + Password Login)
- **Firebase Console Section**: `Authentication -> Sign-in method -> Sign-in providers`
- **Exact Setting**: Enable **Email/Password** (leave "Email link (passwordless sign-in)" disabled unless desired). Confirm **Google** is enabled.
- **Why Needed**: Teachers (`TCH-xxxx`), Students (`STU-xxxx`), and ID-based Admins (`ADM-xxxx`) sign in using only their institutional ID + Password, which maps deterministically to `<normalized-id>@auth.academy-0007.internal` inside Firebase Authentication.
- **How to Verify**: Sign in as `07alphabro@gmail.com` via **"Continue with Google"** on `/admin/login`, create a test Teacher (`TCH-0001`), then log into `/portal/login` with `TCH-0001` and its initial password.

### Step 2 — Bootstrap Initial Authorized Admin (`07alphabro@gmail.com`)
- **Application / Console Section**: Open `/admin/login` and click **"Continue with Google"** using `07alphabro@gmail.com`.
- **Why Needed**: Bootstraps `/admins/{uid}`, `/users/{uid}`, and `/authIdMappings/ADM-0001` so the authorized Gmail receives active Admin authority in Firestore Rules and can create Teachers and Students. Any other Google account is denied Admin access.
- **How to Verify**: Confirm `/admin/dashboard` loads and `Admin -> Settings -> System Status` displays `FIREBASE_CONNECTED` and active project `academy-0007`.

### Step 3 — Initialize Firebase Storage & Deploy Storage Rules
- **Firebase Console Section**: `Storage -> Get Started` (select standard security location matching your Firestore region for bucket `academy-0007.firebasestorage.app`).
- **CLI Command**:
  ```bash
  firebase deploy --only storage --project academy-0007
  ```
- **Why Needed**: Enables cross-device Admin logo uploads (`branding/centre-logo/*`, PNG/JPEG/WebP up to 2 MB) enforced by `/storage.rules` so uploaded branding synchronizes across Admin, Teacher, and Student Web Apps.
- **How to Verify**: Upload a PNG/JPEG/WebP logo in `Admin -> Settings -> Application Branding`, click Apply, and open `/portal/login` from a second browser/device.

### Step 4 — Deploy Firestore Composite Indexes
- **CLI Command**:
  ```bash
  firebase deploy --only firestore:indexes --project academy-0007
  ```
- **Why Needed**: Builds composite indexes in `/firestore.indexes.json` for `enrolments`, `teacherAssignments`, `attendanceSessions`, `attendanceRecords`, `homework`, `homeworkSubmissions`, `testAttempts`, `examinationMarks`, `paymentClaims`, `notifications`, and `teacherSalaryPeriods`.
- **How to Verify**: Check `Firestore Database -> Indexes` in Firebase Console until all indexes show `Enabled`.

### Step 5 — Upgrade to Blaze Plan & Deploy Cloud Functions (Recommended for Server-Side Authority)
- **Firebase Console Section**: `Project Overview -> Spark / Upgrade Plan -> Blaze (Pay-as-you-go)`.
- **CLI Commands**:
  ```bash
  cd functions
  npm install
  npm run build
  cd ..
  firebase deploy --only functions --project academy-0007
  ```
- **Frontend Environment Toggle**: After successful deployment, set `VITE_FIREBASE_FUNCTIONS_ENABLED="true"` and redeploy the web app.
- **Why Needed**: Cloud Functions (`/functions/src/index.ts`) require Cloud Build / Artifact Registry APIs available only on the Blaze plan. Deploying them activates server-side Admin SDK user creation (`createInstitutionalAccount`), custom role claims (`setCustomUserClaims`), transactional payment claim verification + receipt numbering, and server-side salary payout recording.
- **How to Verify**: Run `firebase functions:log --project academy-0007` and create a Teacher/Student account or verify a UPI payment claim in Admin.

### Step 6 — Run Emulator Security Tests Locally (Requires Java 17+)
- **Local Prerequisites**: Node.js 22+, Java 17+ JDK, `firebase-tools`.
- **Command**:
  ```bash
  firebase emulators:exec --only firestore --project academy-0007 "npx tsx tests/firestore.rules.test.ts"
  ```
- **Why Needed**: Executes all 12 Dirty Dozen adversarial denial tests (`/security_spec.md`) against `/firestore.rules` in an isolated local emulator.

---

## 4. Safe Local-to-Firebase Data Migration Guide

1. Sign in as active Admin (`07alphabro@gmail.com`) via Google Sign-In and navigate to **Settings -> Firebase & Migration**.
2. Click **Scan & Preview Local Data**. The scanner inspects `tuition_ecosystem_dev_*` keys in browser `localStorage` and produces a non-destructive inventory:
   - **Demo Fixtures Excluded by Default**: Built-in sample entities (`ADM-0001`, `TCH-0001`, `STU-0001`, `CLS-0001`, `sharma.tuition@okicici`, `@centre-demo.example`) are flagged and excluded unless explicitly overridden.
   - **Credential Stripping**: Password, hash, salt, session token, and private key fields are stripped automatically (`stripCredentialFields`).
   - **Auth Provisioning Required**: Local Teacher/Student accounts do not hold plaintext passwords; Admins must provision real accounts in `Admin -> Accounts` before records referencing them (`enrolments`, `studentFeeAccounts`, `teacherAssignments`) can bind to live Firebase Auth UIDs.
   - **Logo Assets**: Device-local base64 logo strings are excluded from Firestore documents; re-upload logos in `Application Branding` to store in Firebase Storage.
3. Review counts (`Eligible Custom Records`, `Duplicates Already in Firestore`, `Manual Review Needed`), check the explicit confirmation box, and click **Run Controlled Migration**.
4. **Non-Destructive Guarantee**: Local browser storage keys are preserved intact during migration for safe recovery. Only click **Clear Local Cache** manually after confirming live records in Firestore.

---

## 5. Firestore Collections, Security Model & Cost Transparency

### Key Security Invariants (`/firestore.rules` & `/security_spec.md`)
- Catch-all deny rule (`allow read, write: if false`) on unlisted paths.
- Email-verified institutional identity (`request.auth.token.email_verified == true`) and active account status required across operational collections.
- Strict PII isolation on `users/{uid}` and `authIdMappings/{loginId}`.
- Students can create `paymentClaims` only with `status == 'verification_pending'` for their own `studentUid`, never mutate `studentFeeAccounts` balances, never read unreleased `examinationMarks`, and never read `objectiveTests/{id}/private/answerKey` before `manualResultsReleased == true`.
- Append-only audit collections (`accountAudit`, `attendanceAudit`, `homeworkAudit`, `marksAudit`, `paymentVerificationAudit`, `financialAudit`, `settingsAudit`) reject all client `update` and `delete` operations.

### Firebase Plan, Quotas & Cost Controls
- **Spark Plan (Free Tier)**: Supports Authentication (Email/Password + Google), Cloud Firestore free daily quotas (reads/writes/deletes per day — see https://firebase.google.com/pricing#cloud-firestore for current Spark/Enterprise edition limits), and limited Firebase Storage (where supported). **Does not support deploying Cloud Functions v2.**
- **Blaze Plan (Pay-as-you-go)**: Required for Cloud Functions deployment and usage beyond Spark free quotas. Set a Google Cloud **Billing Budget & Alert** in GCP Console before enabling Blaze.
- **Built-in Cost Drivers & Controls**:
  - Selective `onSnapshot` listeners strictly for authenticated Auth state and public `applicationSettings/APP-SETTINGS-001` (never attaching global collection-wide listeners on large tables).
  - Clean listener unsubscription on component unmount.
  - Indexed queries (`firestore.indexes.json`), integer-paise financial fields, and bounded string/array limits enforced in `firestore.rules`.
  - No base64 image blobs in Firestore documents; branding logos strictly capped at `<= 2 MB` in Cloud Storage.

---

## 6. Backup & Recovery Operations
- **Scheduled Firestore Exports** (Blaze Plan): Configure periodic `gcloud firestore export` backups targeting a dedicated GCS backup bucket for database `ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470`.
- **Financial & Receipt Recovery**: All verified payments (`verifiedPayments`), receipts (`paymentReceipts`), and audit trails (`financialAudit`, `paymentVerificationAudit`) retain immutable IDs (`RCP-YYYY-XXXX`); corrections void old receipts and issue revised records rather than overwriting history.
- **Rules & Index Versioning**: Always keep `/firestore.rules`, `/storage.rules`, `/firestore.indexes.json`, and `/firebase-blueprint.json` under Git version control and re-run `npx eslint firestore.rules` prior to any deployment.

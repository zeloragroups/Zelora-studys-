# Firestore & Storage Security Specification & Adversarial Test Plan (Spark Plan Audit)

## 1. Core Security Invariants
1. **Default Deny**: Catch-all rule `match /{document=**} { allow read, write: if false; }` in both `firestore.rules` and `storage.rules` denies every unlisted path.
2. **Strict Role & Provider Isolation**:
   - **Admin**: Requires Google Sign-In (`firebase.sign_in_provider == 'google.com'`), `email_verified == true`, authorized Gmail (`07alphabro@gmail.com`) or existing `admins/{uid}` record with `status == 'active'`. Deactivating `admins/{uid}.status = 'deactivated'` revokes Admin privileges even for `07alphabro@gmail.com`.
   - **Teacher / Student**: Authenticated via ID + Password (`@auth.academy-0007.internal` internal email domain, where `emailVerified` is intentionally `false`) and backed by an Admin-created `users/{uid}` document with `status == 'active'`. Unlinked Firebase Auth accounts with no active `users/{uid}` document are rejected on every read and write.
3. **No Self-Assigned Roles or Admin Privilege Escalation**: Users cannot create or mutate `role`, `accountId`, `status`, or `admins/{uid}` markers. Teachers and Students cannot call `users` list or `authIdMappings` read/write.
4. **Strict Record & Classroom Isolation**:
   - Students can access only their own `users/{uid}`, `studentFeeAccounts`, `preparedUpiPayments`, `paymentClaims`, `verifiedPayments`, `paymentReceipts`, `attendanceRecords`, `attendanceNotifications`, `homeworkSubmissions`, `testAttempts`, `notifications`, and released `examinationMarks`.
   - Teachers can access only assigned `enrolments` (`teacherUids`), their own `teacherSalary*` records, and sessions/assessments/homework/marks matching `teacherUid == request.auth.uid`.
   - Private subcollections: `homeworkSubmissions/{id}/private/teacherNote` is inaccessible to Students; `objectiveTests/{id}/private/answerKey` is inaccessible to Students unless `showCorrectAnswersOnRelease == true` and results are released (`manualResultsReleased == true` or `resultReleaseMode == 'auto_after_submission'`).
5. **Financial & Assessment Integrity**:
   - Students can ONLY create `paymentClaims` with `status == 'verification_pending'` for their own `feeAccountId`, `amountPaise <= remainingBalancePaise`, and zero verification fields (`verifiedBy`, `verifiedAt`).
   - Students and Teachers can NEVER update `studentFeeAccounts`, `paymentClaims.status`, `verifiedPayments`, `paymentReceipts`, or `teacherSalary*`.
   - Under `manual_teacher_release` / `scheduled_after_end`, Students cannot self-assign `marksObtained`, `percentage`, `evaluatedAt`, `resultReleasedAt`, or `status == 'evaluated'` on `testAttempts`.
6. **Notification, Settings & Audit Integrity**:
   - Strict `hasOnly(...)` field allowlists, URL/URI scheme checks (`https://`, `upi://pay?`, validated PNG/JPEG/WebP data URLs), and payload size bounds are enforced on settings, branding, UPI configs, and audit entries.
   - `notifications` creation by Teachers is restricted to student `assessment` notifications; Students may only create their own `fees_receipts` reminders/claim acknowledgements or `claim_received` alerts addressed to an active `admins/{uid}`.
   - Audit logs (`accountAudit`, `settingsAudit`, `attendanceAudit`, `homeworkAudit`, `marksAudit`, `paymentVerificationAudit`, `financialAudit`) are strictly append-only (`allow update, delete: if false;`) and Student writes to payment/financial audit logs are restricted to their own `paymentClaims` submission events.

---

## 2. Adversarial Security Attack Scenarios (20 Covered Cases — Expected: `PERMISSION_DENIED`)
1. **Unauthenticated User Reads Private Student Data**: `GET /users/stu-0001` or `GET /studentFeeAccounts/FEE-0001` with `auth == null`.
2. **Unauthenticated User Reads Teacher Data**: `GET /teacherSalaryPeriods/SPER-0002` or `GET /users/tch-0001` with `auth == null`.
3. **Unauthorized Google Account Accesses Admin**: Other verified Google account writes `/admins/{uid}` or reads `/authIdMappings/ADM-0001`.
4. **Student Accesses Another Student's Record**: Student A reads Student B's `users/{uid}`, `studentFeeAccounts`, `paymentClaims`, `paymentReceipts`, or `homeworkSubmissions`.
5. **Teacher Accesses an Unassigned Class / Enrolment**: Teacher A queries `enrolments` without `teacherUids array-contains teacherUid` or writes attendance/homework on another Teacher's records.
6. **Teacher Accesses Another Teacher's Private Records**: Teacher A reads Teacher B's `teacherSalaryPeriods` or `homeworkSubmissions/{id}/private/teacherNote`.
7. **Student Changes Their Own Role**: Student A updates `/users/{studentAUid}` `{ role: 'admin', adminUids: [...] }`.
8. **Teacher Changes Their Own Role**: Teacher A updates `/users/{teacherAUid}` `{ role: 'admin', adminUids: [...] }`.
9. **Student Modifies Their Fee Balance**: Student A updates `/studentFeeAccounts/{ownFeeAccountId}` `{ remainingBalancePaise: 0, verifiedAmountPaidPaise: 250000 }`.
10. **Student Verifies Their Own Payment**: Student A creates `/paymentClaims` with `{ status: 'verified', verifiedBy: studentUid }`, updates claim status, or creates `/paymentReceipts`.
11. **Teacher Approves a Payment Claim**: Teacher A updates `/paymentClaims/{id}` `{ status: 'verified' }` or creates `/verifiedPayments`.
12. **Unauthorized User Changes Application/Admin Settings**: Teacher A, Student A, or unauthenticated caller writes `/applicationSettings/APP-SETTINGS-001`.
13. **Unauthorized User Changes UPI Settings**: Teacher A or Student A writes `/upiConfigurations/{id}` or `/feeConfigurations/{id}`.
14. **Student Reads Examination Answer Keys**: Student A reads `/objectiveTests/{testId}/private/answerKey` before authorized release (`manualResultsReleased == false` and not `auto_after_submission`).
15. **Student Reads Private Teacher Notes**: Student A reads `/homeworkSubmissions/{subId}/private/teacherNote`.
16. **Unauthorized User Changes Audit Records**: Student/Teacher/Admin updates or deletes `/financialAudit/{id}`, `/settingsAudit/{id}`, `/attendanceAudit/{id}`, `/marksAudit/{id}`, or `/accountAudit/{id}`, or Student forges `payment_verified` audit entry.
17. **Unauthorized User Modifies Account Mappings**: Teacher A, Student A, or unlinked user creates/updates `/authIdMappings/{id}`.
18. **Deactivated Account Accesses Protected Data**: Deactivated Student/Teacher/Admin reads or writes protected collections (even with `07alphabro@gmail.com` if `admins/{uid}.status == 'deactivated'`).
19. **Unlinked Auth User / Direct Unauthorized Access**: Firebase Auth user without active `users/{uid}` profile attempts reads/writes across `classes`, `users`, `paymentClaims`, `homeworkSubmissions`, or arbitrary `notifications`.
20. **Malicious or Unexpected Input / Schema Forgery**: Student injects `marksAwarded` on `homeworkSubmissions`, injects `marksObtained`/`evaluated` on `manual_teacher_release` `testAttempts`, sends oversized document ID (`>128`), injects `javascript:` websiteUrl or malformed `upi://` URI.

---

## 3. Emulator Verification Checklist
- Run `tests/firestore.rules.test.ts` against the Firebase Firestore Emulator (`firebase emulators:exec --only firestore "npx tsx tests/firestore.rules.test.ts"`) in an environment with Java 17+ installed.
- Note: On Spark plan without Blaze Cloud Functions, `auto_after_submission` MCQ tests grade client-side with Firestore Rules enforcing `resultReleaseMode == 'auto_after_submission'` before permitting `marksObtained` writes on `testAttempts`; `manual_teacher_release` tests block student score writes strictly at the Firestore Rules layer.

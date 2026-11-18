# Firestore Security Specification & Adversarial Test Plan (Phase 10)

## 1. Core Security Invariants
1. **Default Deny**: Catch-all rule `match /{document=**} { allow read, write: if false; }` denies every unlisted path.
2. **Verified Institutional Identity**: Write operations require authenticated, email-verified principals whose account status in `users/{uid}` is `'active'` (deactivated users lose all access immediately).
3. **No Self-Assigned Roles or Admin Privilege Escalation**: Users cannot create or mutate `role`, `accountId`, `status`, or `admins/{uid}` markers.
4. **PII Isolation**: Account phone/email PII in `users/{uid}` is readable only by the owning user or verified Admin. Public login ID lookups (`authIdMappings`) are strictly closed to unauthenticated callers and non-Admin roles.
5. **Financial Integrity**:
   - Students can ONLY create `paymentClaims` with `status == 'verification_pending'` for their own `studentUid` and `studentFeeAccounts`.
   - Students and Teachers can NEVER update `verifiedAmountPaidPaise`, `remainingBalancePaise`, `paymentClaims.status`, `paymentReceipts`, or `teacherSalary*`.
   - Receipts (`paymentReceipts`) and verified financial entries are immutable to non-Admin clients; voiding/corrections follow audited Admin/backend workflows only.
6. **Academic & Assessment Integrity**:
   - Unreleased `examinationMarks` (`resultsReleased == false`) are strictly unreadable by Students.
   - Objective test `private/answerKey` documents are unreadable by Students until `manualResultsReleased == true` (or Admin/Teacher ownership).
   - Submitted `attendanceRecords` cannot be overwritten by Teachers or Students.
7. **Audit Log Immutability**: `attendanceAudit`, `marksAudit`, `financialAudit`, and `settingsAudit` cannot be updated or deleted by any client.

---

## 2. Adversarial "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Account Directory Scrape**: `GET /users` or `GET /authIdMappings/ADM-0001` with `auth == null`.
2. **Student Role Self-Escalation**: `UPDATE /users/{studentUid}` with `{ role: 'admin', adminUids: ['{studentUid}'] }`.
3. **Cross-Student Fee Account Read**: Student A calls `GET /studentFeeAccounts/{studentBFeeAccountId}`.
4. **Student Financial Balance Forgery**: Student A calls `UPDATE /studentFeeAccounts/{ownFeeAccountId}` with `{ remainingBalancePaise: 0, verifiedAmountPaidPaise: 500000 }`.
5. **Payment Claim Auto-Verify Bypass**: Student A creates `/paymentClaims/{id}` with `{ status: 'verified', verifiedBy: studentUid }`.
6. **Shadow Field Injection on Homework Submission**: Student A submits `/homeworkSubmissions/{id}` adding ghost field `{ marksAwarded: 100, status: 'reviewed' }`.
7. **Unverified Email Spoofing**: Caller token carries `email: 'toutionacademy@gmail.com'` with `email_verified: false` attempting Admin write.
8. **ID Poisoning / Denial of Wallet**: Caller sends document ID or `title` exceeding max bounds (`> 128` char ID or `1MB` string).
9. **Teacher Cross-Teacher Salary Read**: Teacher A calls `GET /teacherSalaryPeriods/{teacherBPeriodId}`.
10. **Student Answer Key Peek Before Release**: Student A calls `GET /objectiveTests/{testId}/private/answerKey` while `manualResultsReleased == false`.
11. **Student Unreleased Marks Read**: Student A queries `/examinationMarks` where `resultsReleased == false`.
12. **Client Audit History Tampering**: Teacher or Student (or Admin client) attempts `UPDATE` or `DELETE` on `/financialAudit/{id}`, `/settingsAudit/{id}`, or `/attendanceAudit/{id}`.

---

## 3. Emulator Verification Checklist
- Run `tests/firestore.rules.test.ts` against the Firebase Firestore Emulator (`firebase emulators:exec --only firestore "npx tsx tests/firestore.rules.test.ts"`) in an environment with Java 17+ installed.
- Verify all 12 Dirty Dozen payloads return `PERMISSION_DENIED` while legitimate Admin, Teacher (assigned), and Student (own) operations pass.

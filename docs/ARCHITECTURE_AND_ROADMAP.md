# Tuition Centre Management Ecosystem — Architecture & Technical Record

## Phase 1–4 Confirmed Architecture
- **Frontend Stack**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + `motion` + `lucide-react`.
- **Two Web Applications (Three Roles)**:
  1. **Admin Portal** (`/admin/login`, `/admin/forgot-password`, `/admin/dashboard`, `/admin/website`, `/admin/app`): Dedicated Admin application unifying the desktop Admin Website and responsive mobile/tablet Admin Web App inside one authenticated portal.
  2. **Teacher & Student Portal** (`/portal/login`, `/portal/forgot-password`, `/portal/teacher`, `/portal/student`): Single shared login page with **no role selector** and automatic role-based routing. Parents share their child's Student credentials.
- **Backend Readiness**: Disconnected Firebase architecture (`src/config/firebase.template.ts`, `src/services/firebase/firebaseClient.ts`). Zero Firebase projects, AI APIs, PostgreSQL, payment gateways, or WhatsApp integrations are connected.

## Phase 3 — Admin Account Management Architecture
- **Data Models (`src/types/accounts.ts`)**: `AccountRecord` (`id`, `accountId`, `role`, `name`, `phone`, `email`, `status`, optional student `classId`/`className`/`batchId`/`batchName`, `createdAt`, `updatedAt`) and `AccountAuditEntry`. Plaintext passwords and password hashes are strictly excluded from profile objects.
- **ID Generation (`src/services/accounts/idGeneratorService.ts`)**: Dedicated `AccountIdGeneratorService` maintaining separate monotonic counters for `TCH-0001` and `STU-0001` formats, preventing reuse after deactivation and validating uniqueness before creation. *Limitation*: Local counter is development-only; production distributed uniqueness must use Firestore transactions / server counters.
- **Service Layer (`src/services/contracts/accountService.ts`, `src/services/local/localAccountService.ts`)**: Enforces Admin authorization (`requireAdminActor`) at the service layer, validates fields, guards immutable fields (`accountId`, `role`, `createdAt`, `password`), manages `active` / `deactivated` status transitions, and logs `DEMO ONLY` password-reset requests.
- **UI Components (`src/components/accounts/*`)**: `AccountManagementModule`, `CreateAccountModal`, `AccountDetailsModal`, `EditAccountModal`, `AccountStatusConfirmDialog`, and `PasswordResetDemoDialog`.

## Phase 4 — Academic Management Architecture
- **Data Models (`src/types/academics.ts`)**:
  - `ClassRecord` (`CLS-0001`), `BatchRecord` (`BAT-0001` linked to `classId`), `SubjectRecord` (`SUB-0001` mapped to `classIds[]`).
  - `StudentEnrolment` (`ENR-0001` linking active `studentAccountId` -> `classId` + `batchId` with history preservation via `active`/`inactive`).
  - `TeacherAssignment` (`ASG-0001` linking active `teacherAccountId` -> `subjectId` + `classId` + `batchId`).
  - `TimetableEntry` (`TT-0001` linking `classId`, `batchId`, `subjectId`, `teacherAccountId`, `dayOfWeek`, `startTime`..`endTime` in 24h `HH:mm`, optional `room`, status `'active' | 'cancelled'`).
  - `AnnouncementRecord` (`ANN-0001` text-only, audience `'all' | 'teachers' | 'students' | 'class' | 'batch'`, status `'draft' | 'published' | 'unpublished' | 'archived'`).
- **Service Contract & Local Implementation (`src/services/contracts/academicService.ts`, `src/services/local/localAcademicStore.ts`, `src/services/local/localAcademicService.ts`)**:
  - Enforces strict service-layer RBAC (`requireAdminActor` on all writes & full directory queries; `requireTeacherActor` on `getMyTeacherWorkspace`; `requireStudentActor` on `getMyStudentWorkspace`).
  - Enforces referential integrity across classes, batches, subjects, Phase 3 student/teacher accounts, and assignments.
  - Enforces timetable validity (`endTime > startTime`) and overlap conflict prevention on both batch schedules and teacher schedules on the same `dayOfWeek` for active entries.
  - Blocks deletion of classes/batches that have dependent records (`DELETE_BLOCKED`), recommending deactivation instead.
  - Filters announcements so Teachers and Students see ONLY `published` notices matching their role, assigned class/batch (Teachers), or enrolled class/batch (Students).
- **UI Components (`src/components/academics/*`)**:
  - `AdminOverviewSection`, `AcademicManagementModule` (`ClassesSection`, `BatchesSection`, `SubjectsSection`, `EnrolmentsSection`, `AssignmentsSection`, `TimetableSection`), `AnnouncementsModule`, `TeacherAcademicWorkspace`, and `StudentAcademicWorkspace`.
- **Current Limitations & Production Blockers (Before Firebase Connection)**:
  - Academic records persist only in browser `localStorage` (`tuition_ecosystem_dev_academics_v1`) under `import.meta.env.DEV` fixtures.
  - Multi-user concurrency and transactional timetable locking require Cloud Firestore transactions + server-enforced Firestore Security Rules in Phase 10.
  - Phase 6+ modules (Homework, Online Objective Tests, Exam Questions & Marks Entry, Fees, UPI Payments, Receipts, Salaries) remain intentionally unbuilt until their respective phases.

## Phase 5 — Teacher Attendance & Student Absence Notifications Architecture
- **Data Models (`src/types/attendance.ts`)**:
  - `AttendanceSession` (`ATT-0001`): `id`, `sessionDate`, `classId`, `batchId`, `subjectId`, `teacherId`, `sessionType` (`'regular' | 'examination'`), optional `timetableEntryId`, optional `examTitle`, `status` (`'draft' | 'submitted' | 'corrected'`), `createdAt`, `submittedAt`, `updatedAt`.
  - `AttendanceRecord` (`AREC-0001`): `id`, `attendanceSessionId`, `studentId`, `status` (`'present' | 'absent' | 'late' | 'excused'`), optional `remarks`, `markedBy`, `markedAt`, `updatedAt`, optional `corrected` flag. No passwords or auth secrets are stored.
  - `AttendanceAuditEntry` (`AAUD-0001`): `id`, `attendanceSessionId`, optional `attendanceRecordId`, `action`, optional `previousValue`/`newValue`, `actorId`, `timestamp`, optional `reason`.
  - `AbsenceNotification` (`ANOT-0001`): `id`, `attendanceSessionId`, `attendanceRecordId`, `studentId`, `studentName`, `absenceDate`, `classId`/`className`, `batchId`/`batchName`, `subjectId`/`subjectName`, `attendanceType`, optional `examTitle`, `createdAt`, `readByStudent`/`readByStudentAt`, `readByAdmin`/`readByAdminAt`, `resolutionStatus` (`'active_absence' | 'corrected_not_absent'`), optional `correctionNote`.
- **Service Contract & Local Adapter (`src/services/contracts/attendanceService.ts`, `src/services/local/localAttendanceStore.ts`, `src/services/local/localAttendanceService.ts`)**:
  - Persists **DEMO DATA** locally under browser `localStorage` key `tuition_ecosystem_dev_attendance_v1` (only when `import.meta.env.DEV` fixtures are enabled; `LocalAttendanceStore` seeds historical `ATT-0001` Present & `ATT-0002` Absent for `STU-0001` with `ANOT-0001`).
  - Uses Phase 3 `AccountRecord` and Phase 4 `ClassRecord`, `BatchRecord`, `SubjectRecord`, `StudentEnrolment`, `TeacherAssignment`, and `TimetableEntry` directly without duplicating records.
  - Rejects inactive teachers, inactive students/enrolments, unrelated batches, invalid dates, cancelled timetable sessions (`CANCELLED_TIMETABLE_SESSION`), missing exam titles for exam sessions, invalid status strings, incomplete student rosters (`INCOMPLETE_ATTENDANCE`, never silently defaulting unmarked students to Absent), and duplicate submissions (`DUPLICATE_SUBMISSION`).
- **Consistent Attendance Percentage Calculation (`src/utils/attendanceCalculations.ts`)**:
  - Formula shared across Teacher, Student, and Admin views:
    `Attendance Percentage = (Present + Late) / (Present + Absent + Late) × 100` (rounded to 1 decimal place).
  - `Late` counts as attended. `Excused` sessions are excluded from the denominator.
  - If denominator `(Present + Absent + Late) === 0`, returns `percentage: null` and `displayPercentage: "Not available"` (no division by zero or invented percentage).
- **In-App Absence Notification Rules**:
  - Generated **only after successful formal submission** (never on drafts; never for Present, Late, or Excused).
  - Deduplicated per `(attendanceSessionId, attendanceRecordId, studentId)`.
  - Targeted to both the affected Student account (shared with Parents via Student credentials; no separate Parent login) and Admin notification queue.
  - On Admin correction: `Absent -> Present/Late/Excused` updates `resolutionStatus: 'corrected_not_absent'`, records `correctionNote`, and resets `readByStudent`/`readByAdmin` to `false`; `Present/Late/Excused -> Absent` creates the linked absence alert.
  - Strictly in-app only: zero SMS, WhatsApp, or email notifications are dispatched.
- **Correction & Audit Policy (with Demo Limitation)**:
  - Once submitted, attendance sessions are locked for teachers and students; submitted records cannot be silently overwritten.
  - **Demo Limitation**: Because browser client clocks in the local adapter cannot securely enforce time-windowed teacher self-edits without a trusted server clock, Phase 5 uses an **explicit Admin-mediated correction workflow** (`correctAttendanceRecord`), requiring a non-empty reason (min 5 chars, `CORRECTION_REASON_REQUIRED`), recording `previousValue -> newValue` in `AttendanceAuditEntry`, setting `corrected: true`, and syncing absence alerts.
- **Role Permissions Matrix (Service-Layer Enforced)**:
  - **Admin**: View & filter all sessions, inspect absence alerts, mark Admin read state, apply audited corrections with mandatory reason, view immutable audit history.
  - **Teacher**: View assigned classes/batches/subjects/non-cancelled timetable slots only, save drafts, submit complete regular/exam rosters for assigned cohorts only, view own submitted sessions; blocked from viewing/editing other teachers' sessions or modifying submitted attendance.
  - **Student / Parent (shared ID)**: View own personal attendance summary, history (date/subject/type filters), and own absence notifications; mark own notifications read; blocked from other students' records, batch rosters, and marking attendance.
  - **Unauthenticated / Deactivated**: Rejected (`UNAUTHORIZED`) on all methods.
- **Production Blockers (Before Production Deployment)**:
  - Connect Firebase Auth and Cloud Firestore, replacing local adapter storage with Firestore Security Rules enforcing role claims and server-side validation.
  - Enforce `request.time` / Cloud Function timestamps for any teacher editable window and atomic batch submissions + absence notification triggers.
- **Verification Coverage (`tests/phase5AttendanceVerify.ts`)**:
  - Automated checks covering regular & exam session creation, roster scoping, cancelled slot rejection, status validation, incomplete & duplicate submission blocking, shared percentage calculations (Late & Excused & 0-denominator), draft-vs-submit notification isolation, correction reason requirement, audit trail preservation, notification correction sync & read tracking, and full RBAC isolation, alongside Phase 2, 3, and 4 suites, `npm run build`, and `npx tsc --noEmit`.

## Phase 6 — Homework, Online Tests, Examinations & Marks Management Architecture
- **Data Models (`src/types/assessments.ts`)**:
  - **Homework**: `HomeworkRecord` (`HW-0001`, strictly text-only `instructions`, `status: 'draft' | 'published' | 'closed' | 'archived'`, `dueAt`, optional `maximumMarks`), `HomeworkSubmission` (`HSUB-0001`, text-only `responseText`, `revisionNumber`, `revisionHistory`, `privateTeacherNote`), `StudentSafeHomeworkSubmission` (omits `privateTeacherNote` and unreleased review fields), `HomeworkReviewAudit` (`HAUD-0001`).
  - **Online Objective Tests**: `ObjectiveTest` (`TST-0001`, MCQ-only `ObjectiveQuestion[]`, `totalMarks`, `durationMinutes`, `startsAt`, `endsAt`, `maximumAttempts`, `resultReleaseMode: 'auto_after_submission' | 'manual_teacher_release' | 'scheduled_after_end'`, `showCorrectAnswersOnRelease`), `StudentObjectiveQuestionView` (strips `correctOptionId` and `explanation` until submission + release permission), `TestAttempt` (`TATT-0001`, persisted partial `answers`, `expiresAt`, `marksObtained`, `percentage`), `StudentSafeTestAttempt`.
  - **Examinations & Marks**: `ExaminationRecord` (`EXM-0001`, `examDate`, `startsAt`, `endsAt`, `maximumMarks`, `passingMarks`, `status`, `resultsReleased`), `ExaminationMarks` (`EMRK-0001`, `marksObtained`, `percentage`, `resultStatus: 'pass' | 'fail' | 'recorded'`), `MarksAuditEntry` (`MAUD-0001`).
  - **In-App Notifications & Summaries**: `AssessmentNotification` (`ANF-0001`, deduplicated by `dedupeKey`), `SubjectPerformanceSummary` (`availability: 'no_assessment_yet' | 'assessment_pending' | 'result_not_released' | 'result_available'`), `AdminAssessmentOverviewData` (11 KPIs + filterable ledgers + audit trails).
- **Local Persistence Stores & Service Contracts (`src/services/contracts/assessmentService.ts`, `src/services/local/localAssessment*.ts`)**:
  - Persists **DEMO DATA** across three isolated `localStorage` keys strictly under `import.meta.env.DEV`:
    - `tuition_ecosystem_dev_homework_v1`
    - `tuition_ecosystem_dev_tests_v1`
    - `tuition_ecosystem_dev_examinations_v1`
  - Seeded fixtures (`HW-0001`, `TST-0001`, `EXM-0001`, `ANF-0001`) reuse Phase 3/4 accounts (`TCH-0001`, `STU-0001`) and academic scope (`CLS-0001`, `BAT-0001`, `SUB-0001`).
  - Deterministic shared scoring (`src/utils/assessmentCalculations.ts`): `Percentage = (Marks Obtained / Total Marks) × 100` (rounded to 1 decimal place). Objective-test auto-scoring executes strictly in `LocalDevTestService.submitAndEvaluateTestAttempt`.
- **Intentional Demo Limitations & Production Requirements (Documented Honestly)**:
  - **Online Test Timer & Client Storage**: The live countdown timer in `StudentTestsAndResultsModule` and attempt state in `localStorage` are client-side conveniences for local development only. Production cheating prevention requires server-side attempt deadlines (`expiresAt`), server-timestamped submissions via Cloud Functions / Firestore Security Rules, and server-side evaluation so answer keys never reach student browsers before result release.
  - **Notification Scheduling**: Phase 6 emits immediate in-app notifications (`ANF-xxxx`) on publish/review/release transitions. Background scheduled due-date reminders (e.g., 24h before deadline) require server cron / Cloud Scheduler jobs once Firebase Cloud Functions are connected; zero SMS, WhatsApp, or email gateways exist in Phase 6.
  - **Text-Only Policy**: File/PDF/image homework submissions, question-paper uploads, and study material libraries remain intentionally excluded.

## Phase 6.5 — UI/UX Transformation, Dual-Theme System, 5-Slot Navigation & Responsive Experience
- **Strict 60-30-10 Dual-Theme Design System (`src/index.css`, `index.html`, `src/context/ThemeContext.tsx`)**:
  - **Light Mode**: `#F8F9FC` primary canvas, `#F1EEFA` lavender secondary/tabs/skeletons, `#FFFFFF` cards & inputs, `#17172B` primary text, `#687086` muted text, `#7552D9` primary accent, `#A78BFA` secondary accent, `#E5E7EF` hairline borders, semantic statuses (`#168A62` success, `#B7791F` warning, `#D94C5C` error).
  - **Dark Navy Mode**: `#101426` deep navy canvas & inset inputs, `#171D34` card/nav surfaces, `#202844` elevated/selected controls & tabs, `#F8FAFC` main text, `#A6B0C3` muted text, `#8B5CF6` primary electric purple, `#A78BFA` secondary purple, `#C4B5FD` lavender highlights, `#303A55` hairline borders, semantic statuses (`#22C58B` success, `#F5B942` warning, `#F16B75` error).
  - **Anti-FOUC Initialization**: Inline synchronous `<script>` in `index.html` applies the `dark` root class before first paint from `localStorage` or `prefers-color-scheme`.
- **5-Slot Bottom Navigation with Central Elevated Home (`src/config/navigation.ts`, `src/components/layout/BottomNavBar.tsx`, `src/components/layout/ResponsiveShell.tsx`)**:
  - Fixed `< lg` bottom bar with `env(safe-area-inset-bottom)` clearance and `pb-24 lg:pb-8` main viewport spacing across all 4 shells (`Admin Website`, `Admin Web App`, `Teacher Web App`, `Student Web App`).
  - Central Home slot (index 2 of 5) sits elevated in a circular gradient (`#7552D9` -> `#8B5CF6`) action button while preserving desktop/laptop sidebar navigation and mobile drawer access to all secondary routes.
- **Responsive Mobile Card Tables, Shared Primitives & Dashboards**:
  - Upgraded `Button`, `Card`, `StatCard`, `PageHeader`, `Modal`, `Table`, `StatusText`, `ThemeToggle`, `LoginView`, `ForgotPasswordView`, `RoleProfileView`, and all feature modules across Accounts, Academics, Attendance, and Assessments.
  - Added `mobileCardRender` across management ledgers (`AccountManagementModule`, `AcademicManagementModule`, `AdminAttendanceModule`, `TeacherAttendanceModule`, `StudentAttendanceModule`, `AdminAssessmentOverviewModule`, `TeacherHomeworkModule`, `TeacherTestsExaminationsModule`, `StudentTestsAndResultsModule`), `min-h-[44px]` touch-friendly inputs/actions, segmented lavender/dark-navy sub-tabs, and `tabular-nums` typography.
- **Phase 6.5 Verification Status**:
  - Verified clean token compliance (`grep` sweep for `blue-`, legacy dark slate surfaces, and `border-l-4`), production Vite bundle (`npm run build`), TypeScript check (`npx tsc --noEmit`), and Phase 2–6 automated verification suites (`tests/phase2AuthVerify.ts` through `tests/phase6AssessmentsVerify.ts`).
  - Headless browser/screenshot checks were **not** executed because Chromium/Playwright are not installed in this workspace.

## Phase 7 — Fee Management, UPI Payment Preparation, Verification, Receipts & Teacher Salaries Architecture
- **Architecture Consolidation (Three Responsive Web Apps Only)**:
  - **Admin Web App** (`/admin/login`, `/admin/forgot-password`, `/admin/dashboard`, `/admin/app`, `/admin/website` — unified inside `AdminPortalView` -> `AdminWebAppShell`): Single responsive Admin application across mobile, tablet, laptop, and desktop. The separate Admin Website switcher has been removed.
  - **Teacher Web App** (`/portal/login`, `/portal/teacher`) and **Student Web App** (`/portal/login`, `/portal/student`, shared with Parents via Student credentials).
- **Currency Arithmetic (`src/utils/currency.ts`)**:
  - All monetary values in `FeeConfiguration`, `StudentFeeAccount`, `PreparedUpiPayment`, `PaymentClaim`, `VerifiedPayment`, `FeeReceipt`, `TeacherSalaryConfiguration`, `TeacherSalaryPeriod`, `TeacherSalaryPayment`, and reports are stored as **integer paise** (`1 INR = 100 paise`) using `rupeesToPaise` / `formatInrFromPaise` / `paiseToUpiAmountString` to prevent IEEE-754 floating-point drift.
- **Data Models (`src/types/finance.ts`) & Local Persistence (`tuition_ecosystem_dev_finance_v1`)**:
  - `FeeConfiguration` (`FCFG-0001`): Common fixed INR fee structure (`monthly` | `yearly`), effective date, due-day / yearly-due rule, reminder lead days, `active` / `inactive` history preserved without altering paid/historical accounts.
  - `UpiConfiguration` (`UPIC-0001`): Active UPI ID (`upiId`), `payeeName`, transaction note, `active` / `inactive` availability switch.
  - `StudentFeeAccount` (`FEE-0001`): Period-level student fee ledger (`unpaid`, `partially_paid`, `paid`, `overdue`, `verification_pending`), where only Admin-verified payments reduce `remainingBalancePaise`.
  - `PreparedUpiPayment` (`PREQ-0001`): Idempotent UPI payment link preparation (`upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...&tn=...`) and manual fallback reference. Preparing or launching a UPI app **never** alters verified balance or marks a fee paid.
  - `PaymentClaim` (`PCLM-0001`), `VerifiedPayment` (`VPAY-0001`), `PaymentVerificationAudit` (`PVAUD-0001`): Student-submitted claim with UTR/transaction reference and duplicate-UTR flagging (`duplicateTransactionFlag`). Admin verification requires explicit confirmation checkbox (`confirmIndependentCheck`), rejects require mandatory reason (>= 5 chars), and verified-payment corrections require mandatory reason, voiding the old receipt and issuing a revised receipt.
  - `FeeReceipt` (`REC-0001`, Receipt Number `RCP-YYYY-XXXX`): Issued exclusively for Admin-verified payments; includes centre name, student details, class/batch, period, payment date, this verified payment amount, total period fee due, cumulative verified paid, remaining balance, references, issuer, timestamp, and `issued` / `voided` status. Clean single-page printable layout via `ReceiptPreviewModal` + `@media print` (`Print / Save as PDF via Browser`).
  - `TeacherSalaryConfiguration` (`SCFG-0001`), `TeacherSalaryPeriod` (`SPER-0001`), `TeacherSalaryPayment` (`SPAY-0001`): Supports `fixed_monthly` or `per_session` models. Per-session calculation counts strictly unique `submitted` or `corrected` non-cancelled Phase 5 attendance sessions for that teacher in that `YYYY-MM` month. Unsubmitted draft sessions or zero submitted sessions trigger `requiresAdminReview: true` instead of inventing sessions. Supports `on_hold` with reason, partial/full salary payouts, overpayment blocking, and audited corrections.
  - `FinancialAuditEntry` (`FAUD-0001`) & `FinancialNotification` (`FNOT-0001`): Append-only financial audit ledger and deduplicated in-app fee due/payment notifications synced on-load.
- **Financial Role Permissions Matrix (Service-Layer Enforced)**:
  - **Admin**: Full access to fee configuration, UPI configuration, student fee account generation/filtering, manual payment claim verify/reject/audited correction, receipt issuance/viewing, teacher salary configuration/generation/hold/review/payout/correction, financial dashboard, monthly/yearly reports + CSV export, and audit trails.
  - **Teacher**: Read-only access exclusively to their own salary structure, monthly salary periods, and recorded payouts (`TeacherSalaryModule`). Blocked from student fees, payment verification, receipts, financial reports, and other teachers' salaries.
  - **Student / Parent (shared ID)**: Read-only access to own fee accounts, reminders, and own issued receipts; allowed to prepare UPI Pay Now links and submit payment claims for own active accounts only (`StudentFeesModule`). Blocked from fee config, UPI settings, Admin verification, receipts of other students, and salaries.
  - **Unauthenticated / Deactivated**: Rejected (`UNAUTHORIZED`) across all methods.
- **Known Limitations & Production Blockers (Before Firebase Connection)**:
  - Persistence uses browser `localStorage` (`tuition_ecosystem_dev_finance_v1`) seeded with clearly labelled **DEMO DATA** under `import.meta.env.DEV`.
  - No payment gateway webhooks or automatic bank statement reconciliation APIs exist; Admin manual confirmation remains mandatory.
  - Receipts render cleanly for browser `Print / Save as PDF`; server-generated PDF binaries and signed storage URLs belong in Cloud Functions / Storage once Firebase is connected.
  - Financial due reminders evaluate on-load in local mode; scheduled background reminders require Cloud Scheduler / Functions in production.
  - **Phase 8+ Scope Confirmation (Historical Note for Phase 7)**: Phase 8 was implemented in the subsequent milestone below; Phases 9–10 remain unstarted.

## Phase 8 — Complete Student Web App, Learning Experience & Workspace Integration Architecture
- **Unified Three-Web-App Experience**:
  - Preserves the single responsive **Student Web App** (`/portal/student`, reached via the shared `/portal/login` with automatic role routing and zero manual role selectors) across Android/iOS mobile browsers, tablets, laptops, and desktops.
  - **Shared Student / Parent Credentials**: Parents access their child's attendance, homework, tests, results, announcements, notifications, fees, and verified receipts using the Student ID and password. No separate Parent role or public student signup exists.
- **Navigation Map (`src/config/navigation.ts`, `src/interfaces/InterfaceScaffoldView.tsx`)**:
  - **5-Slot Mobile Bottom Bar**: `[Learning]` · `[Attendance]` · **`[Home]` (elevated centre slot)** · `[Tests]` · `[Profile]`.
  - **All 9 Student Destinations Accessible**: `dashboard` (Home), `learning` (Homework + Subjects & Timetable hub), `homework` (dedicated text-only Homework view), `academics` (Subjects & Weekly Timetable), `attendance` (Attendance %, history filters & absence alerts), `assessments` (Tests, Examinations & Results), `fees` (Fees, UPI Pay Now preparation & Verified Receipts), `notices` (Unified Notification Centre + Announcements), and `profile` (Student & Parent Read-Only Profile + Theme + Sign Out).
  - **Deep-Link Sub-Tab Routing (`handleStudentNavigate(navId, subTab)`)**: Quick Actions, Notification `Open` buttons, and Dashboard Activity `Open` actions jump directly to exact sub-tabs (`assessments:tests`, `assessments:examinations`, `assessments:results`, `notices:notifications`, `notices:announcements`, `learning:homework`, `learning:academics`).
- **Unified Portal Aggregation Service (`src/services/contracts/studentPortalService.ts`, `src/services/local/localStudentPortalService.ts`)**:
  - Reads and aggregates exclusively from existing Phase 3–7 services (`localAccountStore`, `localAcademicService`, `localAttendanceService`, `localHomeworkService`, `localTestService`, `localExaminationService`, `localAssessmentService`, `localDevFeeService`) without creating duplicate stores or conflicting sources of truth.
  - **`getMyStudentProfile`**: Returns safe student profile (`studentId`, `fullName`, `phone`, `accountStatus`, `enrolmentStatus: 'active' | 'inactive' | 'not_enrolled'`, `classId`/`className`, `batchId`/`batchName`, `enrolmentDate`, `sharedWithParent: true`, `immutableNotice`). Excludes all passwords, hashes, and auth secrets.
  - **`getMyStudentDashboard`**: Computes real-time academic pulse, upcoming/due-today/overdue homework counts, upcoming/open online tests, upcoming examinations, recently released results, current remaining fee balance & earliest unpaid due date, unread notifications & unread announcements counts, and deduplicated chronological `recentActivity` (max 10 items).
  - **`getMyStudentNotificationsAndAnnouncements` & Read/Viewed Sync**:
    - Integrates Attendance alerts (`ATT:<id>`), Homework/Test/Exam alerts (`ASM:<id>`), and Fee/Claim/Receipt alerts (`FIN:<id>`) into four clear categories (`attendance`, `homework_tests`, `exams_results`, `fees_receipts`) with `dedupeKey` uniqueness checks and bi-directional mark-read sync back to each owning service (`markStudentNotificationRead`, `markAllStudentNotificationsRead(actor, category | 'all')`).
    - Organizes published audience-filtered announcements into `All Notices`, `Latest`, `Unread`, and `Previously Viewed`, persisting per-student viewed timestamps locally under `tuition_ecosystem_dev_student_views_v1` (clearly labelled **DEMO DATA**).
- **Student Experience Refinements (Modules A–J)**:
  - **Dashboard (`StudentAcademicWorkspace.tsx`)**: Displays Student/Class/Batch/Attendance % (`N/A` when denominator is 0), Fee Balance + Next Due Date, Unread Updates, Academic Pulse, 9 Quick Actions, Upcoming Deadlines/Tests/Exams, Today's Classes, Recently Released Results, and Recent Activity without inventing missing marks, percentages, or ranks.
  - **Attendance (`StudentAttendanceModule.tsx`)**: Preserves `(Present + Late) / (Present + Absent + Late) × 100` (Excused excluded; displays `N/A` at 0 denominator), date/subject/type filters, regular & examination history, and Phase 5 absence notifications.
  - **Homework (`StudentHomeworkModule.tsx`)**: 7 filter tabs (`All`, `Upcoming`, `Due Today`, `Overdue`, `Submitted`, `Reviewed`, `Returned for Revision`), subject filter, published & reviewed timestamps, text-only submission & revision history, explicit lock/editability indicator, and strict omission of `privateTeacherNote`.
  - **Online Tests & Results (`StudentTestsAndResultsModule.tsx`)**: 7 test tabs (`All`, `Upcoming`, `Available`, `In Progress`, `Submitted`, `Results Available`, `Closed`), mandatory **Pre-Start Test Details & Instructions Modal** requiring explicit confirmation before `startOrResumeTestAttempt`, Phase 6 live test runner (question navigator, answer persistence, timer, review & final submit), 4 examination filter tabs + passing marks, honest subject performance states (`no_assessment_yet`, `assessment_pending`, `result_not_released`, `result_available`) with explicit average formula caption & latest assessment display, and Month + Year + Subject + Type filtering on the chronological results ledger.
- **Student Permission Matrix & Data Isolation (Service-Layer Enforced)**:
  - **Allowed for Active Student (shared with Parent)**: Read own profile/enrolment/timetable/subjects; read published announcements scoped to `all` / `students` / own class / own batch; read own attendance & mark own absence alerts read; read/submit/revise own text-only homework; start/save/submit allowed objective test attempts; read own released test/exam marks; read own fees, prepare UPI Pay Now links, submit payment claims, view/print own issued receipts; mark own unified notifications read & announcements viewed.
  - **Strictly Blocked / Masked**: Other students' data (profile, attendance, submissions, attempts, marks, notifications, fee accounts, claims, receipts); Admin & Teacher directories/audit logs/salaries; Admin/Teacher announcement authoring; attendance self-editing; `privateTeacherNote` fields; test `correctOptionId`/`explanation` prior to permitted release; unreleased exam marks; password hashes or secrets; Admin/Teacher/deactivated/unauthenticated calls (`UNAUTHORIZED`).
- **Known Limitations & Production Blockers (Before Production Deployment)**:
  - **Demo Storage Only**: Browser `localStorage` (`tuition_ecosystem_dev_*` keys including `tuition_ecosystem_dev_student_views_v1`) stores local **DEMO DATA** only and is **not** a secure production database or cross-device sync store.
  - **Firebase Disconnected**: Role enforcement, student isolation, attempt timing/evaluation, scheduled background due reminders, and announcement viewed states currently run in trusted local TypeScript adapters only and require Cloud Firestore Security Rules + Firebase Auth + Cloud Functions before production use.
  - **Client-Side Visual / Browser Verification**: Headless Chromium / Playwright is not installed in the current workspace container; manual responsive verification across mobile, tablet, laptop, and desktop viewports is required by the operator.
  - **Phase 10 Scope Confirmation**: Phase 9 (below) is implemented in local adapter mode; Phase 10 (Production Firebase Integration & Security Hardening) remains unstarted and excluded.

## Phase 9 — Application Branding, Admin Settings & System Configuration Architecture
- **Centralized Admin Settings Centre (`src/components/settings/AdminSettingsModule.tsx`)**:
  - Delivered inside the unified **Admin Web App** (`settings` nav item across desktop sidebar, mobile/tablet drawer, and Profile/Overview quick links) while strictly preserving the 5-slot mobile bottom navigation (`[Academics]`, `[Attendance]`, **`[Home]`**, `[Fees]`, `[Profile]`). Zero Admin settings controls exist in Teacher or Student Web Apps.
  - Organized into 7 clear, non-overwhelming sections:
    1. **Tuition Centre Profile** (`centreName`, `shortName`, `tagline`, optional validated `contactNumber`, `secondaryContactNumber`, `publicEmail`, `address`, `city`, `state`, `pinCode`, `country`, `websiteUrl`). Contact details appear on Login/Portal Selector cards, Receipts, and Financial Reports **only when populated** — zero fabricated placeholder addresses or phone numbers.
    2. **Application Branding & Live Preview** (`displayName`, `shortName`, `tagline`, `loginWelcomeHeading`, `loginDescription`, and device-local PNG/JPEG/WebP logo upload `<= 256 KB` via `<BrandLogoMark>`). Features real-time surface previews (Header/Sidebar, Portal Login Card, Receipt/Report Header), explicit `Preview Across App`, `Cancel`, confirmed `Apply`, and confirmed `Restore Defaults` without silently mutating saved state or interfering with unsaved edits.
    3. **Theme & Appearance Defaults** (`defaultTheme: 'light' | 'dark'`, `allowPersonalThemePreference`). Honors Phase 6.5 Light (`#F8F9FC`, `#F1EEFA`, `#7552D9`) & Dark Navy (`#101426`, `#171D34`, `#202844`, `#8B5CF6`) tokens cleanly. Anti-FOUC `<script>` in `index.html` and `ThemeContext` preserve personal browser overrides (`tuition_ecosystem_theme_v1`) when allowed instead of silently overwriting user preferences.
    4. **Academic Defaults & Notification Preferences**:
       - Supported `AcademicDefaults`: `academicYearDisplay`, `defaultTimetableView: 'weekly' | 'today'`, `academicTermLabel`. Propagates cleanly to Student/Teacher headers and default Student Timetable view without modifying existing timetable slots, attendance calculations, or teacher mark-release locks.
       - Supported `NotificationPreferences`: visibility toggles for `attendance`, `homeworkTests`, `examsResults`, and `feesReceipts` (with explicit confirmation when disabling categories), `defaultFilterView: 'all' | 'unread_only'`, and `showUnreadBadgesInNavigation`. Filtering executes in `LocalDevStudentPortalService` + `StudentNotificationsModule` without deleting historical attendance, homework, exam, or fee records. External channels remain explicitly marked `disabled_local_demo`.
    5. **Module Shortcuts & Live System Status**: 14 direct deep-links into existing Phase 3–8 modules/sub-tabs (`accounts`, `academics`, `academics:classes`, `academics:batches`, `academics:subjects`, `academics:enrolments`, `academics:assignments`, `academics:timetable`, `announcements`, `attendance`, `assessments`, `finance:fees`, `finance:upi`, `finance:payments`, `finance:salaries`, `finance:reports`) alongside live `AdminSystemStatusOverview` metrics.
    6. **Account, Session & Audit History**: Displays active Admin ID, role, active account status, adapter environment (`local_demo_adapter`), sign-out action, and an append-only `SettingsAuditEntry` viewer (`SAUD-0001+`) showing date, actor, category, summary, and previous/new configuration values (strictly excluding passwords, hashes, and secrets).
    7. **About Application & Environment Transparency**: Displays truthful package version (`APP_PACKAGE_VERSION = '0.0.0'`), clear `DEMO ENVIRONMENT` notices, and live `ApplicationIntegrationStatusItem[]` badges without adding unsafe global demo-data wipe buttons.
- **Data Model & Service Contract (`src/types/settings.ts`, `src/services/contracts/settingsService.ts`)**:
  - `ApplicationSettings` (`id: 'APP-SETTINGS-001'`, `schemaVersion: 1`, `environmentMode: 'local_demo_adapter'`) separates configuration metadata from module operational stores (`LocalAccountStore`, `LocalAcademicStore`, `LocalFinanceStore`), syncing `financeStore.centreName` only for newly issued receipts (`LocalDevPaymentService` + `ReceiptPreviewModal` + `AdminReportsAuditPanel`).
  - `IApplicationSettingsService` enforces `requireAdminActor` + `branding:configure` permission checks on all Admin reads (`getApplicationSettings`, `listSettingsAuditHistory`, `getApplicationIntegrationStatus`, `getSystemStatusOverview`) and all writes, while exposing safe non-secret `getPublicBrandingAndSettings()` for Splash, Portal Selector, and Login screens.
- **Settings Role Permission Matrix (Service-Layer Enforced)**:
  - **Admin (Active)**: Read/update Centre Profile, Application Branding, Appearance Defaults, Academic Defaults, In-App Notification Preferences; reset branding defaults; view append-only settings audit history, integration inventory, and live system status.
  - **Teacher (Active)**: Read-only public branding (`BrandLogoMark`, display name, theme defaults, academic year display). Blocked (`UNAUTHORIZED`) from all Admin settings reads/writes and audit logs.
  - **Student / Parent (Shared ID)**: Read-only public branding, academic defaults, and effective in-app notification visibility rules. Blocked (`UNAUTHORIZED`) from all Admin settings reads/writes and audit logs.
  - **Unauthenticated / Deactivated**: Read-only public branding only on pre-login routes; rejected (`UNAUTHORIZED`) on all protected settings service calls.
- **Local Persistence & Audit Behavior (`src/services/local/localSettingsStore.ts`, `localSettingsService.ts`)**:
  - Persisted locally in browser `localStorage` under `tuition_ecosystem_dev_app_settings_v1` with `demoDataLabel: 'DEMO DATA'`, `schemaVersion: 1`, safe field sanitization, and automatic default fallback on missing or malformed JSON without clearing unrelated storage keys.
  - Personal user theme override remains isolated under `tuition_ecosystem_theme_v1`.
  - Append-only `SettingsAuditEntry[]` records changes to centre profile, branding, reset, theme defaults, academic defaults, and notification preferences.
- **Known Limitations & Production Blockers (Before Production Deployment)**:
  - **Local Demo Configuration Only**: Settings and custom uploaded logos (base64 data URLs <= 256 KB) persist only inside browser `localStorage` on the current device and **do not** sync across devices or browsers.
  - **Non-Tamper-Proof Client Audit Logs**: Browser-stored `SettingsAuditEntry` records are convenience demo audit data only; trusted server-side audit logging and immutable Cloud Firestore rules are mandatory in production.
  - **Firebase & Storage Disconnected**: Firebase Authentication, Cloud Firestore, Cloud Functions, and Firebase Storage remain disconnected; trusted backend authorization and cross-device logo asset hosting await Phase 10.
  - **Client-Side Visual / Browser Verification**: Headless Chromium / Playwright is not installed in the current workspace container; manual responsive verification across 360px, 390px, 768px, 1280px, and 1440px viewports is required by the operator.
  - **Phase 10 Status**: Completed (see Phase 10 section below).

## Phase 10 — Firebase Production Integration, Data Migration & Security Hardening Architecture
- **Provisioned Firebase Target (`firebase-applet-config.json`, `src/lib/firebase/*`)**:
  - Bound to Firebase Project **`academy-0007`** with named Cloud Firestore database **`ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470`** and Firebase Storage bucket **`academy-0007.firebasestorage.app`**.
  - Explicit 3-state runtime resolution (`LOCAL_DEMO`, `FIREBASE_CONNECTED`, `FIREBASE_CONFIGURATION_ERROR`) via `src/services/index.ts`. Production builds (`import.meta.env.PROD`) strictly forbid silent fallback to local demo adapters, surfacing `FirebaseConfigErrorScreen` + React `ErrorBoundary` on misconfiguration or Firestore failures.
- **Authentication & Role Authorization (`src/services/firebase/firebaseAuthService.ts`, `src/pages/auth/AdminLoginPage.tsx`)**:
  - Dedicated `/admin/login` offers **Continue with Google** exclusively, strictly authorizing `07alphabro@gmail.com` (and explicitly Admin-created active `admins/{uid}` accounts) and rejecting all other Google accounts.
  - Separate `/portal/login` provides Teacher & Student ID + Password sign-in (`TCH-xxxx`, `STU-xxxx`) mapped deterministically to `@auth.academy-0007.internal` with zero role selectors and zero Admin login options.
  - Authorizes principals by verified email + active Firestore role document (or Cloud Function custom role claims when functions are deployed).
- **Complete Firebase Service Layer (`src/services/firebase/*`)**:
  - Implements every Phase 2–9 contract: `firebaseAuthService`, `firebaseAccountService`, `firebaseAcademicService`, `firebaseAttendanceService`, `firebaseAssessmentServices` (homework, private teacher notes subcollection, objective tests + private `answerKey` subcollection, examinations & marks), `firebaseStudentPortalService`, `firebaseFinanceServices` (fees, UPI link prep, payment claims, Admin verification + atomic receipt numbering, teacher salary periods & payouts, reports), `firebaseSettingsService`, `firebaseStorageService`, and `firebaseMigrationService`.
  - Selective `onSnapshot` subscriptions strictly for Auth state and `applicationSettings/APP-SETTINGS-001` branding/theme updates with clean unmount cleanup.
- **Security Rules, Cloud Functions & Storage (`/firestore.rules`, `/storage.rules`, `/functions/src/index.ts`)**:
  - `/firestore.rules` enforces default deny, PII isolation (`users`, `authIdMappings`), private subcollections (`private/teacherNote`, `private/answerKey`), unreleased marks protection, financial claim/balance integrity, immutable audit collections, and schema/bounds checks synced with `/firebase-blueprint.json`. Lint-clean (`npx eslint firestore.rules`) and deployed live to `academy-0007`.
  - `/storage.rules` restricts branding logo writes (`branding/centre-logo/*`, PNG/JPEG/WebP <= 2 MB) exclusively to active Admins against the named database.
  - `/functions/src/index.ts` provides trusted server-side Admin SDK callables (`bootstrapInitialAdmin`, `createInstitutionalAccount`, `resolveInstitutionalLogin`, `setInstitutionalAccountStatus`, `verifyStudentPaymentClaim`, `recordTeacherSalaryPayment`, `submitAttendanceSession`, `releaseAssessmentResults`) ready for Blaze-plan CLI deployment.
- **Controlled Data Migration (`src/services/firebase/firebaseMigrationService.ts`, `src/components/settings/AdminMigrationSection.tsx`)**:
  - Admin-only `Firebase & Migration` tab previews `tuition_ecosystem_dev_*` keys, separates built-in demo fixtures (excluded by default) from custom records, strips password/secret keys and oversized base64 logos, detects Firestore duplicates, flags unprovisioned accounts for manual Admin Auth creation, batches up to 400 docs/batch, and leaves local browser data untouched for safety.

## Integration Inventory
| Service / Tool | Role / Purpose | Status |
| :--- | :--- | :--- |
| React 19 | User interface components & Dual-Theme (Light + Dark Navy) three-Web-App shells | Existing |
| TypeScript | End-to-end static type safety (`tsc --noEmit` clean) | Existing |
| Vite 8 | Development & production bundler (`npm run build`) | Existing |
| Tailwind CSS v4 | Styling & Phase 6.5 responsive design tokens | Existing |
| Motion | Purposeful reduced-motion-safe UI transitions | Existing |
| Lucide React | Consistent vector iconography across Admin, Teacher & Student Web Apps | Existing |
| Firebase Authentication | Dedicated Google Sign-In (`07alphabro@gmail.com`) for Admin & ID + Password (`@auth.academy-0007.internal`) for Teachers/Students | Connected (Email/Password toggle in Console) |
| Cloud Firestore (`academy-0007`) | Persistent production database (`ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470`) + live deployed `/firestore.rules` | Connected & Rules Deployed |
| Firebase Storage | Cross-device Admin logo asset hosting (`academy-0007.firebasestorage.app`, `/storage.rules`) | Integrated (Requires Console Storage init + rules deploy) |
| Cloud Functions (`/functions`) | Trusted backend Admin SDK user management, payment verification, receipts & salary payouts | Source Complete (Requires Blaze Plan + CLI deploy) |
| Local Adapters (`tuition_ecosystem_dev_*`) | Explicit `VITE_APP_DATA_MODE=local_demo` development-only fallback & migration source | Dev-Only (Disabled in PROD) |
| UPI Deep Link URI (`upi://pay?...`) & Browser Print (`window.print()`) | Client-side UPI Pay Now link prep & single-page printable verified receipts/reports (`RCP-YYYY-XXXX`) | Preserved (Client-side) |
| Payment Gateway / Bank Verification APIs | Automated payment confirmation or bank reconciliation | Not used |
| AI APIs (Gemini / OpenAI / Others) | Any AI generation, tutoring, or assistant features | Not used |
| WhatsApp / SMS / Email Services | External notifications or messaging | Not used |
| PostgreSQL / External RDBMS | Relational SQL database backend | Not used |


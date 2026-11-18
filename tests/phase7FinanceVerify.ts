import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { LocalAttendanceStore } from '../src/services/local/localAttendanceStore';
import { LocalDevAttendanceService } from '../src/services/local/localAttendanceService';
import { LocalFinanceStore } from '../src/services/local/localFinanceStore';
import { LocalDevFeeService } from '../src/services/local/localDevFeeService';
import { LocalDevPaymentService } from '../src/services/local/localDevPaymentService';
import { LocalDevReceiptService } from '../src/services/local/localDevReceiptService';
import { LocalDevSalaryService } from '../src/services/local/localDevSalaryService';
import { LocalDevFinancialReportService } from '../src/services/local/localDevFinancialReportService';
import { FinanceServiceError } from '../src/services/contracts/financeService';
import { rupeesToPaise, formatInrFromPaise, paiseToUpiAmountString } from '../src/utils/currency';
import type { AuthPrincipal } from '../src/types';

async function expectFinanceError(
  fn: () => Promise<unknown>,
  expectedCode: string,
  messageContext: string
) {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof FinanceServiceError, `${messageContext}: expected FinanceServiceError, got ${String(caught)}`);
  assert.equal(caught.code, expectedCode, `${messageContext}: expected ${expectedCode}, got ${caught.code}`);
}

async function runPhase7Tests() {
  const accountStore = new LocalAccountStore({
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const accountService = new LocalDevAccountService(accountStore, true);
  const academicStore = new LocalAcademicStore({
    accountStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const academicService = new LocalDevAcademicService(academicStore);
  const attendanceStore = new LocalAttendanceStore({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const attendanceService = new LocalDevAttendanceService(attendanceStore);

  const financeStore = new LocalFinanceStore({
    academicStore,
    attendanceStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });

  const feeService = new LocalDevFeeService(financeStore);
  const paymentService = new LocalDevPaymentService(financeStore);
  const receiptService = new LocalDevReceiptService(financeStore);
  const salaryService = new LocalDevSalaryService(financeStore);
  const reportService = new LocalDevFinancialReportService(financeStore);

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacher1Actor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const student1Actor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;

  const deactivatedActor: AuthPrincipal = {
    ...student1Actor,
    loginId: 'STU-0099',
    status: 'deactivated',
  };

  // Provision second teacher and second/third students
  const teacher2 = await accountService.createTeacherAccount(adminActor, {
    name: 'Meera Iyer',
    phone: '+91 98220 44556',
    initialPassword: 'TeachPass@2026',
    status: 'active',
  });
  const teacher2Actor = accountStore.findAuthPrincipalByLoginId(teacher2.accountId)!;

  const student2 = await accountService.createStudentAccount(adminActor, {
    name: 'Riya Sharma',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 66778',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student2Actor = accountStore.findAuthPrincipalByLoginId(student2.accountId)!;

  await academicService.enrolStudent(adminActor, {
    studentAccountId: student2.accountId,
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });
  await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: teacher2.accountId,
    subjectId: 'SUB-0002',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });

  // =========================================================================
  // 1. CURRENCY PRECISION & VALIDATION
  // =========================================================================
  assert.equal(rupeesToPaise('2500.50'), 250050);
  assert.equal(paiseToUpiAmountString(250050), '2500.50');
  assert.ok(formatInrFromPaise(250000).includes('2,500'));

  // =========================================================================
  // 2. FEE STRUCTURE & STUDENT ACCOUNT GENERATION TESTS
  // =========================================================================
  await expectFinanceError(
    () =>
      feeService.saveFeeConfiguration(adminActor, {
        amountRupees: 0,
        frequency: 'monthly',
        effectiveFrom: '2026-12-01',
        dueDayOfMonth: 10,
      }),
    'VALIDATION_ERROR',
    'Fee amount <= 0 rejected'
  );

  // Save updated monthly fee and verify paid historical period remains untouched
  const saveCfgRes = await feeService.saveFeeConfiguration(adminActor, {
    amountRupees: 3000,
    frequency: 'monthly',
    effectiveFrom: '2026-12-01',
    dueDayOfMonth: 15,
    reminderLeadDays: 7,
    syncPeriod: '2026-12',
    applyToUnpaidCurrentAccounts: true,
  });
  assert.equal(saveCfgRes.config.amountPaise, 300000);
  assert.ok(saveCfgRes.generatedAccountsCount >= 2);

  // Historical October paid account stays 250000 (Rs 2,500)
  const stu1Oct = financeStore.studentFeeAccounts.find(
    (a) => a.studentId === 'STU-0001' && a.feePeriod === '2026-10'
  );
  assert.equal(stu1Oct?.amountDuePaise, 250000);
  assert.equal(stu1Oct?.status, 'paid');

  // Re-running generation for 2026-12 is strictly idempotent
  const regen = await feeService.generateFeeAccountsForPeriod(adminActor, '2026-12');
  assert.equal(regen.createdCount, 0);
  assert.ok(regen.skippedCount >= 2);

  const cfgHistory = await feeService.listFeeConfigurationHistory(adminActor);
  assert.ok(cfgHistory.length >= 2);
  assert.equal(cfgHistory.filter((c) => c.status === 'active').length, 1);

  // =========================================================================
  // 3. UPI CONFIGURATION & PAY NOW PREPARATION TESTS
  // =========================================================================
  await feeService.saveUpiConfiguration(adminActor, {
    upiId: 'centre.official@okaxis',
    payeeName: 'BrightPath Academy',
    description: 'Tuition Fee',
    status: 'inactive',
  });

  const stu2AccountsBefore = await feeService.getStudentFeeDashboard(student2Actor);
  const stu2DecAccount = stu2AccountsBefore.accounts.find((a) => a.account.feePeriod === '2026-12')!;
  assert.ok(stu2DecAccount);

  // Preparing UPI when inactive must fail
  await expectFinanceError(
    () =>
      paymentService.prepareUpiPayment(student2Actor, {
        feeAccountId: stu2DecAccount.account.id,
        amountRupees: 1200,
      }),
    'UPI_DISABLED',
    'UPI disabled stops Pay Now preparation'
  );

  // Reactivate UPI
  await feeService.saveUpiConfiguration(adminActor, {
    upiId: 'centre.official@okaxis',
    payeeName: 'BrightPath Academy',
    description: 'Tuition Fee',
    status: 'active',
  });

  // Prepare partial UPI payment with idempotency key
  const prep1 = await paymentService.prepareUpiPayment(student2Actor, {
    feeAccountId: stu2DecAccount.account.id,
    amountRupees: 1200,
    idempotencyKey: 'KEY-STU2-DEC-1200',
  });
  const prep2 = await paymentService.prepareUpiPayment(student2Actor, {
    feeAccountId: stu2DecAccount.account.id,
    amountRupees: 1200,
    idempotencyKey: 'KEY-STU2-DEC-1200',
  });
  assert.equal(prep1.id, prep2.id, 'Idempotent prepare key returns same record');
  assert.ok(prep1.upiUri.startsWith('upi://pay?'));
  assert.ok(prep1.upiUri.includes('pa=centre.official%40okaxis'));
  assert.ok(prep1.upiUri.includes('am=1200.00'));
  assert.ok(prep1.upiUri.includes('cu=INR'));

  // Preparing UPI must NEVER reduce remaining balance
  const stu2AfterPrep = await feeService.getStudentFeeDashboard(student2Actor);
  const stu2DecAfterPrep = stu2AfterPrep.accounts.find((a) => a.account.id === stu2DecAccount.account.id)!;
  assert.equal(stu2DecAfterPrep.account.verifiedAmountPaidPaise, 0);
  assert.equal(stu2DecAfterPrep.account.remainingBalancePaise, 300000);

  // =========================================================================
  // 4. PAYMENT CLAIM SUBMISSION, DUPLICATE UTR & OVERPAYMENT GUARDS
  // =========================================================================
  await expectFinanceError(
    () =>
      paymentService.submitPaymentClaim(student2Actor, {
        feeAccountId: stu2DecAccount.account.id,
        amountRupees: 4000,
        transactionReference: 'UTR999999000111',
        paymentDate: '2026-12-04',
      }),
    'OVERPAYMENT_NOT_ALLOWED',
    'Overpayment claim rejected'
  );

  const claim1 = await paymentService.submitPaymentClaim(student2Actor, {
    feeAccountId: stu2DecAccount.account.id,
    preparedPaymentId: prep1.id,
    paymentReference: prep1.paymentReference,
    amountRupees: 1200,
    transactionReference: 'UTR712000111222',
    paymentDate: '2026-12-05',
    studentNote: 'First installment',
  });
  assert.equal(claim1.claim.status, 'verification_pending');
  assert.equal(claim1.claim.duplicateTransactionFlag, false);

  // Submitting claim must still keep verified paid at 0
  const stu2AfterClaim = await feeService.getStudentFeeDashboard(student2Actor);
  const decAfterClaim = stu2AfterClaim.accounts.find((a) => a.account.id === stu2DecAccount.account.id)!;
  assert.equal(decAfterClaim.account.verifiedAmountPaidPaise, 0);
  assert.equal(decAfterClaim.pendingClaimsPaise, 120000);
  assert.equal(decAfterClaim.account.status, 'verification_pending');

  // Second claim using same UTR gets duplicateTransactionFlag
  const dupClaim = await paymentService.submitPaymentClaim(student2Actor, {
    feeAccountId: stu2DecAccount.account.id,
    amountRupees: 1800,
    transactionReference: 'UTR712000111222',
    paymentDate: '2026-12-06',
  });
  assert.equal(dupClaim.claim.duplicateTransactionFlag, true);

  // =========================================================================
  // 5. ADMIN MANUAL VERIFICATION, REJECTION, RECEIPTS & CORRECTION
  // =========================================================================
  await expectFinanceError(
    () =>
      paymentService.verifyPaymentClaim(adminActor, {
        claimId: claim1.claim.id,
        confirmIndependentCheck: false,
      }),
    'CONFIRMATION_REQUIRED',
    'Independent confirmation checkbox mandatory'
  );

  const verified1 = await paymentService.verifyPaymentClaim(adminActor, {
    claimId: claim1.claim.id,
    confirmIndependentCheck: true,
    verificationNote: 'Confirmed in Axis settlement CSV',
  });
  assert.equal(verified1.claim.claim.status, 'verified');
  assert.ok(verified1.receipt.receiptNumber.startsWith('RCP-'));
  assert.equal(verified1.receipt.amountPaise, 120000);
  assert.equal(verified1.receipt.remainingBalancePaise, 180000);

  // Double verification blocked
  await expectFinanceError(
    () =>
      paymentService.verifyPaymentClaim(adminActor, {
        claimId: claim1.claim.id,
        confirmIndependentCheck: true,
      }),
    'DUPLICATE_VERIFICATION',
    'Cannot verify same claim twice'
  );

  // Rejecting duplicate claim requires reason
  await expectFinanceError(
    () =>
      paymentService.rejectPaymentClaim(adminActor, {
        claimId: dupClaim.claim.id,
        rejectionReason: 'no',
      }),
    'REJECTION_REASON_REQUIRED',
    'Rejection requires meaningful reason'
  );

  const rejectedDup = await paymentService.rejectPaymentClaim(adminActor, {
    claimId: dupClaim.claim.id,
    rejectionReason: 'Duplicate UTR already verified under earlier claim',
  });
  assert.equal(rejectedDup.claim.status, 'rejected');

  // Submit remaining Rs 1800 and verify -> settles account to 'paid'
  const claim2 = await paymentService.submitPaymentClaim(student2Actor, {
    feeAccountId: stu2DecAccount.account.id,
    amountRupees: 1800,
    transactionReference: 'UTR712000333444',
    paymentDate: '2026-12-08',
  });
  await paymentService.verifyPaymentClaim(adminActor, {
    claimId: claim2.claim.id,
    confirmIndependentCheck: true,
  });

  const stu2Settled = await feeService.getStudentFeeDashboard(student2Actor);
  const decSettled = stu2Settled.accounts.find((a) => a.account.id === stu2DecAccount.account.id)!;
  assert.equal(decSettled.account.verifiedAmountPaidPaise, 300000);
  assert.equal(decSettled.account.remainingBalancePaise, 0);
  assert.equal(decSettled.account.status, 'paid');

  // Audited payment correction requires reason, voids prior receipt, issues new receipt
  await expectFinanceError(
    () =>
      paymentService.correctVerifiedPayment(adminActor, {
        verifiedPaymentId: verified1.verifiedPayment.id,
        correctedAmountRupees: 1000,
        reason: 'ok',
      }),
    'CORRECTION_REASON_REQUIRED',
    'Payment correction requires valid reason'
  );

  const correctedVp = await paymentService.correctVerifiedPayment(adminActor, {
    verifiedPaymentId: verified1.verifiedPayment.id,
    correctedAmountRupees: 1000,
    reason: 'Adjusted Rs 200 mismatch in bank statement',
  });
  assert.equal(correctedVp.verifiedPayment.amountPaise, 100000);
  assert.ok(correctedVp.voidedReceiptId);
  assert.ok(correctedVp.newReceipt);

  const oldReceipt = await receiptService.getReceiptById(adminActor, verified1.receipt.id);
  assert.equal(oldReceipt.status, 'voided');

  // Remaining balance after correction (3000 - 1000 - 1800 = 200 INR = 20000 paise)
  const stu2AfterCorr = await feeService.getStudentFeeDashboard(student2Actor);
  const decAfterCorr = stu2AfterCorr.accounts.find((a) => a.account.id === stu2DecAccount.account.id)!;
  assert.equal(decAfterCorr.account.remainingBalancePaise, 20000);
  assert.equal(decAfterCorr.account.status, 'partially_paid');

  // =========================================================================
  // 6. TEACHER SALARY CONFIGURATION, PER-SESSION CALCULATION & PAYOUTS
  // =========================================================================
  // Create submitted non-cancelled attendance session for Teacher 2 in 2026-12
  await attendanceService.submitAttendanceSession(teacher2Actor, {
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0002',
    sessionDate: '2026-12-04',
    sessionType: 'regular',
    marks: [
      { studentId: 'STU-0001', status: 'present' },
      { studentId: student2.accountId, status: 'present' },
    ],
  });

  // Create a second draft (unsubmitted) session — must NOT be counted!
  await attendanceService.saveDraftAttendanceSession(teacher2Actor, {
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0002',
    sessionDate: '2026-12-05',
    sessionType: 'regular',
    marks: [{ studentId: 'STU-0001', status: 'present' }],
  });

  await salaryService.saveTeacherSalaryConfig(adminActor, {
    teacherId: teacher2.accountId,
    salaryModel: 'per_session',
    perSessionAmountRupees: 700,
    effectiveFrom: '2026-12-01',
  });

  // For month 2026-12, Teacher 2 has 1 submitted non-cancelled session -> Rs 700
  const decSalaries = await salaryService.generateSalaryPeriodsForMonth(adminActor, '2026-12');
  const tch2DecSalary = decSalaries.find((p) => p.teacherId === teacher2.accountId)!;
  assert.equal(tch2DecSalary.eligibleSessionIds.length, 1);
  assert.equal(tch2DecSalary.payableAmountPaise, 70000);
  assert.equal(tch2DecSalary.requiresAdminReview, true);
  assert.ok(tch2DecSalary.reviewReason?.includes('unsubmitted draft'));

  // For month 2027-01 (no attendance sessions), per-session Teacher 2 must be flagged requiresAdminReview
  const janSalaries = await salaryService.generateSalaryPeriodsForMonth(adminActor, '2027-01');
  const tch2JanSalary = janSalaries.find((p) => p.teacherId === teacher2.accountId)!;
  assert.equal(tch2JanSalary.eligibleSessionIds.length, 0);
  assert.equal(tch2JanSalary.payableAmountPaise, 0);
  assert.equal(tch2JanSalary.requiresAdminReview, true);

  const resolvedJan = await salaryService.resolveSalaryPeriodReview(adminActor, {
    teacherSalaryPeriodId: tch2JanSalary.id,
    approvedPayableRupees: 700,
    reason: 'Verified manual substitute session',
  });
  assert.equal(resolvedJan.requiresAdminReview, false);
  assert.equal(resolvedJan.payableAmountPaise, 70000);

  // Hold blocks payout until resumed
  await salaryService.setSalaryPeriodHoldStatus(adminActor, {
    teacherSalaryPeriodId: tch2DecSalary.id,
    onHold: true,
    reason: 'Audit hold check',
  });
  await expectFinanceError(
    () =>
      salaryService.recordSalaryPayment(adminActor, {
        teacherSalaryPeriodId: tch2DecSalary.id,
        amountRupees: 500,
        paymentDate: '2026-12-15',
      }),
    'VALIDATION_ERROR',
    'Salary payout blocked while on_hold'
  );

  await salaryService.setSalaryPeriodHoldStatus(adminActor, {
    teacherSalaryPeriodId: tch2DecSalary.id,
    onHold: false,
    reason: 'Audit hold cleared',
  });

  // Partial salary payout + overpayment prevention + audited correction
  const partialSal = await salaryService.recordSalaryPayment(adminActor, {
    teacherSalaryPeriodId: tch2DecSalary.id,
    amountRupees: 400,
    paymentDate: '2026-12-16',
    paymentReference: 'NEFT-SAL-01',
  });
  assert.equal(partialSal.period.status, 'partially_paid');
  assert.equal(partialSal.period.remainingAmountPaise, 30000);

  await expectFinanceError(
    () =>
      salaryService.recordSalaryPayment(adminActor, {
        teacherSalaryPeriodId: tch2DecSalary.id,
        amountRupees: 500,
        paymentDate: '2026-12-17',
      }),
    'OVERPAYMENT_NOT_ALLOWED',
    'Overpayment of teacher salary blocked'
  );

  const corrSal = await salaryService.correctSalaryPayment(adminActor, {
    salaryPaymentId: partialSal.payment.id,
    correctedAmountRupees: 500,
    reason: 'Updated transfer record',
  });
  assert.equal(corrSal.period.remainingAmountPaise, 20000);

  // =========================================================================
  // 7. FINANCIAL REPORTS & SEPARATION OF VERIFIED VS PENDING REVENUE
  // =========================================================================
  const decReport = await reportService.getFinancialReportSummary(adminActor, {
    granularity: 'monthly',
    month: '2026-12',
  });
  assert.equal(decReport.feeSummary.totalVerifiedCollectionsPaise, 280000); // 1000 corrected + 1800
  assert.equal(decReport.feeSummary.rejectedClaimsCount, 1);
  assert.ok(decReport.salarySummary.totalSalaryPaidPaise >= 50000);

  const dash = await reportService.getAdminFinancialDashboard(adminActor);
  assert.equal(
    dash.netRecordedBalancePaise,
    dash.totalVerifiedCollectionsPaise - dash.totalTeacherSalaryPaidPaise
  );

  const auditList = await reportService.listFinancialAuditHistory(adminActor);
  assert.ok(auditList.length >= 6);

  // =========================================================================
  // 8. STRICT CROSS-ROLE RBAC BOUNDARY CHECKS
  // =========================================================================
  // Student cannot configure fees/UPI, verify claims, read another student's receipt, or inspect salaries/reports
  await expectFinanceError(
    () =>
      feeService.saveFeeConfiguration(student1Actor, {
        amountRupees: 100,
        frequency: 'monthly',
        effectiveFrom: '2026-12-01',
        dueDayOfMonth: 10,
      }),
    'UNAUTHORIZED',
    'Student blocked from fee configuration'
  );
  await expectFinanceError(
    () =>
      paymentService.verifyPaymentClaim(student1Actor, {
        claimId: claim1.claim.id,
        confirmIndependentCheck: true,
      }),
    'UNAUTHORIZED',
    'Student blocked from verifying claims'
  );
  await expectFinanceError(
    () => receiptService.getReceiptById(student1Actor, correctedVp.newReceipt!.id),
    'UNAUTHORIZED',
    'Student 1 blocked from accessing Student 2 receipt'
  );
  await expectFinanceError(
    () => salaryService.getMyTeacherSalaryOverview(student1Actor),
    'UNAUTHORIZED',
    'Student blocked from teacher salary view'
  );
  await expectFinanceError(
    () => reportService.getAdminFinancialDashboard(student1Actor),
    'UNAUTHORIZED',
    'Student blocked from admin financial dashboard'
  );

  // Teacher cannot view another teacher's salary, configure fees, or verify student fees
  await expectFinanceError(
    () =>
      feeService.listAdminStudentFeeAccounts(teacher1Actor),
    'UNAUTHORIZED',
    'Teacher blocked from student fee accounts'
  );
  await expectFinanceError(
    () =>
      salaryService.listAdminTeacherSalarySummaries(teacher1Actor),
    'UNAUTHORIZED',
    'Teacher blocked from admin salary list'
  );
  await expectFinanceError(
    () => reportService.listFinancialAuditHistory(teacher1Actor),
    'UNAUTHORIZED',
    'Teacher blocked from financial audit logs'
  );

  // Teacher own salary read works and contains only Teacher 2 records
  const tch2OwnSalary = await salaryService.getMyTeacherSalaryOverview(teacher2Actor);
  assert.equal(tch2OwnSalary.teacherId, teacher2.accountId);
  assert.ok(tch2OwnSalary.periods.every((p) => p.teacherId === teacher2.accountId));

  // Deactivated account rejected
  await expectFinanceError(
    () => feeService.getStudentFeeDashboard(deactivatedActor),
    'UNAUTHORIZED',
    'Deactivated account blocked'
  );

  console.log('Phase 7 Finance, UPI Payment Verification, Receipts, Salaries & RBAC Verification: ALL TESTS PASSED');
}

runPhase7Tests().catch((err) => {
  console.error('Phase 7 Verification Failed:', err);
  process.exit(1);
});

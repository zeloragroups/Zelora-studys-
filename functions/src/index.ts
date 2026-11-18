import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

initializeApp();

const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470';
const BOOTSTRAPPED_ADMIN_EMAIL = 'toutionacademy@gmail.com';
const INTERNAL_AUTH_EMAIL_DOMAIN = 'auth.academy-0007.internal';

const db = getFirestore(FIRESTORE_DATABASE_ID);
const auth = getAuth();

interface CallerContext {
  uid: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  accountId: string;
}

function deriveInternalAuthEmail(loginId: string): string {
  const normalized = loginId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${normalized}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

function padId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

function requireVerifiedCaller(request: CallableRequest<unknown>): {
  uid: string;
  email: string;
} {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const email = (request.auth.token.email ?? '').toLowerCase();
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError(
      'permission-denied',
      'Verified authentication identity is required.'
    );
  }
  return { uid: request.auth.uid, email };
}

async function requireActiveRole(
  request: CallableRequest<unknown>,
  allowedRoles: Array<'admin' | 'teacher' | 'student'>
): Promise<CallerContext> {
  const caller = requireVerifiedCaller(request);

  if (caller.email === BOOTSTRAPPED_ADMIN_EMAIL && allowedRoles.includes('admin')) {
    const adminSnap = await db.collection('admins').doc(caller.uid).get();
    const accountId =
      (adminSnap.exists ? (adminSnap.data()?.accountId as string | undefined) : undefined) ||
      'ADM-0001';
    return { uid: caller.uid, email: caller.email, role: 'admin', accountId };
  }

  const adminSnap = await db.collection('admins').doc(caller.uid).get();
  if (adminSnap.exists && adminSnap.data()?.status === 'active' && allowedRoles.includes('admin')) {
    return {
      uid: caller.uid,
      email: caller.email,
      role: 'admin',
      accountId: String(adminSnap.data()?.accountId || 'ADM-0001'),
    };
  }

  const userSnap = await db.collection('users').doc(caller.uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'Account profile not found.');
  }
  const userData = userSnap.data()!;
  if (userData.status !== 'active') {
    throw new HttpsError('permission-denied', 'Deactivated account cannot perform operations.');
  }
  const role = userData.role as 'admin' | 'teacher' | 'student';
  if (!allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', `Role "${role}" is not authorized.`);
  }
  return {
    uid: caller.uid,
    email: caller.email,
    role,
    accountId: String(userData.accountId || ''),
  };
}

async function listActiveAdminUids(): Promise<string[]> {
  const snap = await db.collection('admins').where('status', '==', 'active').limit(10).get();
  const uids = snap.docs.map((d) => d.id);
  return uids.length > 0 ? uids : ['bootstrap-admin'];
}

// ============================================================================
// 1. Bootstrap Initial Admin (toutionacademy@gmail.com)
// ============================================================================
export const bootstrapInitialAdmin = onCall(async (request) => {
  const caller = requireVerifiedCaller(request);
  if (caller.email !== BOOTSTRAPPED_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the designated project operator may bootstrap.');
  }

  const nowIso = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const adminRef = db.collection('admins').doc(caller.uid);
    const userRef = db.collection('users').doc(caller.uid);
    const mapRef = db.collection('authIdMappings').doc('ADM-0001');

    tx.set(
      adminRef,
      {
        uid: caller.uid,
        accountId: 'ADM-0001',
        email: caller.email,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    tx.set(
      userRef,
      {
        uid: caller.uid,
        accountId: 'ADM-0001',
        role: 'admin',
        name: 'Centre Administrator',
        phone: '',
        email: caller.email,
        status: 'active',
        adminUids: [caller.uid],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    tx.set(
      mapRef,
      {
        loginId: 'ADM-0001',
        uid: caller.uid,
        authEmail: caller.email,
        role: 'admin',
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  });

  await auth.setCustomUserClaims(caller.uid, {
    role: 'admin',
    accountId: 'ADM-0001',
    status: 'active',
  });

  return { ok: true, uid: caller.uid, accountId: 'ADM-0001' };
});

// ============================================================================
// 2. Trusted Teacher / Student Account Creation
// ============================================================================
interface CreateManagedAccountPayload {
  role: 'teacher' | 'student';
  name: string;
  phone: string;
  email?: string;
  initialPassword: string;
  status?: 'active' | 'deactivated';
  classId?: string;
  className?: string;
  batchId?: string;
  batchName?: string;
  idempotencyKey?: string;
}

export const createManagedAccount = onCall(
  async (request: CallableRequest<CreateManagedAccountPayload>) => {
    const admin = await requireActiveRole(request, ['admin']);
    const data = request.data;

    if (!data || (data.role !== 'teacher' && data.role !== 'student')) {
      throw new HttpsError('invalid-argument', 'Role must be "teacher" or "student".');
    }
    const name = String(data.name || '').trim();
    const phone = String(data.phone || '').trim();
    const initialPassword = String(data.initialPassword || '');
    if (name.length < 2 || name.length > 100) {
      throw new HttpsError('invalid-argument', 'Name must be between 2 and 100 characters.');
    }
    if (phone.replace(/\D/g, '').length < 10) {
      throw new HttpsError('invalid-argument', 'A valid phone number is required.');
    }
    if (initialPassword.length < 8) {
      throw new HttpsError('invalid-argument', 'Initial password must be at least 8 characters.');
    }

    const adminUids = await listActiveAdminUids();
    const nowIso = new Date().toISOString();

    // Idempotency guard if client retries with same idempotencyKey
    if (data.idempotencyKey) {
      const idemRef = db.collection('accountIdempotency').doc(String(data.idempotencyKey));
      const existingIdem = await idemRef.get();
      if (existingIdem.exists && existingIdem.data()?.accountId) {
        const existingUser = await db
          .collection('users')
          .doc(String(existingIdem.data()?.uid))
          .get();
        if (existingUser.exists) {
          return existingUser.data();
        }
      }
    }

    // Allocate sequential Account ID atomically
    const counterRef = db.collection('counters').doc('accountSequences');
    const accountId = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists ? snap.data()! : { teacherSeq: 1, studentSeq: 1 };
      const seqField = data.role === 'teacher' ? 'teacherSeq' : 'studentSeq';
      const nextSeq = Number(current[seqField] || 1);
      const prefix = data.role === 'teacher' ? 'TCH' : 'STU';
      const allocated = padId(prefix, nextSeq);
      tx.set(counterRef, { ...current, [seqField]: nextSeq + 1 }, { merge: true });
      return allocated;
    });

    const internalEmail = deriveInternalAuthEmail(accountId);
    const status = data.status === 'deactivated' ? 'deactivated' : 'active';

    // Create Firebase Authentication user (rollback cleanly if Firestore profile fails)
    const createdAuthUser = await auth.createUser({
      email: internalEmail,
      password: initialPassword,
      displayName: name,
      emailVerified: true,
      disabled: status === 'deactivated',
    });

    try {
      await auth.setCustomUserClaims(createdAuthUser.uid, {
        role: data.role,
        accountId,
        status,
      });

      const profileDoc = {
        uid: createdAuthUser.uid,
        accountId,
        role: data.role,
        name,
        phone,
        ...(data.email?.trim() ? { email: data.email.trim() } : {}),
        status,
        ...(data.role === 'student'
          ? {
              classId: data.classId || '',
              className: data.className || '',
              batchId: data.batchId || '',
              batchName: data.batchName || '',
              sharedWithParent: true,
            }
          : {}),
        adminUids,
        createdAt: nowIso,
      };

      const auditId = `AAUD-${Date.now()}-${createdAuthUser.uid.slice(0, 6)}`;
      await db.runTransaction(async (tx) => {
        tx.set(db.collection('users').doc(createdAuthUser.uid), profileDoc);
        tx.set(db.collection('authIdMappings').doc(accountId), {
          loginId: accountId,
          uid: createdAuthUser.uid,
          authEmail: internalEmail,
          role: data.role,
          status,
          createdAt: nowIso,
        });
        tx.set(db.collection('accountAudit').doc(auditId), {
          id: auditId,
          accountId,
          actorId: admin.accountId,
          actorRole: 'admin',
          action: 'created',
          summary: `${data.role} account created via Cloud Function.`,
          adminUids,
          createdAt: nowIso,
          serverTimestamp: FieldValue.serverTimestamp(),
        });
        if (data.idempotencyKey) {
          tx.set(db.collection('accountIdempotency').doc(String(data.idempotencyKey)), {
            accountId,
            uid: createdAuthUser.uid,
            createdAt: nowIso,
          });
        }
      });

      return profileDoc;
    } catch (error) {
      // Recovery rollback: avoid orphaned Auth user without Firestore profile
      await auth.deleteUser(createdAuthUser.uid).catch(() => undefined);
      throw new HttpsError(
        'internal',
        `Account creation failed cleanly and rolled back: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

// ============================================================================
// 3. Deactivate / Reactivate Account
// ============================================================================
export const setManagedAccountStatus = onCall(
  async (
    request: CallableRequest<{ accountId: string; status: 'active' | 'deactivated' }>
  ) => {
    const admin = await requireActiveRole(request, ['admin']);
    const accountId = String(request.data?.accountId || '').trim().toUpperCase();
    const nextStatus = request.data?.status;
    if (!accountId || (nextStatus !== 'active' && nextStatus !== 'deactivated')) {
      throw new HttpsError('invalid-argument', 'Valid accountId and status are required.');
    }

    const mapSnap = await db.collection('authIdMappings').doc(accountId).get();
    if (!mapSnap.exists) {
      throw new HttpsError('not-found', `Account ${accountId} was not found.`);
    }
    const uid = String(mapSnap.data()!.uid);
    const nowIso = new Date().toISOString();
    const adminUids = await listActiveAdminUids();

    await auth.updateUser(uid, { disabled: nextStatus === 'deactivated' });
    await auth.setCustomUserClaims(uid, {
      role: mapSnap.data()!.role,
      accountId,
      status: nextStatus,
    });
    if (nextStatus === 'deactivated') {
      await auth.revokeRefreshTokens(uid);
    }

    const auditId = `AAUD-${Date.now()}-${uid.slice(0, 6)}`;
    await db.runTransaction(async (tx) => {
      tx.update(db.collection('users').doc(uid), { status: nextStatus, updatedAt: nowIso });
      tx.update(db.collection('authIdMappings').doc(accountId), {
        status: nextStatus,
        updatedAt: nowIso,
      });
      tx.set(db.collection('accountAudit').doc(auditId), {
        id: auditId,
        accountId,
        actorId: admin.accountId,
        actorRole: 'admin',
        action: nextStatus === 'deactivated' ? 'deactivated' : 'reactivated',
        summary: `Account status changed to ${nextStatus}.`,
        adminUids,
        createdAt: nowIso,
        serverTimestamp: FieldValue.serverTimestamp(),
      });
    });

    return { accountId, uid, status: nextStatus };
  }
);

// ============================================================================
// 4. Admin-Mediated Password Reset
// ============================================================================
export const adminResetAccountPassword = onCall(
  async (
    request: CallableRequest<{
      accountId: string;
      newPassword: string;
      confirmed: boolean;
    }>
  ) => {
    const admin = await requireActiveRole(request, ['admin']);
    const accountId = String(request.data?.accountId || '').trim().toUpperCase();
    const newPassword = String(request.data?.newPassword || '');
    if (!request.data?.confirmed) {
      throw new HttpsError('failed-precondition', 'Explicit Admin confirmation is required.');
    }
    if (!accountId || newPassword.length < 8) {
      throw new HttpsError(
        'invalid-argument',
        'Valid accountId and password of at least 8 characters are required.'
      );
    }

    const mapSnap = await db.collection('authIdMappings').doc(accountId).get();
    if (!mapSnap.exists) {
      throw new HttpsError('not-found', `Account ${accountId} was not found.`);
    }
    const uid = String(mapSnap.data()!.uid);
    const nowIso = new Date().toISOString();
    const adminUids = await listActiveAdminUids();

    await auth.updateUser(uid, { password: newPassword });
    await auth.revokeRefreshTokens(uid);

    const auditId = `AAUD-${Date.now()}-${uid.slice(0, 6)}`;
    await db.collection('accountAudit').doc(auditId).set({
      id: auditId,
      accountId,
      actorId: admin.accountId,
      actorRole: 'admin',
      action: 'password_reset',
      summary: 'Admin-mediated password reset executed; active refresh tokens revoked.',
      adminUids,
      createdAt: nowIso,
      serverTimestamp: FieldValue.serverTimestamp(),
    });

    return {
      accountId,
      initiatedByAdminId: admin.accountId,
      initiatedAt: nowIso,
      sessionsRevoked: true,
    };
  }
);

// ============================================================================
// 5. Server-Side Payment Claim Verification & Atomic Receipt Issuance
// ============================================================================
export const verifyPaymentClaim = onCall(
  async (
    request: CallableRequest<{
      claimId: string;
      confirmIndependentCheck: boolean;
      verificationNote?: string;
    }>
  ) => {
    const admin = await requireActiveRole(request, ['admin']);
    const claimId = String(request.data?.claimId || '').trim();
    if (!claimId || request.data?.confirmIndependentCheck !== true) {
      throw new HttpsError(
        'failed-precondition',
        'Claim ID and independent payment confirmation are required.'
      );
    }

    const adminUids = await listActiveAdminUids();
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (tx) => {
      const claimRef = db.collection('paymentClaims').doc(claimId);
      const claimSnap = await tx.get(claimRef);
      if (!claimSnap.exists) {
        throw new HttpsError('not-found', `Payment claim "${claimId}" not found.`);
      }
      const claim = claimSnap.data()!;
      if (claim.status !== 'verification_pending') {
        throw new HttpsError(
          'failed-precondition',
          `Claim ${claimId} has already been processed (${claim.status}).`
        );
      }

      const feeAccountRef = db.collection('studentFeeAccounts').doc(String(claim.feeAccountId));
      const feeSnap = await tx.get(feeAccountRef);
      if (!feeSnap.exists) {
        throw new HttpsError('not-found', 'Linked student fee account not found.');
      }
      const feeAccount = feeSnap.data()!;
      const amountPaise = Number(claim.amountPaise);
      const currentRemaining = Number(feeAccount.remainingBalancePaise);
      if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > currentRemaining) {
        throw new HttpsError(
          'failed-precondition',
          'Claim amount exceeds current remaining balance or is invalid.'
        );
      }

      // Check duplicate verified UTR inside transaction query
      const dupSnap = await tx.get(
        db
          .collection('paymentClaims')
          .where('transactionReference', '==', claim.transactionReference)
          .where('status', '==', 'verified')
          .limit(1)
      );
      if (!dupSnap.empty) {
        throw new HttpsError(
          'already-exists',
          `UTR ${claim.transactionReference} has already been verified on another claim.`
        );
      }

      const nextVerifiedPaid = Number(feeAccount.verifiedAmountPaidPaise || 0) + amountPaise;
      const nextRemaining = Math.max(0, Number(feeAccount.amountDuePaise) - nextVerifiedPaid);
      const nextAccountStatus = nextRemaining === 0 ? 'paid' : 'partially_paid';

      const vpId = `VPAY-${Date.now()}-${claimId.slice(-4)}`;
      const receiptId = `REC-${Date.now()}-${claimId.slice(-4)}`;
      const receiptNumber = `RCP-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`;
      const auditId = `FAUD-${Date.now()}-${claimId.slice(-4)}`;
      const pvAuditId = `PVAUD-${Date.now()}-${claimId.slice(-4)}`;
      const notifId = `FNOT-${Date.now()}-${claimId.slice(-4)}`;
      const verificationNote = String(request.data?.verificationNote || '').slice(0, 500);

      const userSnap = claim.studentUid
        ? await tx.get(db.collection('users').doc(String(claim.studentUid)))
        : null;
      const userData = userSnap?.exists ? userSnap.data() : undefined;

      tx.update(claimRef, {
        status: 'verified',
        verifiedBy: admin.accountId,
        verifiedAt: nowIso,
        ...(verificationNote ? { verificationNote } : {}),
      });

      tx.set(db.collection('verifiedPayments').doc(vpId), {
        id: vpId,
        paymentClaimId: claimId,
        paymentReference: claim.paymentReference,
        studentId: claim.studentId,
        studentUid: claim.studentUid,
        feeAccountId: claim.feeAccountId,
        feePeriod: claim.feePeriod,
        amountPaise,
        transactionReference: claim.transactionReference,
        paymentDate: claim.paymentDate,
        verifiedBy: admin.accountId,
        verifiedAt: nowIso,
        ...(verificationNote ? { verificationNote } : {}),
        adminUids,
      });

      tx.update(feeAccountRef, {
        verifiedAmountPaidPaise: nextVerifiedPaid,
        remainingBalancePaise: nextRemaining,
        status: nextAccountStatus,
        updatedAt: nowIso,
      });

      tx.set(db.collection('paymentReceipts').doc(receiptId), {
        id: receiptId,
        receiptNumber,
        verifiedPaymentId: vpId,
        paymentClaimId: claimId,
        paymentReference: claim.paymentReference,
        transactionReference: claim.transactionReference,
        centreName: 'Tuition Centre',
        studentId: claim.studentId,
        studentUid: claim.studentUid,
        studentName: String(userData?.name || claim.studentId),
        className: String(userData?.className || 'Unassigned Class'),
        batchName: String(userData?.batchName || 'Unassigned Batch'),
        feePeriod: claim.feePeriod,
        periodLabel: String(feeAccount.periodLabel || claim.feePeriod),
        paymentDate: claim.paymentDate,
        amountPaise,
        totalFeeDuePaise: Number(feeAccount.amountDuePaise),
        totalAmountPaidAfterPaise: nextVerifiedPaid,
        remainingBalancePaise: nextRemaining,
        verificationStatus: 'verified',
        issuedBy: admin.accountId,
        issuedAt: nowIso,
        status: 'issued',
        adminUids,
      });

      tx.set(db.collection('paymentVerificationAudit').doc(pvAuditId), {
        id: pvAuditId,
        paymentClaimId: claimId,
        verifiedPaymentId: vpId,
        actorId: admin.accountId,
        action: 'payment_verified',
        previousValues: `status=verification_pending, remaining=${currentRemaining}`,
        newValues: `status=verified, amountPaise=${amountPaise}, remaining=${nextRemaining}`,
        reason: verificationNote || 'Independently verified by Admin',
        timestamp: nowIso,
        adminUids,
      });

      tx.set(db.collection('financialAudit').doc(auditId), {
        id: auditId,
        entityType: 'verified_payment',
        entityId: vpId,
        actorId: admin.accountId,
        action: 'payment_verified_and_receipt_issued',
        previousValues: `remaining=${currentRemaining}`,
        newValues: `verified=${amountPaise}, remaining=${nextRemaining}, receipt=${receiptNumber}`,
        reason: verificationNote || 'Independently verified by Admin',
        timestamp: nowIso,
        adminUids,
      });

      tx.set(db.collection('notifications').doc(notifId), {
        id: notifId,
        recipientId: claim.studentId,
        recipientUid: claim.studentUid,
        recipientRole: 'student',
        category: 'fees_receipts',
        type: 'payment_verified',
        relatedRecordId: receiptId,
        dedupeKey: `payment_verified:${vpId}:${claim.studentId}`,
        title: `Fee Payment Verified (${receiptNumber})`,
        message: `Your UPI payment claim (${claim.transactionReference}) was verified and receipt ${receiptNumber} was issued.`,
        adminUids,
        createdAt: nowIso,
      });

      return { claimId, verifiedPaymentId: vpId, receiptId, receiptNumber, nextRemaining, nextAccountStatus };
    });

    return result;
  }
);

// ============================================================================
// 6. Server-Side Teacher Salary Payment (Anti-Overpayment Transaction)
// ============================================================================
export const recordTeacherSalaryPayment = onCall(
  async (
    request: CallableRequest<{
      teacherSalaryPeriodId?: string;
      salaryPeriodId?: string;
      amountPaise: number;
      paymentDate: string;
      paymentReference?: string;
      note?: string;
    }>
  ) => {
    const admin = await requireActiveRole(request, ['admin']);
    const salaryPeriodId = String(
      request.data?.teacherSalaryPeriodId || request.data?.salaryPeriodId || ''
    ).trim();
    const amountPaise = Number(request.data?.amountPaise);
    const paymentDate = String(request.data?.paymentDate || '').trim();

    if (!salaryPeriodId || !Number.isInteger(amountPaise) || amountPaise <= 0 || !paymentDate) {
      throw new HttpsError(
        'invalid-argument',
        'Valid teacherSalaryPeriodId, positive integer amountPaise, and paymentDate are required.'
      );
    }

    const adminUids = await listActiveAdminUids();
    const nowIso = new Date().toISOString();

    return db.runTransaction(async (tx) => {
      const periodRef = db.collection('teacherSalaryPeriods').doc(salaryPeriodId);
      const periodSnap = await tx.get(periodRef);
      if (!periodSnap.exists) {
        throw new HttpsError('not-found', `Salary period "${salaryPeriodId}" not found.`);
      }
      const period = periodSnap.data()!;
      if (period.status === 'on_hold') {
        throw new HttpsError('failed-precondition', 'Cannot pay salary while period is on hold.');
      }
      const remaining = Number(period.remainingAmountPaise);
      if (amountPaise > remaining) {
        throw new HttpsError(
          'failed-precondition',
          'Payment exceeds remaining salary payable for this period.'
        );
      }

      const nextPaid = Number(period.paidAmountPaise || 0) + amountPaise;
      const nextRemaining = Math.max(0, Number(period.payableAmountPaise) - nextPaid);
      const nextStatus = nextRemaining === 0 ? 'paid' : 'partially_paid';

      const paymentId = `SPAY-${Date.now()}-${salaryPeriodId.slice(-4)}`;
      const auditId = `FAUD-${Date.now()}-${salaryPeriodId.slice(-4)}`;
      const paymentReference = String(request.data?.paymentReference || '').trim().slice(0, 80);
      const note = String(request.data?.note || '').trim().slice(0, 300);

      tx.set(db.collection('teacherSalaryPayments').doc(paymentId), {
        id: paymentId,
        teacherSalaryPeriodId: salaryPeriodId,
        teacherId: period.teacherId,
        teacherUid: period.teacherUid,
        period: period.period,
        amountPaise,
        paymentDate,
        ...(paymentReference ? { paymentReference } : {}),
        ...(note ? { note } : {}),
        recordedBy: admin.accountId,
        createdAt: nowIso,
        adminUids,
      });

      tx.update(periodRef, {
        paidAmountPaise: nextPaid,
        remainingAmountPaise: nextRemaining,
        status: nextStatus,
        updatedAt: nowIso,
      });

      tx.set(db.collection('financialAudit').doc(auditId), {
        id: auditId,
        entityType: 'salary_payment',
        entityId: paymentId,
        actorId: admin.accountId,
        action: 'salary_payment_recorded',
        previousValues: `paid=${period.paidAmountPaise}, remaining=${remaining}`,
        newValues: `${period.teacherId} (${period.period}): +${amountPaise}, remaining=${nextRemaining}`,
        reason: note || 'Manual salary payment tracking entry',
        timestamp: nowIso,
        adminUids,
      });

      return { paymentId, nextPaid, nextRemaining, nextStatus };
    });
  }
);

// ============================================================================
// 7. Server-Side Objective Test Evaluation (Protects Answer Key)
// ============================================================================
export const submitAndEvaluateTestAttempt = onCall(
  async (request: CallableRequest<{ attemptId: string }>) => {
    const student = await requireActiveRole(request, ['student']);
    const attemptId = String(request.data?.attemptId || '').trim();
    if (!attemptId) {
      throw new HttpsError('invalid-argument', 'attemptId is required.');
    }

    const nowIso = new Date().toISOString();
    return db.runTransaction(async (tx) => {
      const attemptRef = db.collection('testAttempts').doc(attemptId);
      const attemptSnap = await tx.get(attemptRef);
      if (!attemptSnap.exists) {
        throw new HttpsError('not-found', 'Test attempt not found.');
      }
      const attempt = attemptSnap.data()!;
      if (attempt.studentUid !== student.uid) {
        throw new HttpsError('permission-denied', 'Cannot submit another student attempt.');
      }
      if (attempt.status !== 'in_progress') {
        throw new HttpsError('failed-precondition', 'Attempt has already been submitted.');
      }

      const testRef = db.collection('objectiveTests').doc(String(attempt.testId));
      const keyRef = testRef.collection('private').doc('answerKey');
      const [testSnap, keySnap] = await Promise.all([tx.get(testRef), tx.get(keyRef)]);
      if (!testSnap.exists || !keySnap.exists) {
        throw new HttpsError('not-found', 'Test or answer key not found.');
      }
      const testData = testSnap.data()!;
      const answerKeyList = (keySnap.data()!.answers || []) as Array<{
        questionId: string;
        correctOptionId: string;
        marks: number;
      }>;
      const studentAnswers = (attempt.answers || {}) as Record<string, string>;

      let marksObtained = 0;
      for (const q of answerKeyList) {
        if (studentAnswers[q.questionId] === q.correctOptionId) {
          marksObtained += Number(q.marks || 0);
        }
      }
      const totalMarks = Number(testData.totalMarks || 1);
      const percentage = Math.round((marksObtained / totalMarks) * 10000) / 100;
      const released =
        testData.resultReleaseMode === 'auto_after_submission' ||
        testData.manualResultsReleased === true;

      tx.update(attemptRef, {
        submittedAt: nowIso,
        evaluatedAt: nowIso,
        marksObtained,
        percentage,
        status: 'evaluated',
        ...(released ? { resultReleasedAt: nowIso } : {}),
      });

      return {
        attemptId,
        status: 'evaluated',
        ...(released ? { marksObtained, percentage, resultReleasedAt: nowIso } : {}),
      };
    });
  }
);

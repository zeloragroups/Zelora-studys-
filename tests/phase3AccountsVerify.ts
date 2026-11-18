import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalDevAuthService, AuthServiceException } from '../src/services/local/localAuthService';
import { AccountServiceError } from '../src/services/contracts/accountService';
import { accountIdGenerator } from '../src/services/accounts/idGeneratorService';
import type { AuthPrincipal } from '../src/types';

async function runPhase3Tests() {
  const store = new LocalAccountStore({ allowFixturesInTest: true, skipPersistence: true });
  const accountService = new LocalDevAccountService(store, true);
  const authService = new LocalDevAuthService({
    isProductionMode: false,
    store,
    skipSessionStorage: true,
  });

  const adminActor = store.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacherActor = store.findAuthPrincipalByLoginId('TCH-0001')!;
  const studentActor = store.findAuthPrincipalByLoginId('STU-0001')!;

  // 1. Authorization checks: Teacher, Student, and unauthenticated callers blocked
  for (const unauthorizedActor of [null, teacherActor, studentActor] as Array<AuthPrincipal | null>) {
    await assert.rejects(
      () => accountService.listAccounts(unauthorizedActor),
      (err: unknown) => err instanceof AccountServiceError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () =>
        accountService.createTeacherAccount(unauthorizedActor, {
          name: 'Blocked Teacher',
          phone: '+91 98111 22222',
          initialPassword: 'Password@123',
          status: 'active',
        }),
      (err: unknown) => err instanceof AccountServiceError && err.code === 'UNAUTHORIZED'
    );
  }

  // 2. Sequential & unique ID generation + Teacher & Student creation
  const nextTeacherPreview = await accountService.previewNextAccountId(adminActor, 'teacher');
  assert.equal(nextTeacherPreview, 'TCH-0002');

  const createdTeacher = await accountService.createTeacherAccount(adminActor, {
    name: 'Vikram Deshmukh',
    phone: '+91 98220 11223',
    email: 'vikram@centre-demo.example',
    initialPassword: 'TeachPass@2026',
    status: 'active',
  });
  assert.equal(createdTeacher.accountId, 'TCH-0002');
  assert.equal(createdTeacher.role, 'teacher');
  assert.equal('password' in createdTeacher, false);

  const createdTeacher2 = await accountService.createTeacherAccount(adminActor, {
    name: 'Meera Iyer',
    phone: '+91 98220 11224',
    initialPassword: 'TeachPass@2026',
    status: 'active',
  });
  assert.equal(createdTeacher2.accountId, 'TCH-0003');

  const createdStudent = await accountService.createStudentAccount(adminActor, {
    name: 'Ananya Sharma',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 33445',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  assert.equal(createdStudent.accountId, 'STU-0002');
  assert.equal(createdStudent.role, 'student');
  assert.equal(createdStudent.classId, 'cls-10');

  // Newly created teacher can sign in on shared portal and auto-route to Teacher
  const newTeacherSession = await authService.signInWithId({
    loginId: 'TCH-0002',
    password: 'TeachPass@2026',
    portalScope: 'member_portal',
  });
  assert.equal(newTeacherSession.principal?.role, 'teacher');
  await authService.signOut();

  // Reject duplicate ID in generator
  const collisionPreview = accountIdGenerator.previewNextId(
    'teacher',
    { teacherNextSequence: 2, studentNextSequence: 2 },
    new Set(['TCH-0002', 'TCH-0003'])
  );
  assert.equal(collisionPreview.accountId, 'TCH-0004');

  // Reject invalid & missing fields
  await assert.rejects(
    () =>
      accountService.createTeacherAccount(adminActor, {
        name: '',
        phone: '123',
        initialPassword: 'short',
        status: 'active',
      }),
    (err: unknown) => err instanceof AccountServiceError && err.code === 'VALIDATION_ERROR'
  );
  await assert.rejects(
    () =>
      accountService.createStudentAccount(adminActor, {
        name: 'Valid Name',
        classId: 'cls-10',
        batchId: 'bat-10a',
        phone: 'invalid-phone',
        initialPassword: 'ValidPassword123',
        status: 'active',
      }),
    (err: unknown) => err instanceof AccountServiceError && err.code === 'VALIDATION_ERROR'
  );

  // 3. Account search
  const foundTeacher = await accountService.searchAccounts(adminActor, 'TCH-0002');
  assert.equal(foundTeacher.length, 1);
  assert.equal(foundTeacher[0].name, 'Vikram Deshmukh');

  const foundStudent = await accountService.searchAccounts(adminActor, 'STU-0002');
  assert.equal(foundStudent.length, 1);

  const emptySearch = await accountService.searchAccounts(adminActor, '   ');
  assert.equal(emptySearch.length, 0);

  await assert.rejects(
    () => accountService.getAccountByAccountId(adminActor, 'STU-9876'),
    (err: unknown) => err instanceof AccountServiceError && err.code === 'NOT_FOUND'
  );

  // 4. Edit account details & immutable field protection
  const updatedTeacher = await accountService.updateAccountDetails(adminActor, 'TCH-0002', {
    name: 'Vikram S. Deshmukh',
    phone: '+91 98220 99999',
    email: 'vikram.s@centre-demo.example',
  });
  assert.equal(updatedTeacher.accountId, 'TCH-0002');
  assert.equal(updatedTeacher.createdAt, createdTeacher.createdAt);
  assert.equal(updatedTeacher.name, 'Vikram S. Deshmukh');

  const updatedStudent = await accountService.updateAccountDetails(adminActor, 'STU-0002', {
    name: 'Ananya K. Sharma',
    phone: '+91 98220 33445',
    classId: 'cls-12',
    batchId: 'bat-12a',
  });
  assert.equal(updatedStudent.classId, 'cls-12');
  assert.equal(updatedStudent.batchId, 'bat-12a');

  await assert.rejects(
    () =>
      accountService.updateAccountDetails(adminActor, 'TCH-0002', {
        name: 'Test',
        phone: '+91 98220 99999',
        accountId: 'TCH-9999',
      } as never),
    (err: unknown) => err instanceof AccountServiceError && err.code === 'IMMUTABLE_FIELD'
  );

  // 5. Deactivate & reactivate + block deactivated sign-in + preserve ID without reuse
  const deactivated = await accountService.deactivateAccount(adminActor, 'TCH-0002');
  assert.equal(deactivated.status, 'deactivated');

  await assert.rejects(
    () =>
      authService.signInWithId({
        loginId: 'TCH-0002',
        password: 'TeachPass@2026',
        portalScope: 'member_portal',
      }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'INACTIVE_ACCOUNT'
  );

  // Next teacher ID must NOT reuse TCH-0002 (must be TCH-0004)
  assert.equal(await accountService.previewNextAccountId(adminActor, 'teacher'), 'TCH-0004');

  const reactivated = await accountService.reactivateAccount(adminActor, 'TCH-0002');
  assert.equal(reactivated.status, 'active');

  const reactivatedSession = await authService.signInWithId({
    loginId: 'TCH-0002',
    password: 'TeachPass@2026',
    portalScope: 'member_portal',
  });
  assert.equal(reactivatedSession.isAuthenticated, true);
  await authService.signOut();

  // 6. Demo Password Reset workflow & zero password leakage
  const resetReceipt = await accountService.initiatePasswordReset(adminActor, 'STU-0002');
  assert.equal(resetReceipt.mode, 'demo_only');
  assert.equal(resetReceipt.notice.includes('DEMO ONLY'), true);
  assert.equal(JSON.stringify(resetReceipt).includes('StudPass@2026'), false);

  const auditEntries = await accountService.getAccountAuditLog(adminActor, 'STU-0002');
  assert.equal(auditEntries.some((e) => e.action === 'password_reset_initiated'), true);
  assert.equal(JSON.stringify(auditEntries).includes('StudPass@2026'), false);

  // 7. Production mode guard without dev fixtures refuses silent fallback
  const prodStore = new LocalAccountStore({ allowFixturesInTest: false, skipPersistence: true });
  const prodAuth = new LocalDevAuthService({
    isProductionMode: true,
    store: prodStore,
    skipSessionStorage: true,
  });
  assert.equal(prodStore.hasAnyDevCredentials(), false);
  await assert.rejects(
    () =>
      prodAuth.signInWithId({
        loginId: 'ADM-0001',
        password: 'Admin@2026',
        portalScope: 'admin_portal',
      }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'UNEXPECTED_ERROR'
  );

  console.log('ALL_PHASE_3_ACCOUNT_MANAGEMENT_ASSERTIONS_PASSED');
}

runPhase3Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});

import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import {
  LocalDevAuthService,
  AuthServiceException,
} from '../src/services/local/localAuthService';
import {
  findRoutePolicy,
  getDefaultRouteForRole,
  ROUTES,
} from '../src/router/routes';

async function runTests() {
  const testStore = new LocalAccountStore({ allowFixturesInTest: true, skipPersistence: true });
  const auth = new LocalDevAuthService({
    isProductionMode: false,
    store: testStore,
    skipSessionStorage: true,
  });

  // 1. Correct Admin credentials
  const adminSession = await auth.signInWithId({
    loginId: 'ADM-0001',
    password: 'Admin@2026',
    portalScope: 'admin_portal',
  });
  assert.equal(adminSession.isAuthenticated, true);
  assert.equal(adminSession.principal?.role, 'admin');
  assert.equal(getDefaultRouteForRole(adminSession.principal!.role), ROUTES.ADMIN_DASHBOARD);
  await auth.signOut();

  // 2. Correct Teacher credentials on shared portal -> automatic Teacher role
  const teacherSession = await auth.signInWithId({
    loginId: 'TCH-0001',
    password: 'Teacher@2026',
    portalScope: 'member_portal',
  });
  assert.equal(teacherSession.principal?.role, 'teacher');
  assert.equal(getDefaultRouteForRole(teacherSession.principal!.role), ROUTES.PORTAL_TEACHER);
  await auth.signOut();

  // 3. Correct Student credentials on shared portal -> automatic Student role
  const studentSession = await auth.signInWithId({
    loginId: 'STU-0001',
    password: 'Student@2026',
    portalScope: 'member_portal',
  });
  assert.equal(studentSession.principal?.role, 'student');
  assert.equal(getDefaultRouteForRole(studentSession.principal!.role), ROUTES.PORTAL_STUDENT);
  await auth.signOut();

  // 4, 5, 6. Incorrect passwords
  for (const [id, portal] of [
    ['ADM-0001', 'admin_portal'],
    ['TCH-0001', 'member_portal'],
    ['STU-0001', 'member_portal'],
  ] as const) {
    await assert.rejects(
      () => auth.signInWithId({ loginId: id, password: 'WrongPassword', portalScope: portal }),
      (err: unknown) =>
        err instanceof AuthServiceException &&
        err.code === 'INCORRECT_PASSWORD' &&
        err.message === 'Password incorrect. Please try again.'
    );
  }

  // 7. Unknown ID
  await assert.rejects(
    () =>
      auth.signInWithId({
        loginId: 'STU-9999',
        password: 'Student@2026',
        portalScope: 'member_portal',
      }),
    (err: unknown) =>
      err instanceof AuthServiceException &&
      err.code === 'INVALID_ID' &&
      err.message === 'Invalid ID. Please check your ID.'
  );

  // 8 & 9. Empty ID and empty password
  await assert.rejects(
    () => auth.signInWithId({ loginId: '   ', password: 'x', portalScope: 'member_portal' }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'EMPTY_ID'
  );
  await assert.rejects(
    () => auth.signInWithId({ loginId: 'TCH-0001', password: '', portalScope: 'member_portal' }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'EMPTY_PASSWORD'
  );

  // 10. Inactive account
  await assert.rejects(
    () =>
      auth.signInWithId({
        loginId: 'STU-0099',
        password: 'Student@2026',
        portalScope: 'member_portal',
      }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'INACTIVE_ACCOUNT'
  );

  // Teacher blocked from Admin Portal login
  await assert.rejects(
    () =>
      auth.signInWithId({
        loginId: 'TCH-0001',
        password: 'Teacher@2026',
        portalScope: 'admin_portal',
      }),
    (err: unknown) => err instanceof AuthServiceException && err.code === 'PORTAL_ROLE_MISMATCH'
  );

  // 11, 12, 13. Route policy cross-role checks
  const adminPolicy = findRoutePolicy(ROUTES.ADMIN_DASHBOARD);
  const teacherPolicy = findRoutePolicy(ROUTES.PORTAL_TEACHER);
  const studentPolicy = findRoutePolicy(ROUTES.PORTAL_STUDENT);
  assert.equal(adminPolicy?.allowedRoles?.includes('teacher'), false);
  assert.equal(teacherPolicy?.allowedRoles?.includes('student'), false);
  assert.equal(studentPolicy?.allowedRoles?.includes('admin'), false);

  // 16 & 17. Session expiry detection & logout
  const validSession = await auth.signInWithId({
    loginId: 'TCH-0001',
    password: 'Teacher@2026',
    portalScope: 'member_portal',
  });
  assert.equal(auth.isSessionExpired(validSession), false);
  assert.equal(
    auth.isSessionExpired({ ...validSession, expiresAtIso: '2020-01-01T00:00:00Z' }),
    true
  );
  await auth.signOut();
  const afterSignOut = await auth.getCurrentSession();
  assert.equal(afterSignOut.isAuthenticated, false);

  // Non-enumerating Forgot Password & Production generic credential errors
  const forgotExisting = await auth.requestForgotPassword({
    loginId: 'STU-0001',
    portalScope: 'member_portal',
  });
  const forgotUnknown = await auth.requestForgotPassword({
    loginId: 'STU-4040',
    portalScope: 'member_portal',
  });
  assert.equal(forgotExisting.message, forgotUnknown.message);

  const prodAuth = new LocalDevAuthService({
    isProductionMode: true,
    store: testStore,
    skipSessionStorage: true,
  });
  await assert.rejects(
    () =>
      prodAuth.signInWithId({
        loginId: 'STU-9999',
        password: 'bad',
        portalScope: 'member_portal',
      }),
    (err: unknown) =>
      err instanceof AuthServiceException &&
      err.code === 'INVALID_CREDENTIALS' &&
      err.message === 'Invalid ID or password. Please check your credentials.'
  );

  console.log('ALL_PHASE_2_AUTH_AND_ROUTING_ASSERTIONS_PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

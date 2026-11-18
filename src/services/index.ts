import {
  validateAndResolveFirebaseConfig,
  type FirebaseConfigValidationResult,
  type FirebaseRuntimeMode,
} from '../lib/firebase/config';

import type { IAcademicManagementService } from './contracts/academicService';
import type { IAccountManagementService } from './contracts/accountService';
import type {
  IAssessmentOverviewService,
  IExaminationMarksService,
  IExaminationService,
  IHomeworkService,
  IHomeworkSubmissionService,
  IObjectiveTestService,
  ITestAttemptService,
  ITestEvaluationService,
} from './contracts/assessmentService';
import type { IAttendanceService } from './contracts/attendanceService';
import type { IAuthService } from './contracts/authService';
import type {
  IFeeConfigurationService,
  IFinancialNotificationService,
  IFinancialReportService,
  IPaymentClaimService,
  IPaymentVerificationService,
  IReceiptService,
  IStudentFeeService,
  ITeacherSalaryService,
} from './contracts/financeService';
import type { IApplicationSettingsService } from './contracts/settingsService';
import type { IStorageService } from './contracts/storageService';
import type { IStudentPortalService } from './contracts/studentPortalService';

import {
  firebaseAcademicService,
} from './firebase/firebaseAcademicService';
import {
  firebaseAccountService,
} from './firebase/firebaseAccountService';
import {
  firebaseAssessmentOverviewService,
  firebaseExaminationService,
  firebaseHomeworkService,
  firebaseHomeworkSubmissionService,
  firebaseObjectiveTestService,
  firebaseTestAttemptService,
} from './firebase/firebaseAssessmentServices';
import {
  firebaseAttendanceService,
} from './firebase/firebaseAttendanceService';
import {
  firebaseAuthService,
} from './firebase/firebaseAuthService';
import {
  firebaseFeeService,
  firebaseFinancialReportService,
  firebasePaymentService,
  firebaseReceiptService,
  firebaseSalaryService,
} from './firebase/firebaseFinanceServices';
import {
  firebaseMigrationService,
  FirebaseMigrationService,
} from './firebase/firebaseMigrationService';
import {
  firebaseSettingsService,
} from './firebase/firebaseSettingsService';
import {
  firebaseStorageService,
} from './firebase/firebaseStorageService';
import {
  firebaseStudentPortalService,
} from './firebase/firebaseStudentPortalService';

import { localAcademicService } from './local/localAcademicService';
import { localAccountService } from './local/localAccountService';
import { localAssessmentService } from './local/localAssessmentService';
import { localAttendanceService } from './local/localAttendanceService';
import { AuthServiceException, localAuthService } from './local/localAuthService';
import { localDevFeeService } from './local/localDevFeeService';
import { localDevFinancialReportService } from './local/localDevFinancialReportService';
import { localDevPaymentService } from './local/localDevPaymentService';
import { localDevReceiptService } from './local/localDevReceiptService';
import { localDevSalaryService } from './local/localDevSalaryService';
import { localExaminationService } from './local/localExaminationService';
import { localHomeworkService } from './local/localHomeworkService';
import { localSettingsService } from './local/localSettingsService';
import {
  APP_SETTINGS_STORAGE_KEY,
  createDefaultApplicationSettings,
  LOCAL_LOGO_NOTICE,
} from './local/localSettingsStore';
import { localStudentPortalService } from './local/localStudentPortalService';
import { localTestService } from './local/localTestService';

import { AccountServiceError } from './contracts/accountService';
import { AcademicServiceError } from './contracts/academicService';
import { AssessmentServiceError } from './contracts/assessmentService';
import { AttendanceServiceError } from './contracts/attendanceService';
import { FinanceServiceError } from './contracts/financeService';
import { SettingsServiceError } from './contracts/settingsService';
import { StudentPortalError } from './contracts/studentPortalService';

export class FirebaseConfigurationError extends Error {
  readonly validationErrors: string[];

  constructor(errors: string[]) {
    super(
      `Firebase configuration error (${errors.join('; ') || 'Invalid configuration'}). Silent local demo fallback is disabled.`
    );
    this.name = 'FirebaseConfigurationError';
    this.validationErrors = errors;
  }
}

export type CombinedHomeworkService = IHomeworkService & IHomeworkSubmissionService;
export type CombinedTestService = IObjectiveTestService & ITestAttemptService & ITestEvaluationService;
export type CombinedExaminationService = IExaminationService & IExaminationMarksService;
export type CombinedFeeService = IFeeConfigurationService &
  IStudentFeeService &
  IFinancialNotificationService;
export type CombinedPaymentService = IPaymentClaimService & IPaymentVerificationService;

export interface ServiceRegistry {
  mode: FirebaseRuntimeMode;
  authService: IAuthService;
  accountService: IAccountManagementService;
  academicService: IAcademicManagementService;
  attendanceService: IAttendanceService;
  assessmentService: IAssessmentOverviewService;
  homeworkService: CombinedHomeworkService;
  testService: CombinedTestService;
  examinationService: CombinedExaminationService;
  feeService: CombinedFeeService;
  paymentService: CombinedPaymentService;
  receiptService: IReceiptService;
  salaryService: ITeacherSalaryService;
  financialReportService: IFinancialReportService;
  settingsService: IApplicationSettingsService;
  studentPortalService: IStudentPortalService;
  storageService: IStorageService;
  migrationService: FirebaseMigrationService;
}

function createConfigurationErrorProxy<T extends object>(
  serviceName: string,
  errors: string[]
): T {
  const throwConfigErr = () => {
    throw new FirebaseConfigurationError([`${serviceName}: ${errors.join('; ')}`]);
  };
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return throwConfigErr;
    },
  });
}

const combinedFirebaseHomeworkService: CombinedHomeworkService = {
  getTeacherScopeResources: (actor) => firebaseHomeworkService.getTeacherScopeResources(actor),
  listTeacherHomework: (actor, filter) =>
    firebaseHomeworkService.listTeacherHomework(actor, filter),
  createHomework: (actor, input) => firebaseHomeworkService.createHomework(actor, input),
  updateHomework: (actor, homeworkId, input) =>
    firebaseHomeworkService.updateHomework(actor, homeworkId, input),
  setHomeworkStatus: (actor, homeworkId, status) =>
    firebaseHomeworkService.setHomeworkStatus(actor, homeworkId, status),
  getTeacherHomeworkRosterAndSubmissions: (actor, homeworkId) =>
    firebaseHomeworkService.getTeacherHomeworkRosterAndSubmissions(actor, homeworkId),
  listStudentHomework: (actor) => firebaseHomeworkSubmissionService.listStudentHomework(actor),
  submitStudentHomework: (actor, homeworkId, responseText) =>
    firebaseHomeworkSubmissionService.submitStudentHomework(actor, homeworkId, responseText),
  reviewHomeworkSubmission: (actor, input) =>
    firebaseHomeworkSubmissionService.reviewHomeworkSubmission(actor, input),
};

const combinedLocalStorageService: IStorageService = {
  isConnected: () => false,
};

export function resolveServiceRegistry(
  validation: FirebaseConfigValidationResult = validateAndResolveFirebaseConfig()
): ServiceRegistry {
  if (validation.mode === 'LOCAL_DEMO') {
    return {
      mode: 'LOCAL_DEMO',
      authService: localAuthService,
      accountService: localAccountService,
      academicService: localAcademicService,
      attendanceService: localAttendanceService,
      assessmentService: localAssessmentService,
      homeworkService: localHomeworkService,
      testService: localTestService,
      examinationService: localExaminationService,
      feeService: localDevFeeService,
      paymentService: localDevPaymentService,
      receiptService: localDevReceiptService,
      salaryService: localDevSalaryService,
      financialReportService: localDevFinancialReportService,
      settingsService: localSettingsService,
      studentPortalService: localStudentPortalService,
      storageService: combinedLocalStorageService,
      migrationService: firebaseMigrationService,
    };
  }

  if (validation.mode === 'FIREBASE_CONFIGURATION_ERROR') {
    const errs = validation.errors;
    return {
      mode: 'FIREBASE_CONFIGURATION_ERROR',
      authService: createConfigurationErrorProxy<IAuthService>('authService', errs),
      accountService: createConfigurationErrorProxy<IAccountManagementService>('accountService', errs),
      academicService: createConfigurationErrorProxy<IAcademicManagementService>('academicService', errs),
      attendanceService: createConfigurationErrorProxy<IAttendanceService>('attendanceService', errs),
      assessmentService: createConfigurationErrorProxy<IAssessmentOverviewService>('assessmentService', errs),
      homeworkService: createConfigurationErrorProxy<CombinedHomeworkService>('homeworkService', errs),
      testService: createConfigurationErrorProxy<CombinedTestService>('testService', errs),
      examinationService: createConfigurationErrorProxy<CombinedExaminationService>('examinationService', errs),
      feeService: createConfigurationErrorProxy<CombinedFeeService>('feeService', errs),
      paymentService: createConfigurationErrorProxy<CombinedPaymentService>('paymentService', errs),
      receiptService: createConfigurationErrorProxy<IReceiptService>('receiptService', errs),
      salaryService: createConfigurationErrorProxy<ITeacherSalaryService>('salaryService', errs),
      financialReportService: createConfigurationErrorProxy<IFinancialReportService>('financialReportService', errs),
      settingsService: createConfigurationErrorProxy<IApplicationSettingsService>('settingsService', errs),
      studentPortalService: createConfigurationErrorProxy<IStudentPortalService>('studentPortalService', errs),
      storageService: createConfigurationErrorProxy<IStorageService>('storageService', errs),
      migrationService: createConfigurationErrorProxy<FirebaseMigrationService>('migrationService', errs),
    };
  }

  return {
    mode: 'FIREBASE_CONNECTED',
    authService: firebaseAuthService,
    accountService: firebaseAccountService,
    academicService: firebaseAcademicService,
    attendanceService: firebaseAttendanceService,
    assessmentService: firebaseAssessmentOverviewService,
    homeworkService: combinedFirebaseHomeworkService,
    testService: firebaseTestAttemptService as unknown as CombinedTestService,
    examinationService: firebaseExaminationService,
    feeService: firebaseFeeService,
    paymentService: firebasePaymentService,
    receiptService: firebaseReceiptService,
    salaryService: firebaseSalaryService,
    financialReportService: firebaseFinancialReportService,
    settingsService: firebaseSettingsService,
    studentPortalService: firebaseStudentPortalService,
    storageService: firebaseStorageService,
    migrationService: firebaseMigrationService,
  };
}

// Wait — note that firebaseTestAttemptService implements ITestAttemptService & ITestEvaluationService,
// while firebaseObjectiveTestService implements IObjectiveTestService!
// Let's combine firebaseObjectiveTestService + firebaseTestAttemptService cleanly below.
const combinedFirebaseTestService: CombinedTestService = {
  listTeacherTests: (actor) => firebaseObjectiveTestService.listTeacherTests(actor),
  createObjectiveTest: (actor, input) => firebaseObjectiveTestService.createObjectiveTest(actor, input),
  updateObjectiveTest: (actor, testId, input) =>
    firebaseObjectiveTestService.updateObjectiveTest(actor, testId, input),
  setObjectiveTestStatus: (actor, testId, status) =>
    firebaseObjectiveTestService.setObjectiveTestStatus(actor, testId, status),
  releaseTestResults: (actor, testId) => firebaseObjectiveTestService.releaseTestResults(actor, testId),
  listTestAttemptsForTeacher: (actor, testId) =>
    firebaseObjectiveTestService.listTestAttemptsForTeacher(actor, testId),
  listStudentAvailableTests: (actor) => firebaseTestAttemptService.listStudentAvailableTests(actor),
  startOrResumeTestAttempt: (actor, testId) =>
    firebaseTestAttemptService.startOrResumeTestAttempt(actor, testId),
  saveTestAttemptAnswer: (actor, attemptId, questionId, optionId) =>
    firebaseTestAttemptService.saveTestAttemptAnswer(actor, attemptId, questionId, optionId),
  getStudentAttemptReviewDetail: (actor, attemptId) =>
    firebaseTestAttemptService.getStudentAttemptReviewDetail(actor, attemptId),
  submitAndEvaluateTestAttempt: (actor, attemptId) =>
    firebaseTestAttemptService.submitAndEvaluateTestAttempt(actor, attemptId),
};

function buildActiveRegistry(): ServiceRegistry {
  const registry = resolveServiceRegistry();
  if (registry.mode === 'FIREBASE_CONNECTED') {
    registry.testService = combinedFirebaseTestService;
  }
  return registry;
}

const activeRegistry = buildActiveRegistry();

export function getActiveServiceMode(): FirebaseRuntimeMode {
  return activeRegistry.mode;
}

export function isFirebaseConnectedMode(): boolean {
  return activeRegistry.mode === 'FIREBASE_CONNECTED';
}

export function isLocalDemoMode(): boolean {
  return activeRegistry.mode === 'LOCAL_DEMO';
}

export const authService = activeRegistry.authService;
export const accountService = activeRegistry.accountService;
export const academicService = activeRegistry.academicService;
export const attendanceService = activeRegistry.attendanceService;
export const assessmentService = activeRegistry.assessmentService;
export const homeworkService = activeRegistry.homeworkService;
export const testService = activeRegistry.testService;
export const examinationService = activeRegistry.examinationService;
export const feeService = activeRegistry.feeService;
export const paymentService = activeRegistry.paymentService;
export const receiptService = activeRegistry.receiptService;
export const salaryService = activeRegistry.salaryService;
export const financialReportService = activeRegistry.financialReportService;
export const settingsService = activeRegistry.settingsService;
export const studentPortalService = activeRegistry.studentPortalService;
export const storageService = activeRegistry.storageService;
export const migrationService = activeRegistry.migrationService;

export {
  firebaseAuthService,
  firebaseSettingsService,
  firebaseMigrationService,
  AuthServiceException,
  AccountServiceError,
  AcademicServiceError,
  AttendanceServiceError,
  AssessmentServiceError,
  FinanceServiceError,
  SettingsServiceError,
  StudentPortalError,
  APP_SETTINGS_STORAGE_KEY,
  createDefaultApplicationSettings,
  LOCAL_LOGO_NOTICE,
};

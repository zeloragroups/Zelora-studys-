import type {
  AccountAuditAction,
  AccountAuditEntry,
  AccountRecord,
  AuthPrincipal,
  ManagedAccountRole,
} from '../../types';
import type { IdCounterState } from '../accounts/idGeneratorService';
import {
  DEMO_CLASS_OPTIONS,
  loadDevAdminSeed,
  loadDevManagedAccountSeeds,
  type DevCredentialSeed,
} from './devAuthFixtures';

/**
 * Shared Local Development Account Store.
 *
 * Security notes:
 * - Passwords are NEVER stored in AccountRecord or persisted to localStorage.
 * - Credentials exist only as non-readable salted verifiers in memory for the current
 *   development session (plus dev seed verifiers in DEV/test environments).
 * - Profile metadata and monotonic ID counters persist cleanly in localStorage in dev mode
 *   so Admin account edits survive page reloads without exposing passwords.
 */

const ACCOUNTS_STORAGE_KEY = 'tuition_ecosystem_dev_accounts_v1';

interface PersistedAccountStoreState {
  accounts: AccountRecord[];
  counters: IdCounterState;
  auditLog: AccountAuditEntry[];
}

function createSimpleVerifier(accountId: string, secret: string): string {
  // Development-only deterministic non-plaintext verifier (not cryptographic production hashing)
  const input = `${accountId.toUpperCase()}::${secret}::dev-local-salt`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `dev-v1:${(h1 >>> 0).toString(16)}:${(h2 >>> 0).toString(16)}`;
}

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class LocalAccountStore {
  private accounts: AccountRecord[] = [];
  private counters: IdCounterState = { teacherNextSequence: 2, studentNextSequence: 2 };
  private auditLog: AccountAuditEntry[] = [];
  private credentialVerifiers = new Map<string, string>();
  private adminSeed: DevCredentialSeed | null = null;
  private allowFixturesInTest: boolean;

  constructor(options?: { allowFixturesInTest?: boolean; skipPersistence?: boolean }) {
    this.allowFixturesInTest = Boolean(options?.allowFixturesInTest);
    this.initialize(Boolean(options?.skipPersistence));
  }

  private initialize(skipPersistence: boolean): void {
    this.adminSeed = loadDevAdminSeed(this.allowFixturesInTest);
    const seeds = loadDevManagedAccountSeeds(this.allowFixturesInTest);

    for (const seed of seeds) {
      this.credentialVerifiers.set(
        seed.account.accountId.toUpperCase(),
        createSimpleVerifier(seed.account.accountId, seed.devSecretKey)
      );
    }

    if (!skipPersistence) {
      const storage = getSafeStorage();
      const raw = storage?.getItem(ACCOUNTS_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedAccountStoreState>;
          if (Array.isArray(parsed.accounts) && parsed.counters && Array.isArray(parsed.auditLog)) {
            this.accounts = parsed.accounts;
            this.counters = parsed.counters;
            this.auditLog = parsed.auditLog;
            return;
          }
        } catch {
          storage?.removeItem(ACCOUNTS_STORAGE_KEY);
        }
      }
    }

    this.accounts = seeds.map((s) => ({ ...s.account }));
    this.counters = {
      teacherNextSequence: 2, // TCH-0001 is seeded; next is TCH-0002
      studentNextSequence: 2, // STU-0001 is seeded; STU-0099 is skipped safely if reached
    };
    this.auditLog = seeds.map((s, idx) => ({
      id: `aud-seed-${idx + 1}`,
      accountId: s.account.accountId,
      action: 'created',
      performedByAdminId: 'ADM-0001',
      timestamp: s.account.createdAt,
      summary: 'Seeded in local development adapter (DEMO DATA).',
    }));
  }

  private persist(skipPersistence = false): void {
    if (skipPersistence) {
      return;
    }
    const storage = getSafeStorage();
    if (!storage) {
      return;
    }
    const payload: PersistedAccountStoreState = {
      accounts: this.accounts,
      counters: this.counters,
      auditLog: this.auditLog,
    };
    storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(payload));
  }

  hasAnyDevCredentials(): boolean {
    return this.adminSeed !== null || this.accounts.length > 0;
  }

  getDemoClassOptions() {
    return DEMO_CLASS_OPTIONS;
  }

  getAllAccounts(): AccountRecord[] {
    return this.accounts.map((acc) => ({ ...acc }));
  }

  getExistingAccountIds(): Set<string> {
    const ids = new Set<string>();
    if (this.adminSeed) {
      ids.add(this.adminSeed.principal.loginId.toUpperCase());
    }
    for (const acc of this.accounts) {
      ids.add(acc.accountId.toUpperCase());
    }
    return ids;
  }

  getCounters(): IdCounterState {
    return { ...this.counters };
  }

  findAccountById(accountId: string): AccountRecord | undefined {
    const normalized = accountId.trim().toUpperCase();
    const match = this.accounts.find((acc) => acc.accountId.toUpperCase() === normalized);
    return match ? { ...match } : undefined;
  }

  findAuthPrincipalByLoginId(loginId: string): AuthPrincipal | undefined {
    const normalized = loginId.trim().toUpperCase();
    if (this.adminSeed && this.adminSeed.principal.loginId.toUpperCase() === normalized) {
      return { ...this.adminSeed.principal };
    }
    const account = this.accounts.find((acc) => acc.accountId.toUpperCase() === normalized);
    if (!account) {
      return undefined;
    }
    return this.toAuthPrincipal(account);
  }

  verifyCredential(loginId: string, password: string): boolean {
    const normalized = loginId.trim().toUpperCase();
    if (this.adminSeed && this.adminSeed.principal.loginId.toUpperCase() === normalized) {
      return this.adminSeed.devSecretKey === password;
    }
    const storedVerifier = this.credentialVerifiers.get(normalized);
    if (!storedVerifier) {
      return false;
    }
    return storedVerifier === createSimpleVerifier(normalized, password);
  }

  insertAccount(
    account: AccountRecord,
    initialPassword: string,
    nextCounters: IdCounterState,
    actorAdminId: string,
    skipPersistence = false
  ): AccountRecord {
    this.accounts = [account, ...this.accounts];
    this.counters = nextCounters;
    this.credentialVerifiers.set(
      account.accountId.toUpperCase(),
      createSimpleVerifier(account.accountId, initialPassword)
    );
    this.appendAudit(
      account.accountId,
      'created',
      actorAdminId,
      `${account.role === 'teacher' ? 'Teacher' : 'Student'} account created (${account.status}).`,
      skipPersistence
    );
    this.persist(skipPersistence);
    return { ...account };
  }

  updateAccount(
    accountId: string,
    updater: (current: AccountRecord) => AccountRecord,
    auditAction: AccountAuditAction,
    actorAdminId: string,
    auditSummary: string,
    skipPersistence = false
  ): AccountRecord | undefined {
    const normalized = accountId.trim().toUpperCase();
    const index = this.accounts.findIndex((acc) => acc.accountId.toUpperCase() === normalized);
    if (index === -1) {
      return undefined;
    }
    const updated = updater({ ...this.accounts[index] });
    this.accounts = [
      ...this.accounts.slice(0, index),
      updated,
      ...this.accounts.slice(index + 1),
    ];
    this.appendAudit(updated.accountId, auditAction, actorAdminId, auditSummary, skipPersistence);
    this.persist(skipPersistence);
    return { ...updated };
  }

  recordPasswordResetInitiation(
    accountId: string,
    actorAdminId: string,
    skipPersistence = false
  ): void {
    this.appendAudit(
      accountId,
      'password_reset_initiated',
      actorAdminId,
      'DEMO ONLY: Password reset initiated by Admin. Requires Firebase Auth in production.',
      skipPersistence
    );
  }

  getAuditLogForAccount(accountId: string): AccountAuditEntry[] {
    const normalized = accountId.trim().toUpperCase();
    return this.auditLog
      .filter((entry) => entry.accountId.toUpperCase() === normalized)
      .map((entry) => ({ ...entry }));
  }

  private appendAudit(
    accountId: string,
    action: AccountAuditAction,
    performedByAdminId: string,
    summary: string,
    skipPersistence = false
  ): void {
    const entry: AccountAuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      accountId,
      action,
      performedByAdminId,
      timestamp: new Date().toISOString(),
      summary,
    };
    this.auditLog = [entry, ...this.auditLog];
    this.persist(skipPersistence);
  }

  toAuthPrincipal(account: AccountRecord): AuthPrincipal {
    const role: ManagedAccountRole = account.role;
    return {
      uid: account.id,
      loginId: account.accountId,
      role,
      fullName: account.name,
      status: account.status,
      sharedWithParent: role === 'student',
      enrolledBatchId: account.batchId,
    };
  }
}

export const sharedLocalAccountStore = new LocalAccountStore();

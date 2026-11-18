import {
  DEFAULT_ID_PREFIX_CONFIG,
  type LoginIdPrefixConfig,
} from '../../utils/validation';
import type { ManagedAccountRole } from '../../types';

export interface IdCounterState {
  teacherNextSequence: number;
  studentNextSequence: number;
}

export interface IdGenerationConfig {
  prefixes: LoginIdPrefixConfig;
  sequenceDigits: number;
}

export const DEFAULT_ID_GENERATION_CONFIG: IdGenerationConfig = {
  prefixes: DEFAULT_ID_PREFIX_CONFIG,
  sequenceDigits: 4,
};

/**
 * Dedicated Account ID Generator Service (Development Adapter).
 *
 * NOTE: This sequential counter is for local development ONLY and is NOT a
 * production-safe distributed ID generator. When Firebase is manually connected,
 * atomic Firestore transactions or server-side counters must enforce uniqueness.
 */
export class AccountIdGeneratorService {
  private readonly config: IdGenerationConfig;

  constructor(config: IdGenerationConfig = DEFAULT_ID_GENERATION_CONFIG) {
    this.config = config;
  }

  getPrefix(role: ManagedAccountRole): string {
    return role === 'teacher'
      ? this.config.prefixes.teacherPrefix
      : this.config.prefixes.studentPrefix;
  }

  formatId(role: ManagedAccountRole, sequence: number): string {
    const prefix = this.getPrefix(role);
    const padded = String(sequence).padStart(this.config.sequenceDigits, '0');
    return `${prefix}-${padded}`;
  }

  isValidGeneratedId(role: ManagedAccountRole, accountId: string): boolean {
    const prefix = this.getPrefix(role).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${prefix}-\\d{${this.config.sequenceDigits},}$`);
    return regex.test(accountId.trim().toUpperCase());
  }

  /**
   * Computes the next unused ID for the requested role without reusing
   * retired/deactivated IDs and guaranteeing zero collision against existingIds.
   */
  previewNextId(
    role: ManagedAccountRole,
    counters: IdCounterState,
    existingIds: ReadonlySet<string>
  ): { accountId: string; sequenceUsed: number } {
    let seq =
      role === 'teacher'
        ? counters.teacherNextSequence
        : counters.studentNextSequence;

    const normalizedExisting = new Set(
      Array.from(existingIds, (id) => id.trim().toUpperCase())
    );

    let candidate = this.formatId(role, seq);
    while (normalizedExisting.has(candidate.toUpperCase())) {
      seq += 1;
      candidate = this.formatId(role, seq);
    }

    if (!this.isValidGeneratedId(role, candidate)) {
      throw new Error(`Generated account ID "${candidate}" failed format validation.`);
    }

    return { accountId: candidate, sequenceUsed: seq };
  }

  /**
   * Reserves the next ID and returns updated monotonic counters so IDs are never reused.
   */
  allocateNextId(
    role: ManagedAccountRole,
    counters: IdCounterState,
    existingIds: ReadonlySet<string>
  ): { accountId: string; nextCounters: IdCounterState } {
    const { accountId, sequenceUsed } = this.previewNextId(role, counters, existingIds);

    const nextCounters: IdCounterState =
      role === 'teacher'
        ? { ...counters, teacherNextSequence: sequenceUsed + 1 }
        : { ...counters, studentNextSequence: sequenceUsed + 1 };

    return { accountId, nextCounters };
  }
}

export const accountIdGenerator = new AccountIdGeneratorService();

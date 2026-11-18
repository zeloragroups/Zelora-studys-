export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface LoginIdPrefixConfig {
  adminPrefix: string;
  teacherPrefix: string;
  studentPrefix: string;
}

export const DEFAULT_ID_PREFIX_CONFIG: LoginIdPrefixConfig = {
  adminPrefix: 'ADM',
  teacherPrefix: 'TCH',
  studentPrefix: 'STU',
};

const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function buildLoginIdPattern(config: LoginIdPrefixConfig = DEFAULT_ID_PREFIX_CONFIG): RegExp {
  const prefixes = [config.adminPrefix, config.teacherPrefix, config.studentPrefix]
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`^(${prefixes})-[A-Z0-9]{3,12}$`, 'i');
}

export function validateLoginId(
  value: string,
  config: LoginIdPrefixConfig = DEFAULT_ID_PREFIX_CONFIG
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'Account ID is required.' };
  }
  const pattern = buildLoginIdPattern(config);
  if (!pattern.test(trimmed)) {
    return {
      valid: false,
      error: `Use format ${config.adminPrefix}-0001, ${config.teacherPrefix}-0001, or ${config.studentPrefix}-0001.`,
    };
  }
  return { valid: true };
}

export function validatePasswordInput(value: string): ValidationResult {
  if (!value) {
    return { valid: false, error: 'Password is required.' };
  }
  return { valid: true };
}

export function validateInitialPassword(value: string): ValidationResult {
  if (!value) {
    return { valid: false, error: 'Initial password is required.' };
  }
  if (value.length < 8) {
    return { valid: false, error: 'Initial password must be at least 8 characters.' };
  }
  return { valid: true };
}

export function validatePersonName(value: string, label = 'Full name'): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: `${label} must be at least 2 characters.` };
  }
  return { valid: true };
}

export function validateRequiredText(value: string, label = 'Field', minLen = 2): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length < minLen) {
    return { valid: false, error: `${label} must be at least ${minLen} characters.` };
  }
  return { valid: true };
}

export function validateTimeRange(startTime: string, endTime: string): ValidationResult {
  if (!TIME_24H_PATTERN.test(startTime.trim())) {
    return { valid: false, error: 'Start time must use 24-hour HH:MM format.' };
  }
  if (!TIME_24H_PATTERN.test(endTime.trim())) {
    return { valid: false, error: 'End time must use 24-hour HH:MM format.' };
  }
  if (startTime.trim() >= endTime.trim()) {
    return { valid: false, error: 'End time must be later than start time.' };
  }
  return { valid: true };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateIsoDate(value: string, label = 'Attendance date'): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return { valid: false, error: `${label} must use YYYY-MM-DD format.` };
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { valid: false, error: `${label} is not a valid calendar date.` };
  }
  return { valid: true };
}

export function validatePhoneNumber(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'Phone number is required.' };
  }
  const digitsOnly = trimmed.replace(/[\s\-()+]/g, '');
  if (!/^\d{10,15}$/.test(digitsOnly)) {
    return { valid: false, error: 'Enter a valid 10 to 15 digit phone number.' };
  }
  return { valid: true };
}

export function validateOptionalEmail(value?: string): ValidationResult {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return { valid: true };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true };
}

export function validateUpiId(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'UPI ID is required.' };
  }
  if (!UPI_ID_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Enter a valid UPI ID (e.g., centre@bank).' };
  }
  return { valid: true };
}

export function validatePositiveAmount(amount: number, label = 'Amount'): ValidationResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: `${label} must be greater than zero.` };
  }
  return { valid: true };
}

export function validateTransactionReference(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'UPI Transaction Reference / UTR is required.' };
  }
  if (trimmed.length < 6 || trimmed.length > 64) {
    return {
      valid: false,
      error: 'Transaction reference / UTR must be between 6 and 64 characters.',
    };
  }
  if (!/^[a-zA-Z0-9._:/-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Transaction reference contains unsupported characters.',
    };
  }
  return { valid: true };
}

export function validateMonthlyPeriod(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    return { valid: false, error: 'Monthly period must use YYYY-MM format (e.g., 2026-11).' };
  }
  return { valid: true };
}

export function validateYearlyPeriod(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!/^(\d{4}|\d{4}-\d{4})$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Yearly period must use YYYY or YYYY-YYYY format (e.g., 2026-2027).',
    };
  }
  return { valid: true };
}


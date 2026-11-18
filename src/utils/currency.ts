/**
 * Integer-paise currency utilities (INR).
 * All internal financial calculations strictly use integer paise to prevent
 * IEEE-754 floating-point drift, converting to rupees only for display and UPI URI generation.
 */

export function rupeesToPaise(value: number | string): number {
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isFinite(num)) {
    return NaN;
  }
  const rounded = Math.round(num * 100);
  if (!Number.isSafeInteger(rounded)) {
    return NaN;
  }
  return rounded;
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function paiseToUpiAmountString(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}

export function formatInrFromPaise(paise: number): string {
  const safe = Number.isFinite(paise) ? Math.round(paise) : 0;
  const rupees = safe / 100;
  const hasFraction = safe % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatPeriodLabel(period: string): string {
  const trimmed = period.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [yearStr, monthStr] = trimmed.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const dt = new Date(Date.UTC(year, month - 1, 1));
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(dt);
    }
  }
  if (/^\d{4}-\d{4}$/.test(trimmed)) {
    return `Academic Year ${trimmed}`;
  }
  if (/^\d{4}$/.test(trimmed)) {
    return `Year ${trimmed}`;
  }
  return trimmed;
}

export function computeMonthlyDueDate(periodYYYYMM: string, dueDayOfMonth: number): string {
  const [yStr, mStr] = periodYYYYMM.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const clampedDay = Math.max(1, Math.min(28, Math.floor(dueDayOfMonth)));
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

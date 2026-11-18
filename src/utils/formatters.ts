export function formatCurrency(amount: number, symbol = '₹'): string {
  return `${symbol}${new Intl.NumberFormat('en-IN').format(amount)}`;
}

export function formatShortDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function generateRolePrefixId(role: 'admin' | 'teacher' | 'student', sequence: number): string {
  const prefix = role === 'admin' ? 'ADM' : role === 'teacher' ? 'TCH' : 'STU';
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function formatDateTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

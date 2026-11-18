import type { AttendanceStatus, AttendanceSummaryStats } from '../types';

/**
 * Canonical Phase 5 Attendance Percentage Calculation:
 *
 *   Attendance % = (Present + Late) / (Present + Absent + Late) × 100
 *
 * Rules:
 * - Present counts as attended.
 * - Late counts as attended.
 * - Absent counts in the denominator as not attended.
 * - Excused is excluded from the denominator.
 * - If (Present + Absent + Late) === 0, percentage is null and displayPercentage is "Not available".
 */
export function calculateAttendanceSummary(
  statuses: ReadonlyArray<AttendanceStatus>
): AttendanceSummaryStats {
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  for (const status of statuses) {
    if (status === 'present') presentCount += 1;
    else if (status === 'absent') absentCount += 1;
    else if (status === 'late') lateCount += 1;
    else if (status === 'excused') excusedCount += 1;
  }

  const totalSessions = statuses.length;
  const attendedCount = presentCount + lateCount;
  const eligibleDenominator = presentCount + absentCount + lateCount;

  if (eligibleDenominator === 0) {
    return {
      totalSessions,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendedCount,
      eligibleDenominator: 0,
      percentage: null,
      displayPercentage: 'Not available',
    };
  }

  const raw = (attendedCount / eligibleDenominator) * 100;
  const rounded = Math.round(raw * 10) / 10;
  const formatted = Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;

  return {
    totalSessions,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendedCount,
    eligibleDenominator,
    percentage: rounded,
    displayPercentage: formatted,
  };
}

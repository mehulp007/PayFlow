/**
 * Leave rules. Annual leave with wages follows the Occupational Safety, Health and Working Conditions Code,
 * 2020, s. 32 (in force from 21 November 2025): a worker who has worked 180 days or more in a calendar year
 * earns one day of leave for every 20 days worked, taken in the following year, and may carry forward up to
 * 30 days. The weekly rest day is Sunday.
 */
export const EARNED_LEAVE_RULE = {
  qualifyingDays: 180,
  daysWorkedPerLeaveDay: 20,
  carryForwardLimit: 30,
} as const;

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Days from `from` to `to` inclusive, not counting Sundays (the weekly rest day). */
export function leaveDays(from: string, to: string): number {
  let days = 0;
  for (let time = toTime(from); time <= toTime(to); time += DAY_MS) {
    if (new Date(time).getUTCDay() !== 0) days++;
  }
  return days;
}

/** The part of a leave period that falls inside a calendar month, in leave days. */
export function leaveDaysInMonth(from: string, to: string, year: number, month: number): number {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = toDate(Date.UTC(year, month, 0));
  const overlapFrom = from > start ? from : start;
  const overlapTo = to < end ? to : end;
  return overlapFrom > overlapTo ? 0 : leaveDays(overlapFrom, overlapTo);
}

/**
 * Earned leave available in `year`, accrued from days worked in the previous calendar year. Days worked are
 * the working days (Monday to Saturday) the person was employed; unpaid absences are not tracked here.
 */
export function earnedLeaveEntitlement(
  person: { joinDate: string; exitDate?: string | null },
  year: number,
): { daysWorked: number; qualifies: boolean; days: number } {
  const from = person.joinDate > `${year - 1}-01-01` ? person.joinDate : `${year - 1}-01-01`;
  const lastDay = `${year - 1}-12-31`;
  const to = person.exitDate && person.exitDate < lastDay ? person.exitDate : lastDay;
  const daysWorked = from > to ? 0 : leaveDays(from, to);
  const qualifies = daysWorked >= EARNED_LEAVE_RULE.qualifyingDays;
  return {
    daysWorked,
    qualifies,
    days: qualifies ? Math.floor(daysWorked / EARNED_LEAVE_RULE.daysWorkedPerLeaveDay) : 0,
  };
}

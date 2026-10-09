import type { Money } from './types.js';

const R = (rupees: number): Money => rupees * 100;
export const roundRupee = (paise: number): Money => Math.round(paise / 100) * 100;
const ceilRupee = (paise: number): Money => Math.ceil(Math.round(paise) / 100) * 100;

// ---------------------------------------------------------------------------
// Wages — Code on Wages, 2019, s. 2(y), in force from 21 November 2025
// ---------------------------------------------------------------------------

export interface WageComponents {
  basic: Money;
  hra: Money;
  special: Money;
  variablePay: Money;
}

/**
 * "Wages" for PF, ESI and gratuity. HRA and bonus/commission-type pay are excluded, but the excluded
 * heads in clauses (a)–(i) may not exceed 50% of total remuneration; any excess is added back.
 * Special allowance is not an excluded head, so it is treated as wages.
 */
export function statutoryWages(pay: WageComponents): Money {
  const total = pay.basic + pay.hra + pay.special + pay.variablePay;
  const included = pay.basic + pay.special;
  const excluded = pay.hra + pay.variablePay;
  const addBack = Math.max(0, excluded - total / 2);
  return Math.round(included + addBack);
}

// ---------------------------------------------------------------------------
// EPF, EPS and EDLI — Code on Social Security, 2020 and EPFO schemes
// ---------------------------------------------------------------------------

/** Wage ceiling history. S.O. 5109(E) raised it to ₹25,000 from 17 September 2026. */
export const EPF_WAGE_CEILINGS: ReadonlyArray<{ from: string; ceiling: Money }> = [
  { from: '2014-09-01', ceiling: R(15000) },
  { from: '2026-09-17', ceiling: R(25000) },
];
export const EPF_RATES = {
  employee: 0.12,
  employer: 0.12,
  eps: 0.0833,
  edli: 0.005,
  adminCharges: 0.005,
} as const;
/** EPS membership ends on the date a member turns 58; the employer's full 12% then goes to EPF. */
export const EPS_EXIT_AGE = 58;

export function epfWageCeilingOn(date: string): Money {
  let ceiling = EPF_WAGE_CEILINGS[0].ceiling;
  for (const step of EPF_WAGE_CEILINGS) if (date >= step.from) ceiling = step.ceiling;
  return ceiling;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
export const monthEnd = (year: number, month: number) => `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

function addYears(date: string, years: number): string {
  return `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
}

interface Segment {
  from: string;
  days: number;
  ceiling: Money;
  epsAllowed: boolean;
}

/**
 * Splits a wage month wherever the ceiling changes or the member turns 58, as EPFO requires for
 * September 2026 (1–16 Sep on ₹15,000, 17–30 Sep on ₹25,000).
 */
function epfSegments(year: number, month: number, dateOfBirth: string): Segment[] {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const turns58 = addYears(dateOfBirth, EPS_EXIT_AGE);
  const cuts = new Set<string>([start]);
  for (const step of EPF_WAGE_CEILINGS) if (step.from > start && step.from <= end) cuts.add(step.from);
  if (turns58 > start && turns58 <= end) cuts.add(turns58);
  const ordered = [...cuts].sort();
  return ordered.map((from, index) => {
    const nextDay = index + 1 < ordered.length ? Number(ordered[index + 1].slice(8)) : daysInMonth(year, month) + 1;
    return { from, days: nextDay - Number(from.slice(8)), ceiling: epfWageCeilingOn(from), epsAllowed: from < turns58 };
  });
}

export interface EpfResult {
  pfWages: Money;
  epsWages: Money;
  edliWages: Money;
  employee: Money;
  employerEpf: Money;
  employerEps: Money;
  edli: Money;
  adminCharges: Money;
}

export function calculateEpf(args: {
  wages: Money;
  year: number;
  month: number;
  dateOfBirth: string;
  member: boolean;
  epsMember: boolean;
  onActualWages: boolean;
}): EpfResult {
  const none = {
    pfWages: 0,
    epsWages: 0,
    edliWages: 0,
    employee: 0,
    employerEpf: 0,
    employerEps: 0,
    edli: 0,
    adminCharges: 0,
  };
  if (!args.member || args.wages <= 0) return none;
  const totalDays = daysInMonth(args.year, args.month);
  let pfWages = 0;
  let epsWages = 0;
  let edliWages = 0;
  for (const segment of epfSegments(args.year, args.month, args.dateOfBirth)) {
    const share = segment.days / totalDays;
    const segmentWages = args.wages * share;
    const segmentCeiling = segment.ceiling * share;
    const capped = Math.min(segmentWages, segmentCeiling);
    pfWages += args.onActualWages ? segmentWages : capped;
    edliWages += capped;
    if (args.epsMember && segment.epsAllowed) epsWages += capped;
  }
  const employee = roundRupee(pfWages * EPF_RATES.employee);
  const employerEps = roundRupee(epsWages * EPF_RATES.eps);
  return {
    pfWages: roundRupee(pfWages),
    epsWages: roundRupee(epsWages),
    edliWages: roundRupee(edliWages),
    employee,
    employerEps,
    employerEpf: Math.max(0, roundRupee(pfWages * EPF_RATES.employer) - employerEps),
    edli: roundRupee(edliWages * EPF_RATES.edli),
    adminCharges: roundRupee(pfWages * EPF_RATES.adminCharges),
  };
}

// ---------------------------------------------------------------------------
// ESI — ESI (Central) Rules, 1950, rules 50–51, read with the Code on Social Security, 2020
// ---------------------------------------------------------------------------

export const ESI_WAGE_CEILING: Money = R(21000);
export const ESI_RATES = { employee: 0.0075, employer: 0.0325 } as const;
/** Employees with average daily wages up to ₹176 pay no employee share (the employer still pays). */
export const ESI_LOW_WAGE_DAILY_LIMIT: Money = R(176);

/** Coverage is decided on wages at the start of each contribution period (April–September, October–March). */
export function esiCoveredForPeriod(monthlyWages: Money): boolean {
  return monthlyWages <= ESI_WAGE_CEILING;
}
export function esiContributionPeriod(month: number): 'Apr–Sep' | 'Oct–Mar' {
  return month >= 4 && month <= 9 ? 'Apr–Sep' : 'Oct–Mar';
}

export interface EsiResult {
  wages: Money;
  employee: Money;
  employer: Money;
  continuedAboveCeiling: boolean;
}

/**
 * A member covered at the start of the contribution period keeps contributing on actual wages until it
 * ends, even if wages rise above the ceiling. Contributions are rounded up to the next rupee (rule 51).
 */
export function calculateEsi(args: { wages: Money; covered: boolean; paidDays: number }): EsiResult {
  if (!args.covered || args.wages <= 0) return { wages: 0, employee: 0, employer: 0, continuedAboveCeiling: false };
  const dailyAverage = args.paidDays > 0 ? args.wages / args.paidDays : 0;
  const lowWage = dailyAverage <= ESI_LOW_WAGE_DAILY_LIMIT;
  return {
    wages: args.wages,
    employee: lowWage ? 0 : ceilRupee(args.wages * ESI_RATES.employee),
    employer: ceilRupee(args.wages * ESI_RATES.employer),
    continuedAboveCeiling: args.wages > ESI_WAGE_CEILING,
  };
}

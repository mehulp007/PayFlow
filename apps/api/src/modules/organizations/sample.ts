import { randomUUID } from 'node:crypto';
import { leaveDays } from '@payflow/core';
import { POSITION_LEVELS, type Branch, type EmploymentType, type LeaveType, type PayGroup } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { employees, leaveBalances, leaveRequests, salaryRevisions, taxDeclarations } from '../../db/schema.js';
import { EPS_WAGE_LIMIT, ESI_WAGE_LIMIT } from '../employees/service.js';
import { approveRun, calculateRun, closeRun, createRun, markPaid, submitRun } from '../runs/service.js';

/**
 * Sample companies are anchored to the reviewed tax year: approved history from April to September 2026
 * and an open October 2026 run, whatever today's date is.
 */
export const SAMPLE_CURRENT_PERIOD = { year: 2026, month: 10, paymentDate: '2026-10-31' } as const;
const HISTORY_MONTHS = [4, 5, 6, 7, 8, 9];
/** People who join on the first day of the current period without bank details: the run's blocking exceptions. */
export const SAMPLE_NEW_JOINERS = 12;
const MIN_SIZE = 60;

const FEMALE = [
  'Ananya',
  'Diya',
  'Ishita',
  'Kavya',
  'Meera',
  'Nisha',
  'Pooja',
  'Riya',
  'Sana',
  'Tanvi',
  'Aditi',
  'Bhavna',
  'Charu',
  'Divya',
  'Fatima',
  'Gauri',
  'Harini',
  'Isha',
  'Jyoti',
  'Kritika',
  'Lakshmi',
  'Madhuri',
  'Neha',
  'Pallavi',
  'Radhika',
  'Shreya',
  'Swati',
  'Uma',
  'Vaishnavi',
  'Zoya',
];
const MALE = [
  'Aarav',
  'Arjun',
  'Dev',
  'Ishaan',
  'Kabir',
  'Nikhil',
  'Pranav',
  'Rahul',
  'Sahil',
  'Vikram',
  'Abhishek',
  'Aniket',
  'Deepak',
  'Farhan',
  'Gaurav',
  'Harsh',
  'Imran',
  'Karan',
  'Manish',
  'Naveen',
  'Omkar',
  'Prakash',
  'Rohit',
  'Sandeep',
  'Suresh',
  'Tarun',
  'Varun',
  'Vivek',
  'Yash',
  'Zubin',
];
const SURNAMES = [
  'Sharma',
  'Iyer',
  'Mehta',
  'Das',
  'Shaikh',
  'Reddy',
  'Nair',
  'Gupta',
  'Banerjee',
  'Kulkarni',
  'Patel',
  'Rao',
  'Singh',
  'Menon',
  'Chatterjee',
  'Joshi',
  'Pillai',
  'Verma',
  'Ghosh',
  'Desai',
  'Krishnan',
  'Bose',
  'Kapoor',
  'Naidu',
  'Mukherjee',
  'Chauhan',
  'Hegde',
  'Saxena',
  'Pandey',
  'Fernandes',
  'Malhotra',
  'Bhat',
  'Sinha',
  'Agarwal',
  'Kumar',
  'Shetty',
  'Mishra',
  'Dutta',
  'Thakur',
  'Varghese',
];
const FIXED_PEOPLE: Record<number, [string, 'female' | 'male']> = {
  1: ['Aarav Kumar', 'male'],
  2: ['Sneha Iyer', 'female'],
  3: ['Rohan Mehta', 'male'],
  4: ['Priya Das', 'female'],
  5: ['Meera Shaikh', 'female'],
};
const DEPARTMENTS = ['Operations', 'Technology', 'Sales', 'Finance', 'People'];
const LEVEL_FACTOR = [1, 1.4, 1.8, 2.6, 3.6, 5, 7, 10];

/** Knuth's multiplicative hash, so people near each other in the hierarchy get unrelated names. */
const hash = (n: number) => Number((BigInt(n) * 2654435761n) % 4294967296n);
const code = (n: number) => `EMP${String(n).padStart(5, '0')}`;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const roundHundred = (rupees: number) => Math.round(rupees / 100) * 100;

/** An 8-level pyramid: one Managing Director (EMP00008), then VPs, Directors and so on down to Associates. */
function levelOf(n: number): number {
  if (n === 8) return 8;
  if (n % 1000 === 16) return 7;
  if (n % 500 === 24) return 6;
  if (n % 250 === 32) return 5;
  if (n % 100 === 40) return 4;
  if (n === 48 || n % 20 === 0) return 3;
  return n % 4 === 0 ? 2 : 1;
}
const MANAGER_BY_LEVEL: Record<number, number | null> = { 8: null, 7: 8, 6: 16, 5: 24, 4: 32, 3: 40, 2: 48, 1: 48 };

function employmentTypeOf(n: number, level: number): EmploymentType {
  if (level >= 4) return 'permanent';
  if (n % 17 === 0) return 'contractor';
  if (n % 13 === 0) return 'casual';
  if (n % 11 === 0) return 'fixed_term';
  return n % 7 === 0 ? 'probation' : 'permanent';
}

/** Monthly salary in rupees. Casual support staff earn within the ESI ceiling. */
function salaryOf(n: number, level: number, type: EmploymentType) {
  if (type === 'contractor') return { basic: 0, hra: 0, special: 0 };
  if (type === 'casual') return { basic: 11000 + (n % 5) * 1000, hra: 3000, special: 2000 };
  const factor = LEVEL_FACTOR[level - 1];
  return {
    basic: roundHundred((18000 + (n % 11) * 4000) * factor),
    hra: roundHundred((9000 + (n % 7) * 2000) * factor),
    special: roundHundred((7000 + (n % 9) * 3000) * factor),
  };
}

const SAMPLE_DECIDER = 'Sample HR';

/**
 * A year of leave for one person: carried-forward earned leave, approved leave in past months (unpaid leave in
 * July is deducted in July's run), and October requests: some approved, some waiting for HR.
 */
function sampleLeave(
  n: number,
  employeeId: string,
  joinDate: string,
  organizationId: string,
  leave: Array<typeof leaveRequests.$inferInsert>,
  balances: Array<typeof leaveBalances.$inferInsert>,
) {
  if (joinDate < '2025-01-01' && n % 4) {
    balances.push({ organizationId, employeeId, year: 2026, carriedForward: (n % 4) * 5 });
  }
  const add = (type: LeaveType, from: string, to: string, status: 'approved' | 'pending', reason: string) => {
    if (from < joinDate) return;
    leave.push({
      organizationId,
      employeeId,
      type,
      fromDate: from,
      toDate: to,
      days: leaveDays(from, to),
      reason,
      status,
      decidedBy: status === 'approved' ? SAMPLE_DECIDER : null,
      decidedAt: status === 'approved' ? `${from}T09:00:00Z` : null,
    });
  };
  // Earned leave needs 180 days worked in 2025 (OSH Code s. 32).
  const earnedLeave = joinDate < '2025-06-01';
  if (n === 1) add('earned', '2026-05-11', '2026-05-12', 'approved', 'Family function');
  if (earnedLeave && n % 5 === 1 && n > 1) add('earned', '2026-06-08', '2026-06-10', 'approved', 'Vacation');
  if (n % 7 === 3) add('sick', '2026-08-17', '2026-08-18', 'approved', 'Fever');
  if (n % 23 === 5) add('unpaid', '2026-07-13', '2026-07-14', 'approved', 'Personal work');
  if (n % 29 === 7) add('unpaid', '2026-10-12', '2026-10-13', 'approved', 'Travel home');
  if (earnedLeave && n % 31 === 2) add('earned', '2026-10-19', '2026-10-21', 'pending', 'Diwali with family');
  if (n % 37 === 11) add('unpaid', '2026-10-26', '2026-10-27', 'pending', 'Moving house');
}

/** An old-regime declaration (Form 124): savings for everyone, rent and health cover for some. */
function sampleDeclaration(
  n: number,
  employeeId: string,
  organizationId: string,
  monthlyHraRupees: number,
  branch: Branch,
): typeof taxDeclarations.$inferInsert {
  const rents = n % 12 === 0;
  const monthlyRent = rents ? roundHundred(monthlyHraRupees * 1.1) * 100 : 0;
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return {
    organizationId,
    employeeId,
    taxYear: 2026,
    data: {
      monthlyRent,
      rentCity: rents ? branch.name : null,
      landlordPan: monthlyRent * 12 > 100000_00 ? `AFKP${letters[n % 24]}${String(1000 + (n % 9000))}Z` : null,
      landlordRelation: null,
      section123: (n % 12 === 0 ? 150000 : 90000) * 100,
      npsAdditional: n % 24 === 0 ? 50000_00 : 0,
      healthSelf: n % 18 === 0 ? 25000_00 : 0,
      healthParents: n % 36 === 0 ? 50000_00 : 0,
      parentsSenior: n % 36 === 0,
      homeLoanInterest: 0,
    },
    status: n % 30 === 0 ? 'submitted' : 'verified',
    verifiedBy: n % 30 === 0 ? null : SAMPLE_DECIDER,
    verifiedAt: n % 30 === 0 ? null : '2026-05-15T09:00:00Z',
  };
}

export interface SampleOptions {
  size: number;
  history: boolean;
  branches: Branch[];
  payGroups: PayGroup[];
  emailDomain: string;
  /** Accounts that prepare and approve the historical runs (maker-checker holds for history too). */
  actors: { preparer: string; approver: string };
}

/** Generates the people, salary history and pay runs of a sample company. Returns EMP00001's key. */
export async function seedSampleCompany(db: Db, organizationId: string, options: SampleOptions): Promise<string> {
  if (options.size < MIN_SIZE) throw new Error(`A sample company needs at least ${MIN_SIZE} people`);
  const keys = new Map<number, string>();
  for (let n = 1; n <= options.size; n++) keys.set(n, randomUUID());
  const firstNewJoiner = options.size - SAMPLE_NEW_JOINERS + 1;
  const people: Array<typeof employees.$inferInsert> = [];
  const revisions: Array<typeof salaryRevisions.$inferInsert> = [];
  const leave: Array<typeof leaveRequests.$inferInsert> = [];
  const balances: Array<typeof leaveBalances.$inferInsert> = [];
  const declarations: Array<typeof taxDeclarations.$inferInsert> = [];

  for (let n = 1; n <= options.size; n++) {
    const level = levelOf(n);
    const newJoiner = n >= firstNewJoiner;
    const type: EmploymentType = newJoiner ? 'probation' : employmentTypeOf(n, level);
    const pay = salaryOf(n, level, type);
    const inPayroll = type !== 'contractor';
    const gender = FIXED_PEOPLE[n]?.[1] ?? (n % 2 === 0 ? 'female' : 'male');
    const firstNames = gender === 'female' ? FEMALE : MALE;
    const name =
      FIXED_PEOPLE[n]?.[0] ??
      `${firstNames[hash(n) % firstNames.length]} ${SURNAMES[Math.floor(hash(n) / 64) % SURNAMES.length]}`;
    const joinDate = newJoiner ? '2026-10-01' : addDays('2015-04-01', (n * 53) % 3400);
    const wages = (pay.basic + pay.special) * 100;
    const managerNumber = MANAGER_BY_LEVEL[level];
    const id = keys.get(n)!;
    people.push({
      id,
      organizationId,
      code: code(n),
      name,
      gender,
      branchId: options.branches[n % options.branches.length].id,
      payGroupId: (options.payGroups.length > 1 && n % 8 === 0 ? options.payGroups[1] : options.payGroups[0]).id,
      joinDate,
      dateOfBirth: addDays('1970-01-01', (n * 397) % 9500),
      bankAccountLast4: newJoiner || !inPayroll ? null : String(1000 + (n % 9000)).padStart(4, '0'),
      bankReady: inPayroll && !newJoiner,
      monthlyBasic: pay.basic * 100,
      monthlyHra: pay.hra * 100,
      monthlySpecial: pay.special * 100,
      taxRegime: n % 6 === 0 ? 'old' : 'new',
      pfMember: inPayroll,
      epsMember: inPayroll && wages <= EPS_WAGE_LIMIT,
      esiMember: inPayroll && wages <= ESI_WAGE_LIMIT,
      employmentType: type,
      positionLevel: level,
      jobTitle: POSITION_LEVELS[level - 1].label,
      department: DEPARTMENTS[n % DEPARTMENTS.length],
      managerId: managerNumber ? keys.get(managerNumber)! : null,
      workEmail: `emp${String(n).padStart(5, '0')}@${options.emailDomain}`,
      payrollScope: inPayroll,
    });
    if (!inPayroll) continue;
    if (!newJoiner) sampleLeave(n, id, joinDate, organizationId, leave, balances);
    if (n % 6 === 0) {
      declarations.push(
        sampleDeclaration(n, id, organizationId, pay.hra, options.branches[n % options.branches.length]),
      );
    }
    const salary = { monthlyBasic: pay.basic * 100, monthlyHra: pay.hra * 100, monthlySpecial: pay.special * 100 };
    const joinMonth = `${joinDate.slice(0, 7)}-01`;
    if (joinMonth < '2026-04-01') {
      // Joined earlier: a starting salary, then this year's increment from April.
      revisions.push({
        organizationId,
        employeeId: id,
        effectiveFrom: joinMonth,
        monthlyBasic: roundHundred(pay.basic * 0.9) * 100,
        monthlyHra: roundHundred(pay.hra * 0.9) * 100,
        monthlySpecial: roundHundred(pay.special * 0.9) * 100,
        reason: 'Joining salary',
      });
      revisions.push({
        organizationId,
        employeeId: id,
        effectiveFrom: '2026-04-01',
        ...salary,
        reason: 'Annual increment',
      });
    } else {
      revisions.push({ organizationId, employeeId: id, effectiveFrom: joinMonth, ...salary, reason: 'Joining salary' });
    }
  }

  for (let offset = 0; offset < people.length; offset += 500) {
    await db.insert(employees).values(people.slice(offset, offset + 500));
  }
  for (const [table, rows] of [
    [salaryRevisions, revisions],
    [leaveRequests, leave],
    [leaveBalances, balances],
    [taxDeclarations, declarations],
  ] as const) {
    for (let offset = 0; offset < rows.length; offset += 500) {
      await db.insert(table).values(rows.slice(offset, offset + 500) as never);
    }
  }

  if (options.history) {
    for (const month of HISTORY_MONTHS) {
      const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
      const run = await createRun(db, organizationId, {
        year: 2026,
        month,
        paymentDate: `2026-${String(month).padStart(2, '0')}-${lastDay}`,
        payGroupId: null,
      });
      await calculateRun(db, organizationId, run.id);
      await submitRun(db, organizationId, run.id, options.actors.preparer);
      await approveRun(db, organizationId, run.id, options.actors.approver);
      await markPaid(db, organizationId, run.id);
      await closeRun(db, organizationId, run.id);
    }
  }
  await createRun(db, organizationId, { ...SAMPLE_CURRENT_PERIOD, payGroupId: null });
  return keys.get(1)!;
}

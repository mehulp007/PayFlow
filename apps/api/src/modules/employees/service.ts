import { and, asc, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { EmployeePayrollProfile, TaxDeclaration } from '@payflow/core';
import {
  EMPLOYMENT_TYPES,
  POSITION_LEVELS,
  TOP_POSITION_LEVEL,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeListQuery,
  type EmploymentType,
  type Gender,
  type HierarchySummary,
  type ManagerOption,
  type Page,
  type SalaryRevision,
  type UpdateEmployeeBody,
} from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import { branches, employees, leaveBalances, payGroups, payrollInputs, salaryRevisions } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { Principal } from '../auth/service.js';
import { leaveSnapshot, unpaidLeaveByEmployee } from '../leave/service.js';
import { latestLockedPeriod, latestRun, prorationDays, type RunRow } from '../runs/service.js';

export type EmployeeRow = typeof employees.$inferSelect;
const manager = alias(employees, 'manager');
/** EPS membership needs PF wages within the ₹25,000 ceiling at joining (S.O. 5109(E), 17 September 2026). */
export const EPS_WAGE_LIMIT = 25000_00;
/** ESI coverage is decided on wages within ₹21,000 at the start of a contribution period. */
export const ESI_WAGE_LIMIT = 21000_00;

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;

type Joined = {
  employee: EmployeeRow;
  branchName: string;
  state: string;
  payGroupName: string;
  managerCode: string | null;
  managerName: string | null;
  workingDays: number | null;
  unpaidDays: number | null;
};

/** Leave facts shown with a person: approved unpaid leave in the latest run's month and this year's balances. */
interface LeaveFacts {
  unpaidLeave: number;
  balance: number;
  taken: number;
}

export function toEmployee(row: Joined, run: Pick<RunRow, 'year' | 'month'> | null, leave?: LeaveFacts): Employee {
  const e = row.employee;
  const unpaidDays =
    row.unpaidDays === null || row.workingDays === null || !run
      ? row.unpaidDays
      : Math.min(row.workingDays, row.unpaidDays + prorationDays(e, run.year, run.month) + (leave?.unpaidLeave ?? 0));
  return {
    id: e.code,
    name: e.name,
    branchId: e.branchId,
    branch: row.branchName,
    state: row.state,
    payGroupId: e.payGroupId,
    payGroup: row.payGroupName,
    joinDate: e.joinDate,
    exitDate: e.exitDate,
    dateOfBirth: e.dateOfBirth,
    gender: (e.gender as Gender | null) ?? null,
    bankAccountLast4: e.bankAccountLast4,
    bankReady: e.bankReady,
    monthlyBasic: e.monthlyBasic,
    monthlyHra: e.monthlyHra,
    monthlySpecial: e.monthlySpecial,
    taxRegime: e.taxRegime === 'old' ? 'old' : 'new',
    pfMember: e.pfMember,
    pfOnActualWages: e.pfOnActualWages,
    epsMember: e.epsMember,
    esiMember: e.esiMember,
    employmentType: e.employmentType as EmploymentType,
    positionLevel: e.positionLevel,
    jobTitle: e.jobTitle,
    department: e.department,
    managerId: row.managerCode,
    managerName: row.managerName,
    workEmail: e.workEmail,
    phone: e.phone,
    employmentStatus: e.employmentStatus === 'exited' ? 'exited' : 'active',
    payrollScope: e.payrollScope,
    leaveBalanceDays: leave?.balance ?? 0,
    leaveTakenDays: leave?.taken ?? 0,
    workingDays: row.workingDays,
    unpaidDays,
  };
}

/** The calculation library's view of an employee, with the salary in force for the period. */
export function toPayrollProfile(
  row: EmployeeRow,
  place: { branch: string; state: string; payGroup: string },
  salary: { monthlyBasic: number; monthlyHra: number; monthlySpecial: number },
  extra: {
    /** Year-to-date pay and TDS from approved runs; omitted when the organization has no history. */
    history?: { salaryPaidThisYear: number; taxAlreadyDeducted: number };
    declaration?: TaxDeclaration | null;
    previousGross?: number | null;
  } = {},
): EmployeePayrollProfile {
  const { history } = extra;
  return {
    id: row.code,
    name: row.name,
    branch: place.branch,
    state: place.state,
    payGroup: place.payGroup,
    joinDate: row.joinDate,
    exitDate: row.exitDate,
    dateOfBirth: row.dateOfBirth,
    gender: (row.gender as Gender | null) ?? null,
    bankAccountLast4: row.bankAccountLast4,
    bankReady: row.bankReady,
    ...salary,
    taxRegime: row.taxRegime === 'old' ? 'old' : 'new',
    declaration: extra.declaration ?? null,
    annualOtherIncome: row.annualOtherIncome,
    annualPriorEmployerTaxableSalary: row.annualPriorEmployerTaxableSalary,
    salaryPaidThisYear: history?.salaryPaidThisYear,
    taxAlreadyDeducted: history?.taxAlreadyDeducted ?? 0,
    pfMember: row.pfMember,
    pfOnActualWages: row.pfOnActualWages,
    epsMember: row.epsMember,
    esiMember: row.esiMember,
    previousGross: extra.previousGross ?? null,
  };
}

/** Leave facts for a page of people, against the latest run's month and year. */
async function leaveFactsFor(db: Db, organizationId: string, rows: Joined[], run: RunRow | null) {
  const people = rows.map(row => row.employee);
  const year = run?.year ?? new Date().getUTCFullYear();
  const snapshot = await leaveSnapshot(db, organizationId, people, year);
  const unpaid = run
    ? await unpaidLeaveByEmployee(
        db,
        organizationId,
        run.year,
        run.month,
        people.map(person => person.id),
      )
    : new Map<string, number>();
  return (key: string): LeaveFacts => ({
    unpaidLeave: unpaid.get(key) ?? 0,
    balance: snapshot.get(key)?.balance ?? 0,
    taken: snapshot.get(key)?.taken ?? 0,
  });
}

function selectEmployees(db: Db, runId: string | null) {
  return db
    .select({
      employee: employees,
      branchName: branches.name,
      state: branches.state,
      payGroupName: payGroups.name,
      managerCode: manager.code,
      managerName: manager.name,
      workingDays: payrollInputs.workingDays,
      unpaidDays: payrollInputs.unpaidDays,
    })
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .innerJoin(payGroups, eq(payGroups.id, employees.payGroupId))
    .leftJoin(manager, eq(manager.id, employees.managerId))
    .leftJoin(
      payrollInputs,
      and(eq(payrollInputs.employeeId, employees.id), eq(payrollInputs.runId, runId ?? sql`NULL::uuid`)),
    );
}

export async function listEmployees(db: Db, organizationId: string, query: EmployeeListQuery): Promise<Page<Employee>> {
  const filters: SQL[] = [eq(employees.organizationId, organizationId)];
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(employees.code, pattern),
        ilike(employees.name, pattern),
        ilike(branches.name, pattern),
        ilike(employees.jobTitle, pattern),
      )!,
    );
  }
  if (query.state) filters.push(eq(branches.state, query.state));
  if (query.employmentType) filters.push(eq(employees.employmentType, query.employmentType));
  if (query.level) filters.push(eq(employees.positionLevel, query.level));
  if (query.department) filters.push(eq(employees.department, query.department));
  if (query.payrollScope) filters.push(eq(employees.payrollScope, query.payrollScope === 'true'));
  if (query.status !== 'all') filters.push(eq(employees.employmentStatus, query.status));
  const where = and(...filters);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .where(where);
  const run = await latestRun(db, organizationId);
  const rows = await selectEmployees(db, run?.id ?? null)
    .where(where)
    .orderBy(desc(employees.positionLevel), employees.code)
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  const leave = await leaveFactsFor(db, organizationId, rows, run);
  return {
    total,
    page: query.page,
    size: query.size,
    items: rows.map(row => toEmployee(row, run, leave(row.employee.id))),
  };
}

export async function findEmployeeRow(db: Db | Tx, organizationId: string, code: string): Promise<EmployeeRow> {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.code, code)));
  if (!row) throw notFound('Employee not found');
  return row;
}

export async function getEmployee(db: Db, organizationId: string, code: string): Promise<Employee> {
  const run = await latestRun(db, organizationId);
  const [row] = await selectEmployees(db, run?.id ?? null).where(
    and(eq(employees.organizationId, organizationId), eq(employees.code, code)),
  );
  if (!row) throw notFound('Employee not found');
  const leave = await leaveFactsFor(db, organizationId, [row], run);
  return toEmployee(row, run, leave(row.employee.id));
}

async function assertPlace(db: Db | Tx, organizationId: string, branchId?: string, payGroupId?: string) {
  if (branchId) {
    const [found] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.organizationId, organizationId)));
    if (!found) throw badRequest('Choose one of your organization’s branches');
  }
  if (payGroupId) {
    const [found] = await db
      .select({ id: payGroups.id })
      .from(payGroups)
      .where(and(eq(payGroups.id, payGroupId), eq(payGroups.organizationId, organizationId)));
    if (!found) throw badRequest('Choose one of your organization’s pay groups');
  }
}

/** Resolves a manager code to its key, checking it sits at a higher level in the same organization. */
async function resolveManager(
  db: Db | Tx,
  organizationId: string,
  code: string | null,
  level: number,
  selfKey?: string,
) {
  if (level < TOP_POSITION_LEVEL && !code) throw badRequest('Choose a manager above this position level');
  if (level === TOP_POSITION_LEVEL && code) {
    throw badRequest('Managing Director has no reporting manager in this hierarchy');
  }
  if (!code) return null;
  const [found] = await db
    .select({ id: employees.id, level: employees.positionLevel })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.code, code),
        eq(employees.employmentStatus, 'active'),
      ),
    );
  if (!found || found.level <= level || found.id === selfKey) {
    throw badRequest('Reporting manager must have a higher position level');
  }
  return found.id;
}

export async function nextEmployeeCode(db: Db | Tx, organizationId: string): Promise<string> {
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(substring(${employees.code} from 4)::int), 0) + 1` })
    .from(employees)
    .where(eq(employees.organizationId, organizationId));
  return `EMP${String(next).padStart(5, '0')}`;
}

export async function createEmployee(
  db: Db,
  organizationId: string,
  body: CreateEmployeeInput,
  actor: string,
): Promise<string> {
  await assertPlace(db, organizationId, body.branchId, body.payGroupId);
  const managerId = await resolveManager(db, organizationId, body.managerId, body.positionLevel);
  const payrollScope = body.employmentType !== 'contractor';
  if (payrollScope && body.monthlyBasic === 0) throw badRequest('Basic pay is required for people in payroll');
  const salary = payrollScope
    ? { monthlyBasic: body.monthlyBasic, monthlyHra: body.monthlyHra, monthlySpecial: body.monthlySpecial }
    : { monthlyBasic: 0, monthlyHra: 0, monthlySpecial: 0 };
  const pfMember = payrollScope && body.pfMember;
  const wages = salary.monthlyBasic + salary.monthlySpecial;
  // Carried-forward earned leave opens the current leave year (or the joining year, if later).
  const leaveYear = Math.max(
    Number(body.joinDate.slice(0, 4)),
    (await latestRun(db, organizationId))?.year ?? new Date().getUTCFullYear(),
  );
  return db.transaction(async tx => {
    const code = await nextEmployeeCode(tx, organizationId);
    const [created] = await tx
      .insert(employees)
      .values({
        organizationId,
        code,
        name: body.name,
        branchId: body.branchId,
        payGroupId: body.payGroupId,
        joinDate: body.joinDate,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        ...salary,
        pfMember,
        epsMember: pfMember && wages <= EPS_WAGE_LIMIT,
        esiMember: payrollScope && body.esiMember,
        employmentType: body.employmentType,
        positionLevel: body.positionLevel,
        jobTitle: body.jobTitle,
        department: body.department,
        managerId,
        workEmail: body.workEmail,
        phone: body.phone,
        payrollScope,
      })
      .returning({ id: employees.id });
    if (body.carriedForwardLeave) {
      await tx.insert(leaveBalances).values({
        organizationId,
        employeeId: created.id,
        year: leaveYear,
        carriedForward: body.carriedForwardLeave,
      });
    }
    if (payrollScope) {
      await tx.insert(salaryRevisions).values({
        organizationId,
        employeeId: created.id,
        effectiveFrom: firstOfMonth(body.joinDate),
        ...salary,
        reason: 'Joining salary',
        createdBy: actor,
      });
    }
    return code;
  });
}

/** HR maintains work details and bank status; employees may only choose their own tax regime. */
export async function updateEmployee(
  db: Db,
  organizationId: string,
  code: string,
  body: UpdateEmployeeBody,
  principal: Principal,
): Promise<void> {
  const row = await findEmployeeRow(db, organizationId, code);
  if (principal.role === 'employee') {
    if (Object.keys(body).some(key => key !== 'taxRegime')) {
      throw forbidden('Employees can change only their own tax choice');
    }
    if (!row.payrollScope) throw forbidden('Contractor records are outside employee payroll');
  }
  // Employees choose their regime while the current run is still a draft. Approved lines are snapshots,
  // so a later change by HR only affects runs calculated afterwards.
  if (body.taxRegime !== undefined && principal.role === 'employee') {
    const run = await latestRun(db, organizationId);
    if (run && run.status !== 'draft') throw conflict('Tax choice is locked after calculation');
  }
  await assertPlace(db, organizationId, body.branchId, body.payGroupId);
  const changes: Partial<EmployeeRow> = {};
  if (body.managerId !== undefined) {
    changes.managerId = await resolveManager(db, organizationId, body.managerId, row.positionLevel, row.id);
  }
  for (const key of [
    'name',
    'jobTitle',
    'department',
    'branchId',
    'payGroupId',
    'gender',
    'workEmail',
    'phone',
    'bankReady',
    'bankAccountLast4',
    'taxRegime',
  ] as const) {
    if (body[key] !== undefined) (changes as Record<string, unknown>)[key] = body[key];
  }
  if (body.pfMember !== undefined) changes.pfMember = row.payrollScope && body.pfMember;
  if (body.esiMember !== undefined) changes.esiMember = row.payrollScope && body.esiMember;
  if (Object.keys(changes).length) await db.update(employees).set(changes).where(eq(employees.id, row.id));
}

export async function listRevisions(db: Db, organizationId: string, code: string): Promise<SalaryRevision[]> {
  const row = await findEmployeeRow(db, organizationId, code);
  const revisions = await db
    .select()
    .from(salaryRevisions)
    .where(eq(salaryRevisions.employeeId, row.id))
    .orderBy(desc(salaryRevisions.effectiveFrom));
  return revisions.map(({ id, effectiveFrom, monthlyBasic, monthlyHra, monthlySpecial, reason, createdAt }) => ({
    id,
    effectiveFrom,
    monthlyBasic,
    monthlyHra,
    monthlySpecial,
    reason,
    createdAt,
  }));
}

/**
 * Adds an effective-dated salary. Periods that Finance has approved stay as approved, so a revision can
 * only start after the last approved month (arrears are not modelled).
 */
export async function addRevision(
  db: Db,
  organizationId: string,
  code: string,
  body: {
    effectiveFrom: string;
    monthlyBasic: number;
    monthlyHra: number;
    monthlySpecial: number;
    reason: string | null;
  },
  actor: string,
): Promise<void> {
  const row = await findEmployeeRow(db, organizationId, code);
  if (!row.payrollScope) throw badRequest('Contractor records have no salary');
  if (body.effectiveFrom < firstOfMonth(row.joinDate)) throw badRequest('A revision cannot start before joining');
  const locked = await latestLockedPeriod(db, organizationId);
  if (locked && body.effectiveFrom <= locked) {
    throw conflict(`Salaries up to ${locked.slice(0, 7)} are approved; choose a later month`);
  }
  await db.transaction(async tx => {
    await tx
      .insert(salaryRevisions)
      .values({ organizationId, employeeId: row.id, ...body, createdBy: actor })
      .onConflictDoUpdate({
        target: [salaryRevisions.employeeId, salaryRevisions.effectiveFrom],
        set: {
          monthlyBasic: body.monthlyBasic,
          monthlyHra: body.monthlyHra,
          monthlySpecial: body.monthlySpecial,
          reason: body.reason,
          createdBy: actor,
        },
      });
    const [latest] = await tx
      .select()
      .from(salaryRevisions)
      .where(eq(salaryRevisions.employeeId, row.id))
      .orderBy(desc(salaryRevisions.effectiveFrom))
      .limit(1);
    await tx
      .update(employees)
      .set({ monthlyBasic: latest.monthlyBasic, monthlyHra: latest.monthlyHra, monthlySpecial: latest.monthlySpecial })
      .where(eq(employees.id, row.id));
  });
}

/** Records the last working day. Pay for the exit month is pro-rated automatically in that month's run. */
export async function exitEmployee(
  db: Db,
  organizationId: string,
  code: string,
  body: { exitDate: string; reason: string | null },
): Promise<void> {
  const row = await findEmployeeRow(db, organizationId, code);
  if (row.exitDate) throw conflict('This person has already left');
  if (body.exitDate < row.joinDate) throw badRequest('The exit date cannot be before the join date');
  const [reports] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.managerId, row.id), eq(employees.employmentStatus, 'active')));
  if (reports.count > 0) throw conflict(`Reassign ${reports.count} direct reports before this person leaves`);
  await db
    .update(employees)
    .set({ exitDate: body.exitDate, exitReason: body.reason, employmentStatus: 'exited' })
    .where(eq(employees.id, row.id));
}

export async function managerOptions(
  db: Db,
  organizationId: string,
  level: number,
  search: string,
): Promise<ManagerOption[]> {
  const pattern = `%${search}%`;
  const rows = await db
    .select({
      id: employees.code,
      name: employees.name,
      jobTitle: employees.jobTitle,
      positionLevel: employees.positionLevel,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        eq(employees.employmentStatus, 'active'),
        gt(employees.positionLevel, level),
        or(ilike(employees.code, pattern), ilike(employees.name, pattern)),
      ),
    )
    .orderBy(desc(employees.positionLevel), employees.code)
    .limit(60);
  return rows;
}

export async function hierarchySummary(db: Db, organizationId: string): Promise<HierarchySummary> {
  const active = and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, 'active'));
  const counts = await db
    .select({
      employmentType: employees.employmentType,
      level: employees.positionLevel,
      count: sql<number>`count(*)::int`,
    })
    .from(employees)
    .where(active)
    .groupBy(employees.employmentType, employees.positionLevel);
  const departments = await db
    .selectDistinct({ department: employees.department })
    .from(employees)
    .where(eq(employees.organizationId, organizationId))
    .orderBy(employees.department);
  const orgBranches = await db
    .select({ id: branches.id, name: branches.name, state: branches.state })
    .from(branches)
    .where(eq(branches.organizationId, organizationId))
    .orderBy(asc(branches.name));
  const orgPayGroups = await db
    .select({ id: payGroups.id, name: payGroups.name })
    .from(payGroups)
    .where(eq(payGroups.organizationId, organizationId))
    .orderBy(asc(payGroups.name));
  return {
    employmentTypes: [...EMPLOYMENT_TYPES],
    positionLevels: [...POSITION_LEVELS],
    branches: orgBranches,
    payGroups: orgPayGroups,
    states: [...new Set(orgBranches.map(branch => branch.state))].sort(),
    departments: departments.map(row => row.department),
    total: counts.reduce((sum, row) => sum + row.count, 0),
    counts: counts.map(row => ({ ...row, employmentType: row.employmentType as EmploymentType })),
  };
}

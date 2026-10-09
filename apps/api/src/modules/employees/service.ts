import { and, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { EmployeePayrollProfile } from '@payflow/core';
import {
  BRANCHES,
  TOP_POSITION_LEVEL,
  type CreateEmployeeInput,
  type Employee,
  type EmployeeListQuery,
  type EmploymentType,
  type Gender,
  type Page,
  type UpdateEmployeeBody,
} from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { employees, payrollInputs } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { getRun } from '../runs/service.js';

type EmployeeRow = typeof employees.$inferSelect;
const manager = alias(employees, 'manager');
/** EPS needs PF wages within the ₹25,000 ceiling (S.O. 5109(E), 17 September 2026). */
const EPS_WAGE_LIMIT = 25000_00;

export function toEmployee(
  row: EmployeeRow,
  extra: { managerName: string | null; workingDays: number | null; unpaidDays: number | null },
): Employee {
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    state: row.state,
    payGroup: row.payGroup,
    joinDate: row.joinDate,
    dateOfBirth: row.dateOfBirth,
    gender: (row.gender as Gender | null) ?? null,
    bankAccountLast4: row.bankAccountLast4,
    bankReady: row.bankReady,
    monthlyBasic: row.monthlyBasic,
    monthlyHra: row.monthlyHra,
    monthlySpecial: row.monthlySpecial,
    taxRegime: row.taxRegime === 'old' ? 'old' : 'new',
    oldRegimeAnnualDeductions: row.oldRegimeAnnualDeductions,
    pfMember: row.pfMember,
    pfOnActualWages: row.pfOnActualWages,
    epsMember: row.epsMember,
    esiMember: row.esiMember,
    employmentType: row.employmentType as EmploymentType,
    positionLevel: row.positionLevel,
    jobTitle: row.jobTitle,
    department: row.department,
    managerId: row.managerId,
    managerName: extra.managerName,
    workEmail: row.workEmail,
    phone: row.phone,
    employmentStatus: row.employmentStatus,
    payrollScope: row.payrollScope,
    leaveBalanceDays: row.leaveBalanceDays,
    leaveTakenDays: row.leaveTakenDays,
    workingDays: extra.workingDays,
    unpaidDays: extra.unpaidDays,
  };
}

/** The calculation library's view of an employee. */
export function toPayrollProfile(row: EmployeeRow): EmployeePayrollProfile {
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    state: row.state,
    payGroup: row.payGroup,
    joinDate: row.joinDate,
    dateOfBirth: row.dateOfBirth,
    gender: (row.gender as Gender | null) ?? null,
    bankAccountLast4: row.bankAccountLast4,
    bankReady: row.bankReady,
    monthlyBasic: row.monthlyBasic,
    monthlyHra: row.monthlyHra,
    monthlySpecial: row.monthlySpecial,
    taxRegime: row.taxRegime === 'old' ? 'old' : 'new',
    oldRegimeAnnualDeductions: row.oldRegimeAnnualDeductions,
    annualOtherIncome: row.annualOtherIncome,
    annualPriorEmployerTaxableSalary: row.annualPriorEmployerTaxableSalary,
    taxAlreadyDeducted: row.taxAlreadyDeducted,
    pfMember: row.pfMember,
    pfOnActualWages: row.pfOnActualWages,
    epsMember: row.epsMember,
    esiMember: row.esiMember,
  };
}

function selectEmployees(db: Db, runId: string) {
  return db
    .select({
      employee: employees,
      managerName: manager.name,
      workingDays: payrollInputs.workingDays,
      unpaidDays: payrollInputs.unpaidDays,
    })
    .from(employees)
    .leftJoin(manager, eq(manager.id, employees.managerId))
    .leftJoin(payrollInputs, and(eq(payrollInputs.employeeId, employees.id), eq(payrollInputs.runId, runId)));
}
type Selected = {
  employee: EmployeeRow;
  managerName: string | null;
  workingDays: number | null;
  unpaidDays: number | null;
};
const fromSelected = (row: Selected) => toEmployee(row.employee, row);

export async function listEmployees(db: Db, runId: string, query: EmployeeListQuery): Promise<Page<Employee>> {
  const filters: SQL[] = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(employees.id, pattern),
        ilike(employees.name, pattern),
        ilike(employees.branch, pattern),
        ilike(employees.jobTitle, pattern),
      )!,
    );
  }
  if (query.state) filters.push(eq(employees.state, query.state));
  if (query.employmentType) filters.push(eq(employees.employmentType, query.employmentType));
  if (query.level) filters.push(eq(employees.positionLevel, query.level));
  if (query.department) filters.push(eq(employees.department, query.department));
  if (query.payrollScope) filters.push(eq(employees.payrollScope, query.payrollScope === 'true'));
  const where = filters.length ? and(...filters) : undefined;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(employees)
    .where(where);
  const rows = await selectEmployees(db, runId)
    .where(where)
    .orderBy(desc(employees.positionLevel), employees.id)
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  return { total, page: query.page, size: query.size, items: rows.map(fromSelected) };
}

export async function getEmployee(db: Db, runId: string, id: string): Promise<Employee> {
  const [row] = await selectEmployees(db, runId).where(eq(employees.id, id));
  if (!row) throw notFound('Employee not found');
  return fromSelected(row);
}

export async function createEmployee(db: Db, runId: string, body: CreateEmployeeInput): Promise<string> {
  const run = await getRun(db, runId);
  if (run.status !== 'draft') throw conflict('Add employees before calculating this payroll run');
  if (!BRANCHES.some(item => item.branch === body.branch && item.state === body.state))
    throw badRequest('Choose a listed branch and its state');
  if (body.joinDate > run.paymentDate) throw badRequest('Join date must be on or before the payment date');
  const payrollScope = body.employmentType !== 'contractor';
  if (payrollScope && body.monthlyBasic === 0) throw badRequest('Basic pay is required for people in payroll');
  if (body.positionLevel < TOP_POSITION_LEVEL && !body.managerId)
    throw badRequest('Choose a manager above this position level');
  if (body.positionLevel === TOP_POSITION_LEVEL && body.managerId)
    throw badRequest('Managing Director has no reporting manager in this hierarchy');
  if (body.managerId) {
    const [found] = await db
      .select({ level: employees.positionLevel })
      .from(employees)
      .where(and(eq(employees.id, body.managerId), eq(employees.employmentStatus, 'active')));
    if (!found || found.level <= body.positionLevel)
      throw badRequest('Reporting manager must have a higher position level');
  }
  const pfMember = payrollScope && body.pfMember;
  return db.transaction(async tx => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(substring(${employees.id} from 4)::int), 0) + 1` })
      .from(employees);
    const id = `EMP${String(next).padStart(5, '0')}`;
    await tx.insert(employees).values({
      id,
      name: body.name,
      branch: body.branch,
      state: body.state,
      payGroup: body.payGroup,
      joinDate: body.joinDate,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      monthlyBasic: payrollScope ? body.monthlyBasic : 0,
      monthlyHra: payrollScope ? body.monthlyHra : 0,
      monthlySpecial: payrollScope ? body.monthlySpecial : 0,
      pfMember,
      epsMember: pfMember && body.monthlyBasic + body.monthlySpecial <= EPS_WAGE_LIMIT,
      esiMember: payrollScope && body.esiMember,
      employmentType: body.employmentType,
      positionLevel: body.positionLevel,
      jobTitle: body.jobTitle,
      department: body.department,
      managerId: body.managerId,
      workEmail: body.workEmail,
      phone: body.phone,
      payrollScope,
      leaveBalanceDays: body.leaveBalanceDays,
    });
    await tx.insert(payrollInputs).values({ runId, employeeId: id, workingDays: 30, unpaidDays: 0 });
    return id;
  });
}

/** HR maintains bank details; employees may only choose their own tax regime while the run is a draft. */
export async function updateEmployee(
  db: Db,
  runId: string,
  id: string,
  body: UpdateEmployeeBody,
  actorRole: string,
): Promise<void> {
  const [existing] = await db
    .select({ payrollScope: employees.payrollScope })
    .from(employees)
    .where(eq(employees.id, id));
  if (!existing) throw notFound('Employee not found');
  if (actorRole === 'employee') {
    if (Object.keys(body).some(key => key !== 'taxRegime'))
      throw forbidden('Employees can change only their own tax choice');
    if (!existing.payrollScope) throw forbidden('Contractor records are outside employee payroll');
  }
  const run = await getRun(db, runId);
  if (body.taxRegime !== undefined && run.status !== 'draft') throw conflict('Tax choice is locked after calculation');
  if (
    (body.bankReady !== undefined || body.bankAccountLast4 !== undefined) &&
    !['draft', 'calculated'].includes(run.status)
  ) {
    throw conflict('Bank verification is locked after submission');
  }
  const changes: Partial<EmployeeRow> = {};
  if (body.bankReady !== undefined) changes.bankReady = body.bankReady;
  if (body.bankAccountLast4 !== undefined) changes.bankAccountLast4 = body.bankAccountLast4;
  if (body.taxRegime !== undefined) changes.taxRegime = body.taxRegime;
  if (Object.keys(changes).length) await db.update(employees).set(changes).where(eq(employees.id, id));
}

export async function managerOptions(db: Db, level: number, search: string) {
  const pattern = `%${search}%`;
  return db
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      positionLevel: employees.positionLevel,
    })
    .from(employees)
    .where(
      and(
        eq(employees.employmentStatus, 'active'),
        gt(employees.positionLevel, level),
        or(ilike(employees.id, pattern), ilike(employees.name, pattern)),
      ),
    )
    .orderBy(desc(employees.positionLevel), employees.id)
    .limit(60);
}

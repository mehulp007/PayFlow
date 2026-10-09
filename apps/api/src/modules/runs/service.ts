import { and, desc, eq, gt, ilike, inArray, isNull, lte, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { calculatePayroll, daysInMonth, monthEnd, monthStart, type PayrollLine } from '@payflow/core';
import {
  APPROVED_STATUSES,
  EDITABLE_STATUSES,
  type AuditEvent,
  type LineListQuery,
  type Page,
  type Payslip,
  type RunException,
  type RunPeriod,
  type RunStatus,
  type RunSummary,
} from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import {
  auditEvents,
  branches,
  employees,
  payGroups,
  payrollInputs,
  payrollLines,
  payrollRuns,
  salaryRevisions,
  taxDeclarations,
} from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { toPayrollProfile, type EmployeeRow } from '../employees/service.js';
import { unpaidLeaveByEmployee } from '../leave/service.js';

export type RunRow = typeof payrollRuns.$inferSelect & { status: RunStatus };
const INSERT_CHUNK = 250;
const ALL_PAY_GROUPS = 'All pay groups';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tax year (April–March) of a pay month, as the calendar year it starts in. */
export const taxYearStart = (year: number, month: number) => (month >= 4 ? year : year - 1);
const periodKey = (year: number, month: number) => year * 12 + month;

export async function getRun(db: Db | Tx, organizationId: string, id: string): Promise<RunRow> {
  if (!UUID.test(id)) throw notFound('Payroll run not found');
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.organizationId, organizationId)));
  if (!run) throw notFound('Payroll run not found');
  return run as RunRow;
}

/** The organization's most recent pay period: what the topbar and overview show by default. */
export async function latestRun(db: Db | Tx, organizationId: string): Promise<RunRow | null> {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, organizationId))
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month), desc(payrollRuns.createdAt))
    .limit(1);
  return (run as RunRow | undefined) ?? null;
}

/** Last day of the latest month Finance has approved, or null. Salaries cannot change before it. */
export async function latestLockedPeriod(db: Db | Tx, organizationId: string): Promise<string | null> {
  const [run] = await db
    .select({ year: payrollRuns.year, month: payrollRuns.month })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.organizationId, organizationId), inArray(payrollRuns.status, [...APPROVED_STATUSES])))
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
    .limit(1);
  return run ? monthEnd(run.year, run.month) : null;
}

async function payGroupName(db: Db | Tx, run: RunRow): Promise<string> {
  if (!run.payGroupId) return ALL_PAY_GROUPS;
  const [group] = await db.select({ name: payGroups.name }).from(payGroups).where(eq(payGroups.id, run.payGroupId));
  return group?.name ?? ALL_PAY_GROUPS;
}

export async function toPeriod(db: Db | Tx, run: RunRow): Promise<RunPeriod> {
  return {
    id: run.id,
    year: run.year,
    month: run.month,
    paymentDate: run.paymentDate,
    status: run.status,
    payGroupId: run.payGroupId,
    payGroupName: await payGroupName(db, run),
  };
}

/**
 * People a run covers: in its pay group and employed for at least part of the month. Contractors get input
 * rows for attendance, but only people in payroll scope are calculated (`payrollOnly`).
 */
function eligibility(run: Pick<RunRow, 'organizationId' | 'payGroupId' | 'year' | 'month'>, payrollOnly = true): SQL {
  const start = monthStart(run.year, run.month);
  const end = monthEnd(run.year, run.month);
  return and(
    eq(employees.organizationId, run.organizationId),
    payrollOnly ? eq(employees.payrollScope, true) : undefined,
    lte(employees.joinDate, end),
    or(isNull(employees.exitDate), sql`${employees.exitDate} >= ${start}`),
    run.payGroupId ? eq(employees.payGroupId, run.payGroupId) : undefined,
  )!;
}

export async function summarize(db: Db | Tx, run: RunRow): Promise<RunSummary> {
  const [totals] = await db
    .select({
      calculated: sql<number>`count(*)::int`,
      gross: sql<number>`coalesce(sum(${payrollLines.gross}), 0)::bigint`,
      deductions: sql<number>`coalesce(sum(${payrollLines.deductions}), 0)::bigint`,
      net: sql<number>`coalesce(sum(${payrollLines.net}), 0)::bigint`,
      employerCost: sql<number>`coalesce(sum(${payrollLines.employerCost}), 0)::bigint`,
      blocking: sql<number>`coalesce(sum(${payrollLines.blockingFlags}), 0)::int`,
      warnings: sql<number>`coalesce(sum(${payrollLines.warningFlags}), 0)::int`,
    })
    .from(payrollLines)
    .where(eq(payrollLines.runId, run.id));
  // Approved runs are frozen: their population is whoever was calculated.
  let totalEmployees = totals.calculated;
  if (!APPROVED_STATUSES.includes(run.status)) {
    const [scope] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eligibility(run));
    totalEmployees = scope.count;
  }
  return {
    ...(await toPeriod(db, run)),
    preparedBy: run.preparedBy,
    approvedBy: run.approvedBy,
    approvedAt: run.approvedAt,
    rejectionNote: run.rejectionNote,
    paidAt: run.paidAt,
    closedAt: run.closedAt,
    version: run.version,
    totalEmployees,
    calculatedEmployees: totals.calculated,
    gross: Number(totals.gross),
    deductions: Number(totals.deductions),
    net: Number(totals.net),
    employerCost: Number(totals.employerCost),
    blocking: totals.blocking,
    warnings: totals.warnings,
  };
}

export async function listRuns(db: Db, organizationId: string): Promise<RunSummary[]> {
  const runs = await db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, organizationId))
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month), desc(payrollRuns.createdAt));
  return Promise.all(runs.map(run => summarize(db, run as RunRow)));
}

/**
 * Opens a pay period. Monthly wages must be paid before the seventh day of the following month (Code on
 * Wages, s. 17(1)), and a month cannot be paid twice for the same people.
 */
export async function createRun(
  db: Db,
  organizationId: string,
  body: { year: number; month: number; paymentDate: string; payGroupId: string | null },
): Promise<RunRow> {
  const start = monthStart(body.year, body.month);
  const nextMonth = body.month === 12 ? { year: body.year + 1, month: 1 } : { year: body.year, month: body.month + 1 };
  const deadline = `${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}-07`;
  if (body.paymentDate < start || body.paymentDate > deadline) {
    throw badRequest(`Pay between ${start} and ${deadline}: monthly wages are due before the 7th of the next month`);
  }
  if (body.payGroupId) {
    const [group] = await db
      .select({ id: payGroups.id })
      .from(payGroups)
      .where(and(eq(payGroups.id, body.payGroupId), eq(payGroups.organizationId, organizationId)));
    if (!group) throw badRequest('Choose one of your organization’s pay groups');
  }
  const overlapping = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.organizationId, organizationId),
        eq(payrollRuns.year, body.year),
        eq(payrollRuns.month, body.month),
        body.payGroupId ? or(isNull(payrollRuns.payGroupId), eq(payrollRuns.payGroupId, body.payGroupId)) : undefined,
      ),
    );
  if (overlapping.length) throw conflict('A run already covers these people for this month');
  const [created] = await db
    .insert(payrollRuns)
    .values({ organizationId, ...body })
    .returning();
  await syncInputs(db, created as RunRow);
  return created as RunRow;
}

/**
 * Gives every eligible person an input row for the month's calendar days. The row holds imported attendance
 * and variable pay; joining or leaving mid-month is pro-rated separately (see `prorationDays`). People no
 * longer eligible are removed.
 */
export async function syncInputs(db: Db | Tx, run: RunRow): Promise<void> {
  if (!EDITABLE_STATUSES.includes(run.status)) return; // inputs freeze once the run goes to Finance
  const days = daysInMonth(run.year, run.month);
  const eligible = await db.select({ id: employees.id }).from(employees).where(eligibility(run, false));
  const keys = eligible.map(row => row.id);
  await db
    .delete(payrollInputs)
    .where(and(eq(payrollInputs.runId, run.id), keys.length ? notInArray(payrollInputs.employeeId, keys) : undefined));
  const values = eligible.map(row => ({
    organizationId: run.organizationId,
    runId: run.id,
    employeeId: row.id,
    workingDays: days,
    unpaidDays: 0,
  }));
  for (let offset = 0; offset < values.length; offset += INSERT_CHUNK) {
    await db
      .insert(payrollInputs)
      .values(values.slice(offset, offset + INSERT_CHUNK))
      .onConflictDoNothing();
  }
}

/** Calendar days of the period before joining or after leaving, which are unpaid. */
export function prorationDays(
  person: { joinDate: string; exitDate: string | null },
  year: number,
  month: number,
): number {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const day = (date: string) => Number(date.slice(8, 10));
  const before = person.joinDate > start && person.joinDate <= end ? day(person.joinDate) - 1 : 0;
  const after =
    person.exitDate && person.exitDate >= start && person.exitDate < end ? day(end) - day(person.exitDate) : 0;
  return before + after;
}

/** Brings every draft or calculated run up to date after people are added, moved or leave. */
export async function refreshOpenRuns(db: Db, organizationId: string): Promise<void> {
  const open = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.organizationId, organizationId), inArray(payrollRuns.status, [...EDITABLE_STATUSES])));
  for (const run of open) await syncInputs(db, run as RunRow);
}

/** Salary paid and TDS deducted earlier in the tax year, from runs Finance approved. */
export async function yearToDate(db: Db | Tx, run: Pick<RunRow, 'organizationId' | 'year' | 'month'>) {
  const startYear = taxYearStart(run.year, run.month);
  const runKey = sql`${payrollRuns.year} * 12 + ${payrollRuns.month}`;
  const approvedEarlier = and(
    eq(payrollRuns.organizationId, run.organizationId),
    inArray(payrollRuns.status, [...APPROVED_STATUSES]),
    sql`${runKey} >= ${periodKey(startYear, 4)}`,
    sql`${runKey} < ${periodKey(run.year, run.month)}`,
  );
  const [history] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payrollRuns)
    .where(approvedEarlier);
  if (!history.count) return null;
  const rows = await db
    .select({
      employeeId: payrollLines.employeeId,
      gross: sql<number>`sum(${payrollLines.gross})::bigint`,
      tax: sql<number>`sum(${payrollLines.incomeTax})::bigint`,
    })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollLines.runId))
    .where(approvedEarlier)
    .groupBy(payrollLines.employeeId);
  return new Map(
    rows.map(row => [row.employeeId, { salaryPaidThisYear: Number(row.gross), taxAlreadyDeducted: Number(row.tax) }]),
  );
}

/** Gross pay per employee in the previous month's approved runs, for the month-over-month check. */
async function previousMonthGross(db: Db | Tx, run: RunRow): Promise<Map<string, number>> {
  const previous = run.month === 1 ? { year: run.year - 1, month: 12 } : { year: run.year, month: run.month - 1 };
  const rows = await db
    .select({ employeeId: payrollLines.employeeId, gross: payrollLines.gross })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollLines.runId))
    .where(
      and(
        eq(payrollRuns.organizationId, run.organizationId),
        eq(payrollRuns.year, previous.year),
        eq(payrollRuns.month, previous.month),
        inArray(payrollRuns.status, [...APPROVED_STATUSES]),
      ),
    );
  return new Map(rows.map(row => [row.employeeId, row.gross]));
}

/** Declarations (Form 124) for the run's tax year, per employee key. */
export async function declarationsFor(db: Db | Tx, organizationId: string, taxYear: number, employeeKeys?: string[]) {
  const rows = await db
    .select({ employeeId: taxDeclarations.employeeId, data: taxDeclarations.data })
    .from(taxDeclarations)
    .where(
      and(
        eq(taxDeclarations.organizationId, organizationId),
        eq(taxDeclarations.taxYear, taxYear),
        employeeKeys ? inArray(taxDeclarations.employeeId, employeeKeys) : undefined,
      ),
    );
  return new Map(rows.map(row => [row.employeeId, row.data]));
}

type Revision = typeof salaryRevisions.$inferSelect;
/** The salary revision in force on the first day of the period, falling back to the current salary. */
export function salaryFor(employee: EmployeeRow, revisions: Revision[], periodStart: string) {
  const inForce = revisions.filter(revision => revision.effectiveFrom <= periodStart).at(-1);
  const source = inForce ?? employee;
  return { monthlyBasic: source.monthlyBasic, monthlyHra: source.monthlyHra, monthlySpecial: source.monthlySpecial };
}

/** Calculates every eligible person and replaces the run's lines in one transaction. */
export async function calculateRun(db: Db, organizationId: string, runId: string): Promise<number> {
  const run = await getRun(db, organizationId, runId);
  if (!EDITABLE_STATUSES.includes(run.status)) throw conflict('Approved or submitted runs cannot be recalculated');
  await syncInputs(db, run);
  const rows = await db
    .select({
      employee: employees,
      input: payrollInputs,
      branch: branches.name,
      state: branches.state,
      payGroup: payGroups.name,
    })
    .from(payrollInputs)
    .innerJoin(employees, eq(employees.id, payrollInputs.employeeId))
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .innerJoin(payGroups, eq(payGroups.id, employees.payGroupId))
    .where(and(eq(payrollInputs.runId, runId), eq(employees.payrollScope, true)))
    .orderBy(employees.code);
  const revisions: Revision[] = rows.length
    ? await db
        .select()
        .from(salaryRevisions)
        .where(eq(salaryRevisions.organizationId, organizationId))
        .orderBy(salaryRevisions.effectiveFrom)
    : [];
  const revisionsByEmployee = new Map<string, Revision[]>();
  for (const revision of revisions) {
    const list = revisionsByEmployee.get(revision.employeeId) ?? [];
    list.push(revision);
    revisionsByEmployee.set(revision.employeeId, list);
  }
  const history = await yearToDate(db, run);
  const declarations = await declarationsFor(db, organizationId, taxYearStart(run.year, run.month));
  const unpaidLeave = await unpaidLeaveByEmployee(db, organizationId, run.year, run.month);
  const previousGross = await previousMonthGross(db, run);
  const periodStart = monthStart(run.year, run.month);
  const period = { year: run.year, month: run.month, paymentDate: run.paymentDate };
  const results = rows.map(({ employee, input, branch, state, payGroup }) => {
    const leaveDays = unpaidLeave.get(employee.id) ?? 0;
    return {
      employeeKey: employee.id,
      line: calculatePayroll(
        toPayrollProfile(
          employee,
          { branch, state, payGroup },
          salaryFor(employee, revisionsByEmployee.get(employee.id) ?? [], periodStart),
          {
            history: history
              ? (history.get(employee.id) ?? { salaryPaidThisYear: 0, taxAlreadyDeducted: 0 })
              : undefined,
            declaration: declarations.get(employee.id),
            previousGross: previousGross.get(employee.id),
          },
        ),
        {
          employeeId: employee.code,
          variablePay: input.variablePay,
          otherDeduction: input.otherDeduction,
          unpaidDays: Math.min(
            input.workingDays,
            input.unpaidDays + prorationDays(employee, run.year, run.month) + leaveDays,
          ),
          unpaidLeaveDays: leaveDays,
          workingDays: input.workingDays,
          note: input.note ?? undefined,
        },
        period,
      ),
    };
  });
  await db.transaction(async tx => {
    await tx.delete(payrollLines).where(eq(payrollLines.runId, runId));
    for (let offset = 0; offset < results.length; offset += INSERT_CHUNK) {
      await tx.insert(payrollLines).values(
        results.slice(offset, offset + INSERT_CHUNK).map(({ employeeKey, line }) => ({
          organizationId,
          runId,
          employeeId: employeeKey,
          gross: line.gross,
          deductions: line.deductions,
          net: line.net,
          incomeTax: line.incomeTax,
          employerCost: line.employerCost,
          result: line,
          blockingFlags: line.flags.filter(flag => flag.severity === 'blocking').length,
          warningFlags: line.flags.filter(flag => flag.severity === 'warning').length,
        })),
      );
    }
    await tx
      .update(payrollRuns)
      .set({ status: 'calculated', updatedAt: sql`now()` })
      .where(eq(payrollRuns.id, runId));
  });
  return results.length;
}

async function setStatus(db: Db, run: RunRow, changes: Partial<typeof payrollRuns.$inferInsert>) {
  await db
    .update(payrollRuns)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(payrollRuns.id, run.id));
}
const now = () => sql`now()` as unknown as string;

/** Maker step: only a fully calculated run without blocking exceptions can go to Finance. */
export async function submitRun(db: Db, organizationId: string, runId: string, preparedBy: string): Promise<void> {
  const run = await getRun(db, organizationId, runId);
  const totals = await summarize(db, run);
  if (run.status !== 'calculated' || totals.calculatedEmployees !== totals.totalEmployees || totals.blocking > 0) {
    throw conflict('Calculate all employees and clear blocking exceptions before approval');
  }
  await setStatus(db, run, { status: 'approval_pending', preparedBy, rejectionNote: null });
}

/** Checker step: the preparer can never approve their own run. */
export async function approveRun(db: Db, organizationId: string, runId: string, approvedBy: string): Promise<void> {
  const run = await getRun(db, organizationId, runId);
  if (run.status !== 'approval_pending') throw conflict('Run is not pending approval');
  if (run.preparedBy === approvedBy) throw forbidden('Preparer cannot approve the same run');
  await setStatus(db, run, { status: 'approved', approvedBy, approvedAt: now() });
}

/** Finance returns a submitted run to the preparers with a note; it must be resubmitted. */
export async function rejectRun(db: Db, organizationId: string, runId: string, note: string): Promise<void> {
  const run = await getRun(db, organizationId, runId);
  if (run.status !== 'approval_pending') throw conflict('Only runs pending approval can be sent back');
  await setStatus(db, run, { status: 'calculated', rejectionNote: note, preparedBy: null });
}

/** Records that payments were made and matched to the bank statement (simulated in this demo). */
export async function markPaid(db: Db, organizationId: string, runId: string): Promise<void> {
  const run = await getRun(db, organizationId, runId);
  if (run.status !== 'approved') throw conflict('Approval required before recording payment');
  await setStatus(db, run, { status: 'paid', paidAt: now() });
}

export async function closeRun(db: Db, organizationId: string, runId: string): Promise<void> {
  const run = await getRun(db, organizationId, runId);
  if (run.status !== 'paid') throw conflict('Record payment before closing the period');
  await setStatus(db, run, { status: 'closed', closedAt: now() });
}

export async function listLines(
  db: Db,
  organizationId: string,
  runId: string,
  query: LineListQuery,
): Promise<Page<PayrollLine>> {
  await getRun(db, organizationId, runId);
  const filters: SQL[] = [eq(payrollLines.runId, runId)];
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(employees.code, pattern),
        ilike(employees.name, pattern),
        sql`${payrollLines.result} ->> 'branch' ILIKE ${pattern}`,
      )!,
    );
  }
  if (query.exception === 'true') {
    filters.push(gt(sql`${payrollLines.blockingFlags} + ${payrollLines.warningFlags}`, 0));
  }
  const where = and(...filters);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(payrollLines)
    .innerJoin(employees, eq(employees.id, payrollLines.employeeId))
    .where(where);
  const rows = await db
    .select({ result: payrollLines.result })
    .from(payrollLines)
    .innerJoin(employees, eq(employees.id, payrollLines.employeeId))
    .where(where)
    .orderBy(employees.code)
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  return { total, page: query.page, size: query.size, items: rows.map(row => row.result) };
}

/** Blocking exceptions first, capped at 100 for the attention panel. */
export async function listExceptions(db: Db, organizationId: string, runId: string): Promise<RunException[]> {
  await getRun(db, organizationId, runId);
  const rows = await db.execute(sql`
    SELECT e.code AS "employeeId", e.name, flag
    FROM payroll_lines l
    JOIN employees e ON e.id = l.employee_id,
    jsonb_array_elements(l.result -> 'flags') AS flag
    WHERE l.run_id = ${runId}
    ORDER BY CASE WHEN flag ->> 'severity' = 'blocking' THEN 0 ELSE 1 END, e.code
    LIMIT 100`);
  return (rows as unknown as { rows: Array<{ employeeId: string; name: string; flag: RunException }> }).rows.map(
    row => ({ ...row.flag, employeeId: row.employeeId, name: row.name }),
  );
}

export async function listAudit(db: Db, organizationId: string, runId: string): Promise<AuditEvent[]> {
  await getRun(db, organizationId, runId);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, organizationId), eq(auditEvents.runId, runId)))
    .orderBy(desc(auditEvents.id))
    .limit(100);
  return rows.map(({ id, runId: run, actor, action, details, createdAt }) => ({
    id,
    runId: run,
    actor,
    action,
    details: details ?? {},
    createdAt,
  }));
}

export async function getPayslip(
  db: Db,
  organizationId: string,
  runId: string,
  employeeCode: string,
  viewerIsEmployee: boolean,
): Promise<Payslip> {
  const run = await getRun(db, organizationId, runId);
  if (viewerIsEmployee && !APPROVED_STATUSES.includes(run.status)) {
    throw forbidden('Payslip is available after approval');
  }
  const [row] = await db
    .select({ result: payrollLines.result })
    .from(payrollLines)
    .innerJoin(employees, eq(employees.id, payrollLines.employeeId))
    .where(and(eq(payrollLines.runId, runId), eq(employees.code, employeeCode)));
  if (!row) throw notFound('Payslip not found');
  return { runId, period: `${run.year}-${String(run.month).padStart(2, '0')}`, status: run.status, line: row.result };
}

/** Approved payslips for one employee, newest first. */
export async function payslipsFor(db: Db, organizationId: string, employeeKey: string) {
  const rows = await db
    .select({
      runId: payrollRuns.id,
      year: payrollRuns.year,
      month: payrollRuns.month,
      status: payrollRuns.status,
      gross: payrollLines.gross,
      net: payrollLines.net,
    })
    .from(payrollLines)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payrollLines.runId))
    .where(
      and(
        eq(payrollLines.organizationId, organizationId),
        eq(payrollLines.employeeId, employeeKey),
        inArray(payrollRuns.status, [...APPROVED_STATUSES]),
      ),
    )
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
  return rows.map(row => ({ ...row, status: row.status as RunStatus }));
}

export async function linesForExport(db: Db, organizationId: string, runId: string): Promise<PayrollLine[]> {
  await getRun(db, organizationId, runId);
  const rows = await db
    .select({ result: payrollLines.result })
    .from(payrollLines)
    .innerJoin(employees, eq(employees.id, payrollLines.employeeId))
    .where(eq(payrollLines.runId, runId))
    .orderBy(employees.code);
  return rows.map(row => row.result);
}

/** Employee keys with a line in the run. */
export async function lineEmployeeKeys(db: Db | Tx, runId: string): Promise<string[]> {
  const rows = await db
    .select({ employeeId: payrollLines.employeeId })
    .from(payrollLines)
    .where(eq(payrollLines.runId, runId));
  return rows.map(row => row.employeeId);
}

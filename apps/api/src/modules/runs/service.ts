import { and, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { calculatePayroll, type PayrollLine } from '@payflow/core';
import {
  APPROVED_STATUSES,
  type AuditEvent,
  type LineListQuery,
  type Page,
  type Payslip,
  type RunException,
  type RunPeriod,
  type RunStatus,
  type RunSummary,
} from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { auditEvents, employees, payrollInputs, payrollLines, payrollRuns } from '../../db/schema.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { toPayrollProfile } from '../employees/service.js';

type RunRow = typeof payrollRuns.$inferSelect;
const INSERT_CHUNK = 250;

/** The most recent pay period. Phase 2 replaces this with explicit period selection. */
export async function currentRunId(db: Db): Promise<string> {
  const [run] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
    .limit(1);
  if (!run) throw notFound('No payroll run exists yet');
  return run.id;
}

export async function getRun(db: Db, id: string): Promise<RunRow & { status: RunStatus }> {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id));
  if (!run) throw notFound('Payroll run not found');
  return run as RunRow & { status: RunStatus };
}

export function toPeriod(run: RunRow): RunPeriod {
  return {
    id: run.id,
    year: run.year,
    month: run.month,
    paymentDate: run.paymentDate,
    status: run.status as RunStatus,
  };
}

export async function summarize(db: Db, run: RunRow): Promise<RunSummary> {
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
  const [scope] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.payrollScope, true), eq(employees.employmentStatus, 'active')));
  return {
    ...toPeriod(run),
    preparedBy: run.preparedBy,
    approvedBy: run.approvedBy,
    approvedAt: run.approvedAt,
    version: run.version,
    totalEmployees: scope.count,
    calculatedEmployees: totals.calculated,
    gross: Number(totals.gross),
    deductions: Number(totals.deductions),
    net: Number(totals.net),
    employerCost: Number(totals.employerCost),
    blocking: totals.blocking,
    warnings: totals.warnings,
  };
}

/** Calculates every active in-scope employee and replaces the run's lines in one transaction. */
export async function calculateRun(db: Db, runId: string): Promise<number> {
  const run = await getRun(db, runId);
  if (!['draft', 'calculated'].includes(run.status))
    throw conflict('Approved or submitted runs cannot be recalculated');
  const rows = await db
    .select({ employee: employees, input: payrollInputs })
    .from(employees)
    .innerJoin(payrollInputs, and(eq(payrollInputs.employeeId, employees.id), eq(payrollInputs.runId, runId)))
    .where(and(eq(employees.payrollScope, true), eq(employees.employmentStatus, 'active')))
    .orderBy(employees.id);
  const period = { year: run.year, month: run.month, paymentDate: run.paymentDate };
  const lines = rows.map(({ employee, input }) =>
    calculatePayroll(
      toPayrollProfile(employee),
      {
        employeeId: employee.id,
        variablePay: input.variablePay,
        otherDeduction: input.otherDeduction,
        unpaidDays: input.unpaidDays,
        workingDays: input.workingDays,
        note: input.note ?? undefined,
      },
      period,
    ),
  );
  await db.transaction(async tx => {
    await tx.delete(payrollLines).where(eq(payrollLines.runId, runId));
    for (let offset = 0; offset < lines.length; offset += INSERT_CHUNK) {
      await tx.insert(payrollLines).values(
        lines.slice(offset, offset + INSERT_CHUNK).map(line => ({
          runId,
          employeeId: line.employeeId,
          gross: line.gross,
          deductions: line.deductions,
          net: line.net,
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
  return lines.length;
}

/** Maker step: only a fully calculated run without blocking exceptions can go to Finance. */
export async function submitRun(db: Db, runId: string, preparedBy: string): Promise<void> {
  const run = await getRun(db, runId);
  const totals = await summarize(db, run);
  if (run.status !== 'calculated' || totals.calculatedEmployees !== totals.totalEmployees || totals.blocking > 0) {
    throw conflict('Calculate all employees and clear blocking exceptions before approval');
  }
  await db
    .update(payrollRuns)
    .set({ status: 'approval_pending', preparedBy, updatedAt: sql`now()` })
    .where(eq(payrollRuns.id, runId));
}

/** Checker step: the preparer can never approve their own run. */
export async function approveRun(db: Db, runId: string, approvedBy: string): Promise<void> {
  const run = await getRun(db, runId);
  if (run.status !== 'approval_pending') throw conflict('Run is not pending approval');
  if (run.preparedBy === approvedBy) throw forbidden('Preparer cannot approve the same run');
  await db
    .update(payrollRuns)
    .set({ status: 'approved', approvedBy, approvedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(payrollRuns.id, runId));
}

export async function reconcileRun(db: Db, runId: string): Promise<void> {
  const run = await getRun(db, runId);
  if (run.status !== 'approved') throw conflict('Approval required before reconciliation');
  await db
    .update(payrollRuns)
    .set({ status: 'reconciled', updatedAt: sql`now()` })
    .where(eq(payrollRuns.id, runId));
}

export async function listLines(db: Db, runId: string, query: LineListQuery): Promise<Page<PayrollLine>> {
  const filters: SQL[] = [eq(payrollLines.runId, runId)];
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(or(ilike(employees.id, pattern), ilike(employees.name, pattern), ilike(employees.branch, pattern))!);
  }
  if (query.exception === 'true')
    filters.push(gt(sql`${payrollLines.blockingFlags} + ${payrollLines.warningFlags}`, 0));
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
    .orderBy(employees.id)
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  return { total, page: query.page, size: query.size, items: rows.map(row => row.result) };
}

/** Blocking exceptions first, capped at 100 for the attention panel. */
export async function listExceptions(db: Db, runId: string): Promise<RunException[]> {
  const rows = await db.execute(sql`
    SELECT l.employee_id AS "employeeId", e.name, flag
    FROM payroll_lines l
    JOIN employees e ON e.id = l.employee_id,
    jsonb_array_elements(l.result -> 'flags') AS flag
    WHERE l.run_id = ${runId}
    ORDER BY CASE WHEN flag ->> 'severity' = 'blocking' THEN 0 ELSE 1 END, e.id
    LIMIT 100`);
  return (rows as unknown as { rows: Array<{ employeeId: string; name: string; flag: RunException }> }).rows.map(
    row => ({ ...row.flag, employeeId: row.employeeId, name: row.name }),
  );
}

export async function listAudit(db: Db, runId: string): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.runId, runId))
    .orderBy(desc(auditEvents.id))
    .limit(100);
  return rows.map(row => ({ ...row, details: row.details ?? {} }));
}

export async function getPayslip(
  db: Db,
  runId: string,
  employeeId: string,
  viewerIsEmployee: boolean,
): Promise<Payslip> {
  const run = await getRun(db, runId);
  if (viewerIsEmployee && !APPROVED_STATUSES.includes(run.status))
    throw forbidden('Payslip is available after approval');
  const [row] = await db
    .select({ result: payrollLines.result })
    .from(payrollLines)
    .where(and(eq(payrollLines.runId, runId), eq(payrollLines.employeeId, employeeId)));
  if (!row) throw notFound('Payslip not found');
  return { period: `${run.year}-${String(run.month).padStart(2, '0')}`, status: run.status, line: row.result };
}

export async function linesForExport(db: Db, runId: string): Promise<PayrollLine[]> {
  const rows = await db
    .select({ result: payrollLines.result })
    .from(payrollLines)
    .where(eq(payrollLines.runId, runId))
    .orderBy(payrollLines.employeeId);
  return rows.map(row => row.result);
}

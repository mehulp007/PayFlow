import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  APPROVED_STATUSES,
  POSITION_LEVELS,
  type Analytics,
  type EmploymentType,
  type RunStatus,
} from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { employees, payrollLines, payrollRuns } from '../../db/schema.js';

/** Sum of a numeric field of the stored payroll line. */
const lineSum = (field: string) => sql<number>`coalesce(sum((${payrollLines.result} ->> ${field})::bigint), 0)::bigint`;

/** Cost trend across pay months, and breakdowns of the latest calculated month. */
export async function analytics(db: Db, organizationId: string): Promise<Analytics> {
  const runs = await db
    .select({
      id: payrollRuns.id,
      year: payrollRuns.year,
      month: payrollRuns.month,
      status: payrollRuns.status,
      headcount: sql<number>`count(${payrollLines.employeeId})::int`,
      gross: sql<number>`coalesce(sum(${payrollLines.gross}), 0)::bigint`,
      net: sql<number>`coalesce(sum(${payrollLines.net}), 0)::bigint`,
      deductions: sql<number>`coalesce(sum(${payrollLines.deductions}), 0)::bigint`,
      employerCost: sql<number>`coalesce(sum(${payrollLines.employerCost}), 0)::bigint`,
    })
    .from(payrollRuns)
    .innerJoin(payrollLines, eq(payrollLines.runId, payrollRuns.id))
    .where(eq(payrollRuns.organizationId, organizationId))
    .groupBy(payrollRuns.id)
    .orderBy(payrollRuns.year, payrollRuns.month);

  // Runs for different pay groups in the same month are added together.
  const months = new Map<number, Analytics['trend'][number] & { runIds: string[]; biggest: number }>();
  for (const run of runs) {
    const key = run.year * 12 + run.month;
    const point = months.get(key) ?? {
      year: run.year,
      month: run.month,
      status: run.status as RunStatus,
      headcount: 0,
      gross: 0,
      net: 0,
      deductions: 0,
      employerCost: 0,
      runIds: [],
      biggest: 0,
    };
    point.headcount += run.headcount;
    point.gross += Number(run.gross);
    point.net += Number(run.net);
    point.deductions += Number(run.deductions);
    point.employerCost += Number(run.employerCost);
    point.runIds.push(run.id);
    if (run.headcount > point.biggest) {
      point.biggest = run.headcount;
      point.status = run.status as RunStatus;
    }
    months.set(key, point);
  }
  const points = [...months.values()];
  const latestPoint = points.at(-1);
  const latestRunIds = latestPoint?.runIds ?? [];
  const inLatest = inArray(
    payrollLines.runId,
    latestRunIds.length ? latestRunIds : ['00000000-0000-0000-0000-000000000000'],
  );

  const departments = await db
    .select({
      department: employees.department,
      headcount: sql<number>`count(*)::int`,
      gross: sql<number>`sum(${payrollLines.gross})::bigint`,
      employerCost: sql<number>`sum(${payrollLines.employerCost})::bigint`,
    })
    .from(payrollLines)
    .innerJoin(employees, eq(employees.id, payrollLines.employeeId))
    .where(inLatest)
    .groupBy(employees.department)
    .orderBy(desc(sql`sum(${payrollLines.gross})`));

  const [statutory] = await db
    .select({
      pf: sql<number>`${lineSum('pfEmployee')} + ${lineSum('pfEmployer')} + ${lineSum('epsEmployer')}`,
      edli: sql<number>`${lineSum('edliEmployer')} + ${lineSum('epfAdminCharges')}`,
      esi: sql<number>`${lineSum('esiEmployee')} + ${lineSum('esiEmployer')}`,
      professionalTax: lineSum('professionalTax'),
      incomeTax: sql<number>`coalesce(sum(${payrollLines.incomeTax}), 0)::bigint`,
      welfare: sql<number>`${lineSum('labourWelfareFund')} + ${lineSum('labourWelfareFundEmployer')}`,
    })
    .from(payrollLines)
    .where(inLatest);

  const active = and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, 'active'));
  const levels = await db
    .select({ level: employees.positionLevel, count: sql<number>`count(*)::int` })
    .from(employees)
    .where(active)
    .groupBy(employees.positionLevel)
    .orderBy(employees.positionLevel);
  const types = await db
    .select({ type: employees.employmentType, count: sql<number>`count(*)::int` })
    .from(employees)
    .where(active)
    .groupBy(employees.employmentType)
    .orderBy(desc(sql`count(*)`));

  // Largest changes against the previous month's approved pay.
  let changes: Analytics['changes'] = [];
  if (latestPoint) {
    const previous =
      latestPoint.month === 1
        ? { year: latestPoint.year - 1, month: 12 }
        : { year: latestPoint.year, month: latestPoint.month - 1 };
    const result = await db.execute(sql`
      SELECT e.code AS "employeeId", e.name, e.department, p.gross AS previous, l.gross AS current
      FROM ${payrollLines} l
      JOIN ${employees} e ON e.id = l.employee_id
      JOIN (
        SELECT pl.employee_id, sum(pl.gross) AS gross
        FROM ${payrollLines} pl JOIN ${payrollRuns} pr ON pr.id = pl.run_id
        WHERE pr.organization_id = ${organizationId} AND pr.year = ${previous.year} AND pr.month = ${previous.month}
          AND pr.status IN (${sql.join(
            APPROVED_STATUSES.map(status => sql`${status}`),
            sql`, `,
          )})
        GROUP BY pl.employee_id
      ) p ON p.employee_id = l.employee_id
      WHERE l.run_id IN (${sql.join(
        latestRunIds.map(id => sql`${id}::uuid`),
        sql`, `,
      )}) AND p.gross > 0 AND l.gross <> p.gross
      ORDER BY abs(l.gross - p.gross)::numeric / p.gross DESC, e.code
      LIMIT 8`);
    changes = (
      result as unknown as {
        rows: Array<{ employeeId: string; name: string; department: string; previous: string; current: string }>;
      }
    ).rows.map(row => ({ ...row, previous: Number(row.previous), current: Number(row.current) }));
  }

  return {
    trend: points.map(({ runIds: _runIds, biggest: _biggest, ...point }) => point),
    latest: latestPoint
      ? { runId: latestRunIds[0], year: latestPoint.year, month: latestPoint.month, status: latestPoint.status }
      : null,
    departments: departments.map(row => ({ ...row, gross: Number(row.gross), employerCost: Number(row.employerCost) })),
    statutory: [
      { label: 'Provident fund', amount: Number(statutory?.pf ?? 0) },
      { label: 'Income tax (TDS)', amount: Number(statutory?.incomeTax ?? 0) },
      { label: 'ESI', amount: Number(statutory?.esi ?? 0) },
      { label: 'EDLI and admin', amount: Number(statutory?.edli ?? 0) },
      { label: 'Professional tax', amount: Number(statutory?.professionalTax ?? 0) },
      { label: 'Labour welfare', amount: Number(statutory?.welfare ?? 0) },
    ],
    levels: levels.map(row => ({
      level: row.level,
      label: POSITION_LEVELS[row.level - 1]?.label ?? `Level ${row.level}`,
      count: row.count,
    })),
    employmentTypes: types.map(row => ({ type: row.type as EmploymentType, count: row.count })),
    changes,
  };
}

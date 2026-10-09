import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AuditPage, AuditQuery, RunStatus, SearchResults } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { auditEvents, branches, employees, payGroups, payrollRuns } from '../../db/schema.js';

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** The organization's audit trail, newest first, filtered by actor, action prefix and date range. */
export async function auditLog(db: Db, organizationId: string, query: AuditQuery): Promise<AuditPage> {
  const filters: SQL[] = [eq(auditEvents.organizationId, organizationId)];
  if (query.actor) filters.push(eq(auditEvents.actor, query.actor));
  if (query.action) filters.push(ilike(auditEvents.action, `${query.action}%`));
  if (query.from) filters.push(gte(auditEvents.createdAt, query.from));
  if (query.to) filters.push(lt(auditEvents.createdAt, sql`${query.to}::date + 1`));
  const where = and(...filters);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(where);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.id))
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  const actors = await db
    .selectDistinct({ actor: auditEvents.actor })
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId))
    .orderBy(auditEvents.actor);
  return {
    total,
    page: query.page,
    size: query.size,
    items: rows.map(({ id, runId, actor, action, details, createdAt }) => ({
      id,
      runId,
      actor,
      action,
      details: details ?? {},
      createdAt,
    })),
    actors: actors.map(row => row.actor),
  };
}

/** People by code, name or title, and pay runs by month name or year, for the command palette. */
export async function search(db: Db, organizationId: string, text: string): Promise<SearchResults> {
  const pattern = `%${text}%`;
  const people = await db
    .select({
      id: employees.code,
      name: employees.name,
      jobTitle: employees.jobTitle,
      branch: branches.name,
      status: employees.employmentStatus,
    })
    .from(employees)
    .innerJoin(branches, eq(branches.id, employees.branchId))
    .where(
      and(
        eq(employees.organizationId, organizationId),
        or(ilike(employees.code, pattern), ilike(employees.name, pattern), ilike(employees.jobTitle, pattern)),
      ),
    )
    .orderBy(employees.employmentStatus, employees.name)
    .limit(8);

  const words = text.toLowerCase().split(/\s+/);
  const month = MONTHS.findIndex(name => words.some(word => word.length >= 3 && name.startsWith(word))) + 1;
  const year = Number(words.find(word => /^20\d\d$/.test(word)) ?? 0);
  const runs =
    month || year
      ? await db
          .select({
            id: payrollRuns.id,
            year: payrollRuns.year,
            month: payrollRuns.month,
            status: payrollRuns.status,
            payGroupName: sql<string>`coalesce(${payGroups.name}, 'All pay groups')`,
          })
          .from(payrollRuns)
          .leftJoin(payGroups, eq(payGroups.id, payrollRuns.payGroupId))
          .where(
            and(
              eq(payrollRuns.organizationId, organizationId),
              month ? eq(payrollRuns.month, month) : undefined,
              year ? eq(payrollRuns.year, year) : undefined,
            ),
          )
          .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
          .limit(6)
      : [];
  return {
    people: people.map(person => ({ ...person, status: person.status === 'exited' ? 'exited' : 'active' })),
    runs: runs.map(run => ({ ...run, status: run.status as RunStatus })),
  };
}

import { and, desc, eq, gte, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  earnedLeaveEntitlement,
  EARNED_LEAVE_RULE,
  leaveDays,
  leaveDaysInMonth,
  monthEnd,
  monthStart,
} from '@payflow/core';
import {
  can,
  EDITABLE_STATUSES,
  LEAVE_TYPE_DETAILS,
  SICK_LEAVE_DAYS,
  type LeaveBalance,
  type LeaveListQuery,
  type LeaveRequest,
  type LeaveRequestBody,
  type LeaveStatus,
  type LeaveSummary,
  type LeaveType,
  type Page,
  type RunStatus,
} from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import { employees, leaveBalances, leaveRequests, payrollRuns } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { Principal } from '../auth/service.js';
import { findEmployeeRow, type EmployeeRow } from '../employees/service.js';
import { accountsForEmployees, notifyPermission, notifyUsers } from '../notifications/service.js';

type RequestRow = typeof leaveRequests.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Requests that hold days: pending ones are reserved until decided. */
const HOLDING: LeaveStatus[] = ['pending', 'approved'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const today = () => new Date().toISOString().slice(0, 10);

/** Months (year, month) a date range touches. */
function monthsBetween(from: string, to: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const lastKey = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (year * 12 + month <= lastKey) {
    months.push({ year, month });
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year++;
  }
  return months;
}

/** Approved leave without pay inside a month, per employee key. Feeds the run's unpaid days. */
export async function unpaidLeaveByEmployee(
  db: Db | Tx,
  organizationId: string,
  year: number,
  month: number,
  employeeKeys?: string[],
): Promise<Map<string, number>> {
  if (employeeKeys && !employeeKeys.length) return new Map();
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const rows = await db
    .select({ employeeId: leaveRequests.employeeId, from: leaveRequests.fromDate, to: leaveRequests.toDate })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.type, 'unpaid'),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.fromDate, end),
        gte(leaveRequests.toDate, start),
        employeeKeys ? inArray(leaveRequests.employeeId, employeeKeys) : undefined,
      ),
    );
  const days = new Map<string, number>();
  for (const row of rows) {
    days.set(row.employeeId, (days.get(row.employeeId) ?? 0) + leaveDaysInMonth(row.from, row.to, year, month));
  }
  return days;
}

/** Days per employee, type and status in a calendar year. */
async function usage(db: Db | Tx, organizationId: string, year: number, employeeKeys: string[]) {
  const rows = employeeKeys.length
    ? await db
        .select({
          employeeId: leaveRequests.employeeId,
          type: leaveRequests.type,
          status: leaveRequests.status,
          days: sql<number>`sum(${leaveRequests.days})::int`,
        })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.organizationId, organizationId),
            inArray(leaveRequests.employeeId, employeeKeys),
            inArray(leaveRequests.status, HOLDING),
            gte(leaveRequests.fromDate, `${year}-01-01`),
            lte(leaveRequests.fromDate, `${year}-12-31`),
          ),
        )
        .groupBy(leaveRequests.employeeId, leaveRequests.type, leaveRequests.status)
    : [];
  const carried = employeeKeys.length
    ? await db
        .select({ employeeId: leaveBalances.employeeId, days: leaveBalances.carriedForward })
        .from(leaveBalances)
        .where(and(inArray(leaveBalances.employeeId, employeeKeys), eq(leaveBalances.year, year)))
    : [];
  return {
    days: (key: string, type: LeaveType, status: LeaveStatus) =>
      rows.find(row => row.employeeId === key && row.type === type && row.status === status)?.days ?? 0,
    carriedForward: (key: string) => carried.find(row => row.employeeId === key)?.days ?? 0,
  };
}

/** Sick and casual leave for the year, pro-rated by whole months for people who join during it. */
function sickAllowance(person: Pick<EmployeeRow, 'joinDate'>, year: number): number {
  if (person.joinDate <= `${year}-01-01`) return SICK_LEAVE_DAYS;
  if (person.joinDate > `${year}-12-31`) return 0;
  const monthsLeft = 13 - Number(person.joinDate.slice(5, 7));
  return Math.floor((SICK_LEAVE_DAYS * monthsLeft) / 12);
}

function balancesOf(
  person: Pick<EmployeeRow, 'id' | 'joinDate' | 'exitDate'>,
  year: number,
  use: Awaited<ReturnType<typeof usage>>,
): LeaveBalance[] {
  const earned = earnedLeaveEntitlement(person, year).days;
  const balance = (type: LeaveType, entitled: number | null, carriedForward = 0): LeaveBalance => {
    const taken = use.days(person.id, type, 'approved');
    const pending = use.days(person.id, type, 'pending');
    return {
      type,
      entitled,
      carriedForward,
      taken,
      pending,
      available: entitled === null ? null : entitled + carriedForward - taken - pending,
    };
  };
  return [
    balance('earned', earned, use.carriedForward(person.id)),
    balance('sick', sickAllowance(person, year)),
    balance('unpaid', null),
  ];
}

/** Earned leave available and paid leave taken this year, for employee lists. */
export async function leaveSnapshot(db: Db | Tx, organizationId: string, people: EmployeeRow[], year: number) {
  const use = await usage(
    db,
    organizationId,
    year,
    people.map(person => person.id),
  );
  return new Map(
    people.map(person => {
      const [earned, sick] = balancesOf(person, year, use);
      return [person.id, { balance: earned.available ?? 0, taken: earned.taken + sick.taken }];
    }),
  );
}

function toRequest(row: RequestRow, person: { code: string; name: string }): LeaveRequest {
  return {
    id: row.id,
    employeeId: person.code,
    employeeName: person.name,
    type: row.type as LeaveType,
    from: row.fromDate,
    to: row.toDate,
    days: row.days,
    reason: row.reason,
    status: row.status as LeaveStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
  };
}

export async function leaveSummary(db: Db, organizationId: string, code: string, year: number): Promise<LeaveSummary> {
  const person = await findEmployeeRow(db, organizationId, code);
  const use = await usage(db, organizationId, year, [person.id]);
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, person.id))
    .orderBy(desc(leaveRequests.fromDate))
    .limit(50);
  const accrual = earnedLeaveEntitlement(person, year);
  return {
    employeeId: person.code,
    year,
    balances: balancesOf(person, year, use),
    requests: rows.map(row => toRequest(row, person)),
    earned: { daysWorkedLastYear: accrual.daysWorked, qualifies: accrual.qualifies },
  };
}

/**
 * Pay runs that cover the person in the given months. Leave without pay can only change months whose run is
 * still being prepared (or not yet opened).
 */
async function runsCovering(db: Db | Tx, person: EmployeeRow, months: Array<{ year: number; month: number }>) {
  const periods = months.map(({ year, month }) => and(eq(payrollRuns.year, year), eq(payrollRuns.month, month))!);
  return db
    .select({ id: payrollRuns.id, year: payrollRuns.year, month: payrollRuns.month, status: payrollRuns.status })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.organizationId, person.organizationId),
        or(...periods),
        or(sql`${payrollRuns.payGroupId} IS NULL`, eq(payrollRuns.payGroupId, person.payGroupId)),
      ),
    );
}

async function assertMonthsOpen(db: Db | Tx, person: EmployeeRow, from: string, to: string) {
  const runs = await runsCovering(db, person, monthsBetween(from, to));
  const closed = runs.find(run => !EDITABLE_STATUSES.includes(run.status as RunStatus));
  if (closed) {
    throw conflict(
      `${MONTH_NAMES[closed.month - 1]} ${closed.year} payroll is already with Finance or approved; choose dates after it`,
    );
  }
  return runs;
}

/** A calculated run whose unpaid leave changed goes back to draft, so it must be recalculated before approval. */
async function markRunsForRecalculation(db: Db | Tx, runs: Array<{ id: string; status: string }>) {
  const calculated = runs.filter(run => run.status === 'calculated').map(run => run.id);
  if (calculated.length) {
    await db
      .update(payrollRuns)
      .set({ status: 'draft', updatedAt: sql`now()` })
      .where(inArray(payrollRuns.id, calculated));
  }
}

export async function requestLeave(
  db: Db,
  organizationId: string,
  principal: Principal,
  code: string,
  body: LeaveRequestBody & { reason: string | null },
): Promise<LeaveRequest> {
  const person = await findEmployeeRow(db, organizationId, code);
  if (person.employmentStatus !== 'active') throw conflict('This person has left');
  if (!person.payrollScope) throw badRequest('Contractors’ leave is managed outside PayFlow');
  if (body.from < person.joinDate) throw badRequest('Leave cannot start before the joining date');
  if (person.exitDate && body.to > person.exitDate) throw badRequest('Leave cannot run past the exit date');
  const days = leaveDays(body.from, body.to);
  if (!days) throw badRequest('Choose at least one working day (Sunday is the weekly rest day)');
  const [overlap] = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, person.id),
        inArray(leaveRequests.status, HOLDING),
        lte(leaveRequests.fromDate, body.to),
        gte(leaveRequests.toDate, body.from),
      ),
    );
  if (overlap) throw conflict('These dates overlap another leave request');
  const year = Number(body.from.slice(0, 4));
  if (body.type !== 'unpaid') {
    const balance = balancesOf(person, year, await usage(db, organizationId, year, [person.id])).find(
      item => item.type === body.type,
    )!;
    if ((balance.available ?? 0) < days) {
      throw conflict(
        `Only ${Math.max(0, balance.available ?? 0)} days of ${LEAVE_TYPE_DETAILS[body.type].label.toLowerCase()} are available`,
      );
    }
  }
  await assertMonthsOpen(db, person, body.from, body.to);
  const [created] = await db
    .insert(leaveRequests)
    .values({
      organizationId,
      employeeId: person.id,
      type: body.type,
      fromDate: body.from,
      toDate: body.to,
      days,
      reason: body.reason,
    })
    .returning();
  // The manager (if they have an account) and HR are asked to decide.
  const notification = {
    kind: 'leave.requested',
    title: `${person.name} requested ${days} ${days === 1 ? 'day' : 'days'} of ${LEAVE_TYPE_DETAILS[body.type].label.toLowerCase()}`,
    body: `${body.from} to ${body.to}`,
    link: '/leave',
  };
  const managerAccounts = person.managerId ? await accountsForEmployees(db, organizationId, [person.managerId]) : [];
  await notifyUsers(db, organizationId, managerAccounts, { ...notification, link: '/me' }, principal.id);
  await notifyPermission(db, organizationId, 'leave.manage', notification, principal.id);
  return toRequest(created, person);
}

async function findRequest(db: Db | Tx, organizationId: string, id: string) {
  if (!UUID.test(id)) throw notFound('Leave request not found');
  const [row] = await db
    .select({ request: leaveRequests, person: employees })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.organizationId, organizationId)));
  if (!row) throw notFound('Leave request not found');
  return row;
}

/** HR decides anyone's leave; a manager decides their direct reports'. Nobody decides their own. */
function assertCanDecide(principal: Principal, person: EmployeeRow) {
  if (principal.employeeKey === person.id) throw forbidden('You cannot decide your own leave');
  if (can(principal.role, 'leave.manage')) return;
  if (principal.employeeKey && person.managerId === principal.employeeKey) return;
  throw forbidden('Only the person’s manager or HR can decide this leave');
}

export async function decideLeave(
  db: Db,
  organizationId: string,
  principal: Principal,
  id: string,
  decision: { decision: 'approved' | 'rejected'; note: string | null },
): Promise<LeaveRequest> {
  const { request, person } = await findRequest(db, organizationId, id);
  assertCanDecide(principal, person);
  if (request.status !== 'pending') throw conflict('This request has already been decided');
  const runs =
    decision.decision === 'approved' && request.type === 'unpaid'
      ? await assertMonthsOpen(db, person, request.fromDate, request.toDate)
      : [];
  const [updated] = await db
    .update(leaveRequests)
    .set({
      status: decision.decision,
      decidedBy: principal.username,
      decidedAt: sql`now()`,
      decisionNote: decision.note,
    })
    .where(eq(leaveRequests.id, id))
    .returning();
  await markRunsForRecalculation(db, runs);
  await notifyUsers(
    db,
    organizationId,
    await accountsForEmployees(db, organizationId, [person.id]),
    {
      kind: `leave.${decision.decision}`,
      title: `Your leave from ${request.fromDate} was ${decision.decision}`,
      body: decision.note,
      link: '/me',
    },
    principal.id,
  );
  return toRequest(updated, person);
}

/** The person (or HR) withdraws a request. Approved leave can be cancelled while its months are still open. */
export async function cancelLeave(db: Db, organizationId: string, principal: Principal, id: string): Promise<void> {
  const { request, person } = await findRequest(db, organizationId, id);
  if (principal.employeeKey !== person.id && !can(principal.role, 'leave.manage')) throw forbidden();
  if (!HOLDING.includes(request.status as LeaveStatus))
    throw conflict('Only pending or approved leave can be cancelled');
  if (request.status === 'approved' && request.toDate < today() && principal.employeeKey === person.id) {
    throw conflict('Leave already taken can only be corrected by HR');
  }
  const runs =
    request.status === 'approved' ? await assertMonthsOpen(db, person, request.fromDate, request.toDate) : [];
  await db
    .update(leaveRequests)
    .set({ status: 'cancelled', decidedBy: principal.username, decidedAt: sql`now()` })
    .where(eq(leaveRequests.id, id));
  if (request.type === 'unpaid') await markRunsForRecalculation(db, runs);
}

/** Leave requests for HR (`all`) or for the signed-in manager's direct reports (`team`). */
export async function listLeave(
  db: Db,
  organizationId: string,
  principal: Principal,
  query: LeaveListQuery,
): Promise<Page<LeaveRequest>> {
  const filters: SQL[] = [eq(leaveRequests.organizationId, organizationId)];
  if (query.scope === 'team') {
    if (!principal.employeeKey) return { total: 0, page: query.page, size: query.size, items: [] };
    filters.push(eq(employees.managerId, principal.employeeKey));
  } else if (!can(principal.role, 'leave.manage')) {
    throw forbidden();
  }
  if (query.status) filters.push(eq(leaveRequests.status, query.status));
  if (principal.employeeKey) filters.push(ne(leaveRequests.employeeId, principal.employeeKey));
  const where = and(...filters);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(where);
  const rows = await db
    .select({ request: leaveRequests, code: employees.code, name: employees.name })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(where)
    .orderBy(query.status === 'pending' ? leaveRequests.fromDate : desc(leaveRequests.createdAt))
    .limit(query.size)
    .offset((query.page - 1) * query.size);
  return {
    total,
    page: query.page,
    size: query.size,
    items: rows.map(row => toRequest(row.request, row)),
  };
}

/** HR records earned leave brought forward into a year, within the 30-day carry-forward limit. */
export async function setCarryForward(db: Db, organizationId: string, code: string, year: number, days: number) {
  if (days > EARNED_LEAVE_RULE.carryForwardLimit) throw badRequest('At most 30 days can be carried forward');
  const person = await findEmployeeRow(db, organizationId, code);
  await db
    .insert(leaveBalances)
    .values({ organizationId, employeeId: person.id, year, carriedForward: days })
    .onConflictDoUpdate({ target: [leaveBalances.employeeId, leaveBalances.year], set: { carriedForward: days } });
}

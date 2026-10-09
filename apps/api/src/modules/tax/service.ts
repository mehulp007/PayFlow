import { and, eq, sql } from 'drizzle-orm';
import { compareRegimes, monthStart } from '@payflow/core';
import type { Declaration, DeclarationInput, DeclarationStatus, TaxSummary } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { branches, payGroups, salaryRevisions, taxDeclarations } from '../../db/schema.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { findEmployeeRow, toPayrollProfile, type EmployeeRow } from '../employees/service.js';
import { latestRun, salaryFor, taxYearStart, yearToDate } from '../runs/service.js';

type DeclarationRow = typeof taxDeclarations.$inferSelect;

const toDeclaration = (row: DeclarationRow): Declaration => ({
  ...row.data,
  taxYear: row.taxYear,
  status: row.status as DeclarationStatus,
  submittedAt: row.submittedAt,
  verifiedBy: row.verifiedBy,
  verifiedAt: row.verifiedAt,
});

/** The pay month tax is projected for: the organization's latest run, or the current month without runs. */
async function currentPeriod(db: Db, organizationId: string) {
  const run = await latestRun(db, organizationId);
  if (run) return { run, year: run.year, month: run.month, paymentDate: run.paymentDate };
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return { run: null, year, month, paymentDate: `${year}-${String(month).padStart(2, '0')}-28` };
}

async function findDeclaration(db: Db, employeeKey: string, taxYear: number) {
  const [row] = await db
    .select()
    .from(taxDeclarations)
    .where(and(eq(taxDeclarations.employeeId, employeeKey), eq(taxDeclarations.taxYear, taxYear)));
  return row ?? null;
}

function assertInPayroll(person: EmployeeRow) {
  if (!person.payrollScope) throw badRequest('Contractor records are outside employee payroll');
}

/** The person's declaration and a comparison of both regimes for the current tax year. */
export async function taxSummary(db: Db, organizationId: string, code: string): Promise<TaxSummary> {
  const person = await findEmployeeRow(db, organizationId, code);
  assertInPayroll(person);
  const period = await currentPeriod(db, organizationId);
  const taxYear = taxYearStart(period.year, period.month);
  const [place] = await db
    .select({ branch: branches.name, state: branches.state, payGroup: payGroups.name })
    .from(branches)
    .innerJoin(payGroups, eq(payGroups.id, person.payGroupId))
    .where(eq(branches.id, person.branchId));
  const revisions = await db
    .select()
    .from(salaryRevisions)
    .where(eq(salaryRevisions.employeeId, person.id))
    .orderBy(salaryRevisions.effectiveFrom);
  const history = await yearToDate(db, { organizationId, year: period.year, month: period.month });
  const declaration = await findDeclaration(db, person.id, taxYear);
  const profile = toPayrollProfile(person, place, salaryFor(person, revisions, monthStart(period.year, period.month)), {
    history: history ? (history.get(person.id) ?? { salaryPaidThisYear: 0, taxAlreadyDeducted: 0 }) : undefined,
    declaration: declaration?.data ?? null,
  });
  return {
    employeeId: person.code,
    taxYearLabel: `${taxYear}–${String(taxYear + 1).slice(2)}`,
    period: { year: period.year, month: period.month },
    regime: profile.taxRegime,
    regimeLocked: Boolean(period.run && period.run.status !== 'draft'),
    declaration: declaration ? toDeclaration(declaration) : null,
    comparison: compareRegimes(profile, period),
  };
}

/** Saves the person's declaration for the current tax year; HR verifies it again after any change. */
export async function saveDeclaration(
  db: Db,
  organizationId: string,
  code: string,
  body: DeclarationInput,
): Promise<{ person: EmployeeRow; declaration: Declaration }> {
  const person = await findEmployeeRow(db, organizationId, code);
  assertInPayroll(person);
  if (person.employmentStatus !== 'active') throw conflict('This person has left');
  const period = await currentPeriod(db, organizationId);
  const taxYear = taxYearStart(period.year, period.month);
  const [row] = await db
    .insert(taxDeclarations)
    .values({ organizationId, employeeId: person.id, taxYear, data: body })
    .onConflictDoUpdate({
      target: [taxDeclarations.employeeId, taxDeclarations.taxYear],
      set: { data: body, status: 'submitted', submittedAt: sql`now()`, verifiedBy: null, verifiedAt: null },
    })
    .returning();
  return { person, declaration: toDeclaration(row) };
}

export async function verifyDeclaration(
  db: Db,
  organizationId: string,
  code: string,
  verifiedBy: string,
): Promise<{ person: EmployeeRow; declaration: Declaration }> {
  const person = await findEmployeeRow(db, organizationId, code);
  const period = await currentPeriod(db, organizationId);
  const existing = await findDeclaration(db, person.id, taxYearStart(period.year, period.month));
  if (!existing) throw notFound('No declaration for this tax year');
  const [row] = await db
    .update(taxDeclarations)
    .set({ status: 'verified', verifiedBy, verifiedAt: sql`now()` })
    .where(eq(taxDeclarations.id, existing.id))
    .returning();
  return { person, declaration: toDeclaration(row) };
}

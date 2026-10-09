import { parse } from 'csv-parse/sync';
import { and, eq, inArray } from 'drizzle-orm';
import { IMPORT_COLUMNS, type ImportPreview } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { employees, payrollInputs } from '../../db/schema.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { getRun, syncInputs } from './service.js';

type CsvRow = Record<(typeof IMPORT_COLUMNS)[number] | 'note', string | undefined>;
const toPaise = (rupees: number) => Math.round(rupees * 100);

/** Checks columns, IDs, duplicates and amounts. Rupee amounts in the file become integer paise. */
export function parseImport(text: string): ImportPreview {
  let rows: CsvRow[];
  try {
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    return { valid: [], errors: [{ row: 0, message: 'Invalid CSV format' }] };
  }
  if (!rows.length) return { valid: [], errors: [{ row: 0, message: 'CSV is empty' }] };
  if (IMPORT_COLUMNS.some(column => !(column in rows[0]))) {
    return { valid: [], errors: [{ row: 1, message: `Required columns: ${IMPORT_COLUMNS.join(', ')}` }] };
  }
  const seen = new Set<string>();
  const result: ImportPreview = { valid: [], errors: [] };
  rows.forEach((row, index) => {
    const line = index + 2;
    const employeeId = row.employee_id ?? '';
    if (!/^EMP\d{5}$/.test(employeeId)) return result.errors.push({ row: line, message: 'Invalid employee ID' });
    if (seen.has(employeeId)) return result.errors.push({ row: line, message: 'Duplicate employee ID' });
    seen.add(employeeId);
    const [variablePay, otherDeduction, unpaidDays, workingDays] = [
      row.variable_pay,
      row.other_deduction,
      row.unpaid_days,
      row.working_days,
    ].map(Number);
    const valid =
      [variablePay, otherDeduction, unpaidDays, workingDays].every(Number.isFinite) &&
      Number.isSafeInteger(toPaise(variablePay)) &&
      Number.isSafeInteger(toPaise(otherDeduction)) &&
      variablePay >= 0 &&
      otherDeduction >= 0 &&
      unpaidDays >= 0 &&
      workingDays > 0 &&
      unpaidDays <= workingDays &&
      Number.isInteger(unpaidDays) &&
      Number.isInteger(workingDays);
    if (!valid) return result.errors.push({ row: line, message: 'Invalid pay or attendance value' });
    result.valid.push({
      employeeId,
      variablePay: toPaise(variablePay),
      otherDeduction: toPaise(otherDeduction),
      unpaidDays,
      workingDays,
      note: row.note || undefined,
    });
  });
  return result;
}

/**
 * Adds database checks against the run: unknown or out-of-run employees, and pay amounts for contractors
 * (attendance only). Employee IDs in the file are the organization's employee codes.
 */
export async function reviewImport(
  db: Db,
  organizationId: string,
  runId: string,
  text: string,
): Promise<ImportPreview> {
  const run = await getRun(db, organizationId, runId);
  const result = parseImport(text);
  if (!result.valid.length) return result;
  await syncInputs(db, run);
  const codes = result.valid.map(row => row.employeeId);
  const found = await db
    .select({ code: employees.code, payrollScope: employees.payrollScope, inRun: payrollInputs.runId })
    .from(employees)
    .leftJoin(payrollInputs, and(eq(payrollInputs.employeeId, employees.id), eq(payrollInputs.runId, runId)))
    .where(and(eq(employees.organizationId, organizationId), inArray(employees.code, codes)));
  const known = new Map(found.map(row => [row.code, row]));
  const rejected = new Set<string>();
  for (const row of result.valid) {
    const employee = known.get(row.employeeId);
    const reject = (message: string) => {
      result.errors.push({ row: 0, message });
      rejected.add(row.employeeId);
    };
    if (!employee) reject(`Unknown employee: ${row.employeeId}`);
    else if (!employee.inRun) reject(`${row.employeeId} is not part of this run`);
    else if (!employee.payrollScope && (row.variablePay > 0 || row.otherDeduction > 0)) {
      reject(`Contractor ${row.employeeId} accepts attendance only`);
    }
  }
  result.valid = result.valid.filter(row => !rejected.has(row.employeeId));
  return result;
}

export async function commitImport(db: Db, organizationId: string, runId: string, text: string): Promise<number> {
  const run = await getRun(db, organizationId, runId);
  if (run.status !== 'draft') throw conflict('Inputs are locked after calculation');
  const { valid, errors } = await reviewImport(db, organizationId, runId, text);
  if (errors.length) throw badRequest(`Import has ${errors.length} validation errors`);
  const keys = await db
    .select({ id: employees.id, code: employees.code })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        inArray(
          employees.code,
          valid.map(row => row.employeeId),
        ),
      ),
    );
  const keyByCode = new Map(keys.map(row => [row.code, row.id]));
  await db.transaction(async tx => {
    for (const row of valid) {
      await tx
        .update(payrollInputs)
        .set({
          variablePay: row.variablePay,
          otherDeduction: row.otherDeduction,
          unpaidDays: row.unpaidDays,
          workingDays: row.workingDays,
          note: row.note ?? null,
        })
        .where(and(eq(payrollInputs.runId, runId), eq(payrollInputs.employeeId, keyByCode.get(row.employeeId)!)));
    }
  });
  return valid.length;
}

import { parse } from 'csv-parse/sync';
import { inArray, sql } from 'drizzle-orm';
import { IMPORT_COLUMNS, type ImportPreview } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { employees, payrollInputs } from '../../db/schema.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { getRun } from './service.js';

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

/** Adds database checks: unknown employees, and pay amounts for contractors (attendance only). */
export async function reviewImport(db: Db, text: string): Promise<ImportPreview> {
  const result = parseImport(text);
  if (!result.valid.length) return result;
  const ids = result.valid.map(row => row.employeeId);
  const found = await db
    .select({ id: employees.id, payrollScope: employees.payrollScope })
    .from(employees)
    .where(inArray(employees.id, ids));
  const known = new Map(found.map(row => [row.id, row.payrollScope]));
  const rejected = new Set<string>();
  for (const row of result.valid) {
    if (!known.has(row.employeeId)) {
      result.errors.push({ row: 0, message: `Unknown employee: ${row.employeeId}` });
      rejected.add(row.employeeId);
    } else if (known.get(row.employeeId) === false && (row.variablePay > 0 || row.otherDeduction > 0)) {
      result.errors.push({ row: 0, message: `Contractor ${row.employeeId} accepts attendance only` });
      rejected.add(row.employeeId);
    }
  }
  result.valid = result.valid.filter(row => !rejected.has(row.employeeId));
  return result;
}

export async function commitImport(db: Db, runId: string, text: string): Promise<number> {
  const run = await getRun(db, runId);
  if (run.status !== 'draft') throw conflict('Inputs are locked after calculation');
  const { valid, errors } = await reviewImport(db, text);
  if (errors.length) throw badRequest(`Import has ${errors.length} validation errors`);
  await db.transaction(async tx => {
    for (const row of valid) {
      await tx
        .insert(payrollInputs)
        .values({ runId, ...row, note: row.note ?? null })
        .onConflictDoUpdate({
          target: [payrollInputs.runId, payrollInputs.employeeId],
          set: {
            variablePay: sql`excluded.variable_pay`,
            otherDeduction: sql`excluded.other_deduction`,
            unpaidDays: sql`excluded.unpaid_days`,
            workingDays: sql`excluded.working_days`,
            note: sql`excluded.note`,
          },
        });
    }
  });
  return valid.length;
}

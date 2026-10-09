import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  ctx = await createTestContext();
  for (const username of ['hr', 'payroll', 'employee']) tokens[username] = await ctx.login(username);
});
afterAll(async () => {
  await ctx.close();
});

const declaration = {
  monthlyRent: 30000_00,
  rentCity: 'Bengaluru',
  landlordPan: 'afkpa1234z',
  landlordRelation: null,
  section123: 100000_00,
  npsAdditional: 0,
  healthSelf: 20000_00,
  healthParents: 0,
  parentsSenior: false,
  homeLoanInterest: 0,
};

describe('tax declarations and regime comparison', () => {
  test('employees see both regimes for the current tax year', async () => {
    const summary = await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00001/tax');
    expect(summary.body).toMatchObject({
      employeeId: 'EMP00001',
      taxYearLabel: '2026–27',
      period: { year: 2026, month: 10 },
      regime: 'new',
      regimeLocked: false,
      declaration: null,
    });
    const { comparison } = summary.body;
    expect(comparison.new.standardDeduction).toBe(75000_00);
    expect(comparison.old.standardDeduction).toBe(50000_00);
    expect(['new', 'old']).toContain(comparison.recommended);
    expect((await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00002/tax')).status).toBe(403);
    expect((await ctx.call(tokens.hr, 'GET', '/api/employees/EMP00017/tax')).status).toBe(400); // contractor
  });

  test('declarations are validated like Form 124', async () => {
    const save = (body: object, token = tokens.employee, code = 'EMP00001') =>
      ctx.call(token, 'PUT', `/api/employees/${code}/declaration`, { ...declaration, ...body });
    expect((await save({ landlordPan: null })).body.issues[0].path).toBe('landlordPan');
    expect((await save({ rentCity: null })).body.issues[0].path).toBe('rentCity');
    expect((await save({ landlordPan: 'NOTAPAN' })).status).toBe(400);
    expect((await save({}, tokens.employee, 'EMP00002')).status).toBe(403);
    expect((await save({}, tokens.payroll)).status).toBe(403);

    const saved = await save({});
    expect(saved.body.declaration).toMatchObject({ status: 'submitted', landlordPan: 'AFKPA1234Z', taxYear: 2026 });
    const lines = saved.body.comparison.old.deductions.lines.map((line: { code: string }) => line.code);
    expect(lines).toEqual(expect.arrayContaining(['hra', 'section-123', 'section-126', 'professional-tax']));
    const hrFeed = (await ctx.call(tokens.hr, 'GET', '/api/notifications')).body;
    expect(hrFeed.items[0].kind).toBe('declaration.submitted');
  });

  test('HR verifies; the next calculation uses the declaration under the old regime', async () => {
    expect((await ctx.call(tokens.employee, 'POST', '/api/employees/EMP00001/declaration/verify')).status).toBe(403);
    const verified = await ctx.call(tokens.hr, 'POST', '/api/employees/EMP00001/declaration/verify');
    expect(verified.body.declaration).toMatchObject({ status: 'verified', verifiedBy: 'hr' });
    expect((await ctx.call(tokens.employee, 'GET', '/api/notifications')).body.items[0].kind).toBe(
      'declaration.verified',
    );

    await ctx.call(tokens.employee, 'PATCH', '/api/employees/EMP00001', { taxRegime: 'old' });
    const summary = (await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00001/tax')).body;
    const run = await ctx.currentRunId(tokens.hr);
    await ctx.call(tokens.payroll, 'POST', `/api/runs/${run}/calculate`);
    const line = (await ctx.call(tokens.hr, 'GET', `/api/runs/${run}/payslip/EMP00001`)).body.line;
    expect(line.taxDeductionsAllowed).toBe(summary.comparison.old.deductions.total);
    expect(line.annualProjectedTax).toBe(summary.comparison.old.total);
    expect(line.ruleNotes.some((note: string) => note.startsWith('Old regime:'))).toBe(true);
    // The regime is locked once the run is calculated.
    expect((await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00001/tax')).body.regimeLocked).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { approveRun } from '../src/modules/runs/service.js';
import { createTestContext, newJoiners, SEED_SIZE, type TestContext } from './helpers.js';

let ctx: TestContext;
let run: string;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  ctx = await createTestContext();
  for (const username of ['admin', 'hr', 'payroll', 'finance', 'auditor', 'employee']) {
    tokens[username] = await ctx.login(username);
  }
  run = `/api/runs/${await ctx.currentRunId(tokens.hr)}`;
});
afterAll(async () => {
  await ctx.close();
});

const csv = (rows: string) => ({
  csv: `employee_id,variable_pay,other_deduction,unpaid_days,working_days,note\n${rows}`,
});

describe('payroll run lifecycle', () => {
  test('the open run is October 2026; employees see only its period and status', async () => {
    const bootstrap = await ctx.call(tokens.employee, 'GET', '/api/bootstrap');
    expect(bootstrap.body.currentRun).toMatchObject({
      year: 2026,
      month: 10,
      status: 'draft',
      payGroupName: 'All pay groups',
    });
    expect(bootstrap.body.currentRun.net).toBeUndefined();
    expect((await ctx.call(tokens.employee, 'GET', `${run}/lines`)).status).toBe(403);
    expect((await ctx.call(tokens.employee, 'GET', '/api/runs')).status).toBe(403);
  });

  test('imports are previewed, validated and committed', async () => {
    const preview = (body: object) => ctx.call(tokens.payroll, 'POST', `${run}/import/preview`, body);
    expect((await preview(csv('EMP00001,100,0,0,31,\nEMP00001,100,0,0,31,'))).body.errors[0].message).toBe(
      'Duplicate employee ID',
    );
    expect((await preview(csv('EMP99999,100,0,0,31,'))).body.errors[0].message).toBe('Unknown employee: EMP99999');
    expect((await preview(csv('EMP00017,100,0,0,31,'))).body.errors[0].message).toBe(
      'Contractor EMP00017 accepts attendance only',
    );
    expect((await preview({ csv: 'employee_id\nEMP00001' })).body.errors[0].message).toMatch(/^Required columns/);
    expect((await ctx.call(tokens.auditor, 'POST', `${run}/import/preview`, csv('EMP00001,0,0,0,31,'))).status).toBe(
      403,
    );
    const committed = await ctx.call(
      tokens.payroll,
      'POST',
      `${run}/import/commit`,
      csv('EMP00001,2500,0,1,31,Bonus\nEMP00017,0,0,2,31,'),
    );
    expect(committed.body).toEqual({ ok: true, imported: 2 });
    expect((await ctx.call(tokens.hr, 'GET', '/api/employees/EMP00017')).body.unpaidDays).toBe(2);
  });

  test('calculation flags the new joiners without bank details', async () => {
    const calculated = await ctx.call(tokens.payroll, 'POST', `${run}/calculate`);
    expect(calculated.body).toMatchObject({ status: 'calculated', blocking: 12 });
    expect(calculated.body.calculatedEmployees).toBe(calculated.body.totalEmployees);
    expect(calculated.body.totalEmployees).toBeLessThan(SEED_SIZE);
    expect(calculated.body.gross - calculated.body.deductions).toBe(calculated.body.net);
    const exceptions = await ctx.call(tokens.auditor, 'GET', `${run}/exceptions`);
    expect(exceptions.body[0]).toMatchObject({
      code: 'BANK_MISSING',
      severity: 'blocking',
      employeeId: newJoiners(SEED_SIZE)[0],
    });
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/import/commit`, csv('EMP00001,0,0,0,31,'))).status).toBe(
      409,
    );
    expect((await ctx.call(tokens.employee, 'PATCH', '/api/employees/EMP00001', { taxRegime: 'old' })).status).toBe(
      409,
    );
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/submit`)).status).toBe(409);
  });

  test('lines carry the statutory rules for their state', async () => {
    const lines = await ctx.call(tokens.auditor, 'GET', `${run}/lines?size=10&search=Gurugram`);
    const haryana = lines.body.items[0];
    expect(haryana.state).toBe('Haryana');
    expect(haryana.professionalTax).toBe(0);
    expect(haryana.labourWelfareFund).toBeGreaterThan(0);
    expect(haryana.ruleNotes).toContain('Haryana does not levy professional tax');
  });

  test('Finance can send a run back with a note; it is fixed and resubmitted', async () => {
    for (const code of newJoiners(SEED_SIZE)) {
      expect(
        (await ctx.call(tokens.hr, 'PATCH', `/api/employees/${code}`, { bankReady: true, bankAccountLast4: '1234' }))
          .status,
      ).toBe(200);
    }
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/calculate`)).body.blocking).toBe(0);
    expect((await ctx.call(tokens.finance, 'POST', `${run}/submit`)).status).toBe(403);
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/submit`)).body.status).toBe('approval_pending');
    expect((await ctx.call(tokens.finance, 'POST', `${run}/reject`, { note: '' })).status).toBe(400);
    const rejected = await ctx.call(tokens.finance, 'POST', `${run}/reject`, { note: 'Check the bonus for EMP00001' });
    expect(rejected.body).toMatchObject({ status: 'calculated', rejectionNote: 'Check the bonus for EMP00001' });
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/submit`)).body).toMatchObject({
      status: 'approval_pending',
      rejectionNote: null,
    });
  });

  test('maker-checker: only Finance approves, and never the preparer', async () => {
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/approve`, {})).status).toBe(403);
    const preparer = (await ctx.call(tokens.hr, 'GET', run)).body.preparedBy;
    const runId = run.split('/').at(-1)!;
    const organizationId = (await ctx.call(tokens.hr, 'GET', '/api/bootstrap')).body.organization.id;
    await expect(approveRun(ctx.database.db, organizationId, runId, preparer)).rejects.toThrow(
      'Preparer cannot approve',
    );
    expect((await ctx.call(tokens.employee, 'GET', `${run}/payslip/EMP00001`)).status).toBe(403);
    expect((await ctx.call(tokens.finance, 'GET', `${run}/export/bank-demo`)).status).toBe(409);
    expect((await ctx.call(tokens.finance, 'POST', `${run}/approve`, { note: 'Checked totals' })).body.status).toBe(
      'approved',
    );
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/calculate`)).status).toBe(409);
  });

  test('after approval: payslips, exports, payment and closing the period', async () => {
    const payslip = await ctx.call(tokens.employee, 'GET', `${run}/payslip/EMP00001`);
    expect(payslip.body).toMatchObject({ period: '2026-10' });
    expect(payslip.body.line.variablePay).toBe(250000);
    expect((await ctx.call(tokens.employee, 'GET', `${run}/payslip/EMP00002`)).status).toBe(403);
    expect((await ctx.call(tokens.employee, 'GET', '/api/me/payslips')).body).toHaveLength(1);

    const bank = await ctx.call(tokens.finance, 'GET', `${run}/export/bank-demo`);
    expect(bank.text.startsWith('"DEMO ONLY - NOT A BANK UPLOAD FILE"')).toBe(true);
    expect((await ctx.call(tokens.auditor, 'GET', `${run}/export/epf-prep`)).text.split('\r\n')[0]).toContain(
      '"EPS wages INR"',
    );
    // Casual support staff earn within the ESI ceiling.
    expect((await ctx.call(tokens.auditor, 'GET', `${run}/export/esi-prep`)).text.split('\r\n').length).toBeGreaterThan(
      3,
    );

    expect((await ctx.call(tokens.finance, 'POST', `${run}/close`)).status).toBe(409);
    expect((await ctx.call(tokens.payroll, 'POST', `${run}/reconcile`)).status).toBe(403);
    expect((await ctx.call(tokens.finance, 'POST', `${run}/reconcile`)).body.status).toBe('paid');
    expect((await ctx.call(tokens.hr, 'POST', `${run}/close`)).status).toBe(403);
    expect((await ctx.call(tokens.finance, 'POST', `${run}/close`)).body.status).toBe('closed');

    const actions = (await ctx.call(tokens.auditor, 'GET', `${run}/audit`)).body.map(
      (event: { action: string }) => event.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['payroll.calculated', 'payroll.sent_back', 'payroll.approved', 'payroll.closed']),
    );
  });

  test('new periods: payment deadline, no duplicates, and year-to-date tax from approved runs', async () => {
    const create = (body: object) => ctx.call(tokens.payroll, 'POST', '/api/runs', body);
    expect((await create({ year: 2026, month: 11, paymentDate: '2026-12-08' })).status).toBe(400);
    const november = await create({ year: 2026, month: 11, paymentDate: '2026-11-30' });
    expect(november.body).toMatchObject({ status: 'draft', month: 11 });
    expect((await create({ year: 2026, month: 11, paymentDate: '2026-11-30' })).status).toBe(409);
    expect(
      (await ctx.call(tokens.auditor, 'POST', '/api/runs', { year: 2026, month: 12, paymentDate: '2026-12-31' }))
        .status,
    ).toBe(403);

    await ctx.call(tokens.payroll, 'POST', `/api/runs/${november.body.id}/calculate`);
    const october = (await ctx.call(tokens.employee, 'GET', `${run}/payslip/EMP00001`)).body.line;
    const novemberLine = (await ctx.call(tokens.hr, 'GET', `/api/runs/${november.body.id}/payslip/EMP00001`)).body.line;
    // November's projection counts October's actual pay (including its bonus) instead of assuming a regular month.
    expect(novemberLine.annualProjectedTax).toBeGreaterThanOrEqual(october.annualProjectedTax);
    const runs = (await ctx.call(tokens.hr, 'GET', '/api/runs')).body.map((item: { month: number }) => item.month);
    expect(runs).toEqual([11, 10]);
  });
});

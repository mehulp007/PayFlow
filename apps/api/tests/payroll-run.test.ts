import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { approveRun } from '../src/modules/runs/service.js';
import { DEMO_RUN_ID } from '../src/db/seed.js';
import { createTestContext, employeeId, RUN, SEED_SIZE, type TestContext } from './helpers.js';

let ctx: TestContext;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  ctx = await createTestContext();
  for (const username of ['admin', 'hr', 'payroll', 'finance', 'auditor', 'employee'])
    tokens[username] = await ctx.login(username);
});
afterAll(async () => {
  await ctx.close();
});

const csv = (rows: string) => ({
  csv: `employee_id,variable_pay,other_deduction,unpaid_days,working_days,note\n${rows}`,
});

describe('payroll run lifecycle', () => {
  test('employees see only the period and status, never totals', async () => {
    const bootstrap = await ctx.call(tokens.employee, 'GET', '/api/bootstrap');
    expect(bootstrap.body.currentRun).toEqual({
      id: DEMO_RUN_ID,
      year: 2026,
      month: 9,
      paymentDate: '2026-09-30',
      status: 'draft',
    });
    expect((await ctx.call(tokens.employee, 'GET', `${RUN}/lines`)).status).toBe(403);
    expect((await ctx.call(tokens.employee, 'GET', `${RUN}/exceptions`)).status).toBe(403);
  });

  test('imports are previewed, validated and committed', async () => {
    const duplicate = await ctx.call(
      tokens.payroll,
      'POST',
      `${RUN}/import/preview`,
      csv('EMP00001,100,0,0,30,\nEMP00001,100,0,0,30,'),
    );
    expect(duplicate.body.errors[0].message).toBe('Duplicate employee ID');
    const unknown = await ctx.call(tokens.payroll, 'POST', `${RUN}/import/preview`, csv('EMP99999,100,0,0,30,'));
    expect(unknown.body.errors[0].message).toBe('Unknown employee: EMP99999');
    const contractor = await ctx.call(tokens.payroll, 'POST', `${RUN}/import/preview`, csv('EMP00017,100,0,0,30,'));
    expect(contractor.body.errors[0].message).toBe('Contractor EMP00017 accepts attendance only');
    const badColumns = await ctx.call(tokens.payroll, 'POST', `${RUN}/import/preview`, {
      csv: 'employee_id\nEMP00001',
    });
    expect(badColumns.body.errors[0].message).toMatch(/^Required columns/);
    expect((await ctx.call(tokens.auditor, 'POST', `${RUN}/import/preview`, csv('EMP00001,0,0,0,30,'))).status).toBe(
      403,
    );

    const committed = await ctx.call(
      tokens.payroll,
      'POST',
      `${RUN}/import/commit`,
      csv('EMP00001,2500,0,1,30,Bonus\nEMP00017,0,0,2,30,'),
    );
    expect(committed.body).toEqual({ ok: true, imported: 2 });
    expect((await ctx.call(tokens.hr, 'GET', '/api/employees/EMP00017')).body.unpaidDays).toBe(2);
  });

  test('calculation flags missing bank details as blocking', async () => {
    const run = await ctx.call(tokens.payroll, 'POST', `${RUN}/calculate`);
    expect(run.body.status).toBe('calculated');
    expect(run.body.calculatedEmployees).toBe(run.body.totalEmployees);
    expect(run.body.totalEmployees).toBeLessThan(SEED_SIZE); // contractors are outside payroll
    expect(run.body.blocking).toBe(12);
    expect(run.body.gross - run.body.deductions).toBe(run.body.net);

    const exceptions = await ctx.call(tokens.auditor, 'GET', `${RUN}/exceptions`);
    expect(exceptions.body[0]).toMatchObject({ code: 'BANK_MISSING', severity: 'blocking', employeeId: 'EMP00001' });
    expect((await ctx.call(tokens.payroll, 'POST', `${RUN}/import/commit`, csv('EMP00001,0,0,0,30,'))).status).toBe(
      409,
    );
    expect((await ctx.call(tokens.employee, 'PATCH', '/api/employees/EMP00001', { taxRegime: 'old' })).status).toBe(
      409,
    );
    expect((await ctx.call(tokens.payroll, 'POST', `${RUN}/submit`)).status).toBe(409);
  });

  test('lines carry the current statutory rules', async () => {
    const lines = await ctx.call(tokens.auditor, 'GET', `${RUN}/lines?size=10&search=Gurugram`);
    const haryana = lines.body.items[0];
    expect(haryana.state).toBe('Haryana');
    expect(haryana.professionalTax).toBe(0);
    expect(haryana.labourWelfareFund).toBeGreaterThan(0);
    expect(haryana.ruleNotes).toContain(
      'EPF wage ceiling split for September 2026: ₹15,000 for 1–16 Sep, ₹25,000 from 17 Sep',
    );
    const flagged = await ctx.call(tokens.auditor, 'GET', `${RUN}/lines?exception=true&size=100`);
    expect(flagged.body.total).toBeGreaterThanOrEqual(12);
  });

  test('fixing bank details and recalculating clears the gate', async () => {
    for (let n = 1; n <= 12; n++) {
      expect(
        (
          await ctx.call(tokens.hr, 'PATCH', `/api/employees/${employeeId(n)}`, {
            bankReady: true,
            bankAccountLast4: '1234',
          })
        ).status,
      ).toBe(200);
    }
    const run = await ctx.call(tokens.payroll, 'POST', `${RUN}/calculate`);
    expect(run.body.blocking).toBe(0);
  });

  test('maker-checker: the preparer submits and only Finance approves', async () => {
    expect((await ctx.call(tokens.finance, 'POST', `${RUN}/submit`)).status).toBe(403);
    const submitted = await ctx.call(tokens.payroll, 'POST', `${RUN}/submit`);
    expect(submitted.body).toMatchObject({ status: 'approval_pending', preparedBy: 'USR-payroll' });
    expect((await ctx.call(tokens.payroll, 'POST', `${RUN}/approve`, {})).status).toBe(403);
    await expect(approveRun(ctx.database.db, DEMO_RUN_ID, 'USR-payroll')).rejects.toThrow(
      'Preparer cannot approve the same run',
    );
    expect((await ctx.call(tokens.hr, 'PATCH', '/api/employees/EMP00001', { bankReady: false })).status).toBe(409);
    expect((await ctx.call(tokens.employee, 'GET', `${RUN}/payslip/EMP00001`)).status).toBe(403);
    expect((await ctx.call(tokens.finance, 'GET', `${RUN}/export/bank-demo`)).status).toBe(409);

    const approved = await ctx.call(tokens.finance, 'POST', `${RUN}/approve`, { note: 'Checked totals' });
    expect(approved.body).toMatchObject({ status: 'approved', approvedBy: 'USR-finance' });
    expect((await ctx.call(tokens.payroll, 'POST', `${RUN}/calculate`)).status).toBe(409);
  });

  test('after approval: payslips, exports and reconciliation', async () => {
    const payslip = await ctx.call(tokens.employee, 'GET', `${RUN}/payslip/EMP00001`);
    expect(payslip.body.period).toBe('2026-09');
    expect(payslip.body.line.variablePay).toBe(250000);
    expect((await ctx.call(tokens.employee, 'GET', `${RUN}/payslip/EMP00002`)).status).toBe(403);

    const bank = await ctx.call(tokens.finance, 'GET', `${RUN}/export/bank-demo`);
    expect(bank.text.startsWith('"DEMO ONLY - NOT A BANK UPLOAD FILE"')).toBe(true);
    const ecr = await ctx.call(tokens.auditor, 'GET', `${RUN}/export/epf-prep`);
    expect(ecr.text.split('\r\n')[0]).toContain('"EPS wages INR"');
    expect((await ctx.call(tokens.auditor, 'GET', `${RUN}/export/unknown`)).status).toBe(400);

    expect((await ctx.call(tokens.payroll, 'POST', `${RUN}/reconcile-demo`)).status).toBe(403);
    expect((await ctx.call(tokens.finance, 'POST', `${RUN}/reconcile-demo`)).body.status).toBe('reconciled');

    const audit = await ctx.call(tokens.auditor, 'GET', `${RUN}/audit`);
    const actions = audit.body.map((event: { action: string }) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'payroll.calculated',
        'payroll.submitted',
        'payroll.approved',
        'report.exported',
        'payments.reconciled.demo',
        'inputs.imported',
      ]),
    );
  });

  test('demo reset returns the run to draft and removes added people', async () => {
    await ctx.call(tokens.admin, 'POST', '/api/demo/reset');
    const run = await ctx.call(tokens.hr, 'GET', RUN);
    expect(run.body).toMatchObject({ status: 'draft', calculatedEmployees: 0 });
    expect((await ctx.call(tokens.hr, 'GET', '/api/employees/EMP00001')).body).toMatchObject({
      bankReady: false,
      unpaidDays: 0,
    });
  });
});

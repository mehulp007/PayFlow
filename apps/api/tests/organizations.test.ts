import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, TEST_PASSWORD, type TestContext } from './helpers.js';

let ctx: TestContext;
let asterAdmin: string;
let asterRunId: string;
let sample: { token: string; organization: any };
beforeAll(async () => {
  ctx = await createTestContext();
  asterAdmin = await ctx.login('admin');
  asterRunId = await ctx.currentRunId(asterAdmin);
  sample = await ctx.signup('Neem Foods', 'sample');
});
afterAll(async () => {
  await ctx.close();
});

describe('sign-up', () => {
  test('validates the organization, admin and branches', async () => {
    const base = {
      organizationName: 'Valid Org',
      adminName: 'Admin',
      email: 'valid@example.com',
      password: TEST_PASSWORD,
      branches: [{ name: 'Pune', state: 'Maharashtra' }],
      start: 'empty',
    };
    const signup = (body: object) => ctx.call(null, 'POST', '/api/organizations', { ...base, ...body });
    expect((await signup({ branches: [{ name: 'Panaji', state: 'Goa' }] })).body.error).toMatch(/reviewed rule pack/);
    expect((await signup({ branches: [] })).status).toBe(400);
    expect((await signup({ password: 'short' })).status).toBe(400);
    expect((await signup({ email: 'neem.foods@example.com' })).status).toBe(409);
  });

  test('a sample company comes with six approved months and an open October run', async () => {
    expect(sample.organization).toMatchObject({ name: 'Neem Foods', isSample: true });
    expect(sample.organization.payGroups.map((group: { name: string }) => group.name)).toEqual(['Plant', 'Staff']);
    const runs = (await ctx.call(sample.token, 'GET', '/api/runs')).body;
    expect(runs.map((run: { month: number; status: string }) => `${run.month}:${run.status}`)).toEqual([
      '10:draft',
      '9:closed',
      '8:closed',
      '7:closed',
      '6:closed',
      '5:closed',
      '4:closed',
    ]);
    const people = await ctx.call(sample.token, 'GET', '/api/employees?size=1');
    expect(people.body.total).toBe(240);
  });

  test('year-to-date tax comes from the approved months', async () => {
    const runs = (await ctx.call(sample.token, 'GET', '/api/runs')).body;
    const [october, september] = runs;
    await ctx.call(sample.token, 'POST', `/api/runs/${october.id}/calculate`);
    const septemberLine = (await ctx.call(sample.token, 'GET', `/api/runs/${september.id}/payslip/EMP00008`)).body.line;
    const octoberLine = (await ctx.call(sample.token, 'GET', `/api/runs/${october.id}/payslip/EMP00008`)).body.line;
    // With history recorded, the monthly deduction stays level instead of recovering the whole year at once.
    expect(Math.abs(octoberLine.incomeTax - septemberLine.incomeTax)).toBeLessThan(septemberLine.incomeTax * 0.05);
    expect(octoberLine.ruleNotes.join(' ')).not.toContain('September 2026'); // the EPF split was a September event
    expect(septemberLine.ruleNotes.join(' ')).toContain('EPF wage ceiling split for September 2026');
  });

  test('an empty organization starts with no people or runs and builds its own', async () => {
    const empty = await ctx.signup('Blank Slate', 'empty');
    const bootstrap = (await ctx.call(empty.token, 'GET', '/api/bootstrap')).body;
    expect(bootstrap).toMatchObject({ currentRun: null, viewAsRoles: [] });
    const payGroup = await ctx.call(empty.token, 'POST', '/api/organization/pay-groups', { name: 'Interns' });
    expect(payGroup.status).toBe(200);
    expect((await ctx.call(empty.token, 'POST', '/api/organization/pay-groups', { name: 'Interns' })).status).toBe(409);
    const branch = await ctx.call(empty.token, 'POST', '/api/organization/branches', {
      name: 'Kolkata',
      state: 'West Bengal',
    });
    const created = await ctx.call(empty.token, 'POST', '/api/employees', {
      name: 'First Person',
      employmentType: 'permanent',
      positionLevel: 8,
      jobTitle: 'Managing Director',
      department: 'Leadership',
      branchId: branch.body.id,
      payGroupId: payGroup.body.id,
      managerId: null,
      joinDate: '2026-10-01',
      dateOfBirth: '1980-01-01',
      monthlyBasic: 10000000,
      monthlyHra: 4000000,
      monthlySpecial: 2000000,
      pfMember: true,
    });
    expect(created.body.id).toBe('EMP00001');
    const run = await ctx.call(empty.token, 'POST', '/api/runs', { year: 2026, month: 10, paymentDate: '2026-10-31' });
    const calculated = await ctx.call(empty.token, 'POST', `/api/runs/${run.body.id}/calculate`);
    expect(calculated.body).toMatchObject({ calculatedEmployees: 1, blocking: 1 }); // no bank details yet
    expect(
      (await ctx.call(empty.token, 'POST', '/api/organization/view-as', { role: 'finance-approver' })).status,
    ).toBe(403);
  });
});

describe('tenant isolation', () => {
  test('another organization’s records are not found, not merely forbidden', async () => {
    expect((await ctx.call(sample.token, 'GET', `/api/runs/${asterRunId}`)).status).toBe(404);
    expect((await ctx.call(sample.token, 'POST', `/api/runs/${asterRunId}/calculate`)).status).toBe(404);
    expect((await ctx.call(sample.token, 'GET', `/api/runs/${asterRunId}/export/salary-register`)).status).toBe(404);
    expect((await ctx.call(sample.token, 'GET', `/api/runs/${asterRunId}/audit`)).status).toBe(404);
    const asterUsers = (await ctx.call(asterAdmin, 'GET', '/api/auth/users')).body as Array<{
      id: string;
      username: string;
    }>;
    const asterHr = asterUsers.find(user => user.username === 'hr')!;
    expect((await ctx.call(sample.token, 'POST', `/api/auth/users/${asterHr.id}/reset-password`)).status).toBe(404);
    expect(
      (await ctx.call(sample.token, 'GET', '/api/auth/users')).body.some(
        (user: { username: string }) => user.username === 'hr',
      ),
    ).toBe(false);
  });

  test('employee codes resolve inside the signed-in organization', async () => {
    const asterOne = (await ctx.call(asterAdmin, 'GET', '/api/employees/EMP00001')).body;
    const sampleOne = (await ctx.call(sample.token, 'GET', '/api/employees/EMP00001')).body;
    expect(asterOne.branch).not.toBe(sampleOne.branch); // Aster's branches are not Neem Foods' branches
    expect((await ctx.call(sample.token, 'GET', '/api/employees?size=1')).body.total).toBe(240);
    expect((await ctx.call(sample.token, 'GET', `/api/employees/EMP00200`)).status).toBe(200);
    expect((await ctx.call(asterAdmin, 'GET', `/api/employees/EMP00200`)).status).toBe(404); // Aster has 120 people
  });

  test('invitation links join the inviting organization only', async () => {
    const invite = await ctx.call(sample.token, 'POST', '/api/invitations', {
      email: 'auditor@neem.example',
      role: 'auditor',
    });
    const accepted = await ctx.call(null, 'POST', '/api/invitations/accept', {
      token: invite.body.token,
      displayName: 'Neem Auditor',
      password: TEST_PASSWORD,
    });
    const bootstrap = (await ctx.call(accepted.body.token, 'GET', '/api/bootstrap')).body;
    expect(bootstrap.organization.name).toBe('Neem Foods');
    expect(bootstrap.viewAsRoles).toEqual([]); // invited people cannot switch roles
  });
});

describe('sample companies', () => {
  test('the owner can view the sample as another role, with an audit record', async () => {
    const roles = (await ctx.call(sample.token, 'GET', '/api/bootstrap')).body.viewAsRoles;
    expect(roles).toEqual(['admin', 'hr-operator', 'payroll-operator', 'finance-approver', 'auditor', 'employee']);
    const finance = await ctx.call(sample.token, 'POST', '/api/organization/view-as', { role: 'finance-approver' });
    expect(finance.body.user.role).toBe('finance-approver');
    const back = await ctx.call(finance.body.token, 'POST', '/api/organization/view-as', { role: 'admin' });
    expect(back.body.user.username).toBe('neem.foods@example.com');
    const employee = await ctx.call(back.body.token, 'POST', '/api/organization/view-as', { role: 'employee' });
    expect(employee.body.user.employeeId).toBe('EMP00001');
    expect((await ctx.call(employee.body.token, 'GET', '/api/me/payslips')).body).toHaveLength(6);
  });

  test('a reset regenerates the sample and removes invited accounts', async () => {
    const reset = await ctx.call(sample.token, 'POST', '/api/organization/reset-sample');
    expect(reset.body.currentRun).toMatchObject({ month: 10, status: 'draft', calculatedEmployees: 0 });
    const users = (await ctx.call(sample.token, 'GET', '/api/auth/users')).body as Array<{ username: string }>;
    expect(users.some(user => user.username === 'auditor@neem.example')).toBe(false);
    expect((await ctx.call(sample.token, 'GET', '/api/runs')).body).toHaveLength(7);
  });

  test('compliance rules list the organization’s states', async () => {
    const rules = (await ctx.call(sample.token, 'GET', '/api/compliance/rules')).body;
    expect(rules.reviewedTaxYear).toBe('2026–27');
    expect(rules.states.map((state: { state: string }) => state.state)).toEqual(['Karnataka', 'Maharashtra']);
    expect(rules.states[1].professionalTax.join(' ')).toContain('Women: nil to ₹25,000');
  });
});

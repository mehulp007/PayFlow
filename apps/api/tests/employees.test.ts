import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, SEED_SIZE, type TestContext } from './helpers.js';

let ctx: TestContext;
let hr: string;
beforeAll(async () => {
  ctx = await createTestContext();
  hr = await ctx.login('hr');
});
afterAll(async () => {
  await ctx.close();
});

const newHire = {
  name: 'Riya Sharma',
  employmentType: 'permanent',
  positionLevel: 2,
  jobTitle: 'Senior Associate',
  department: 'Finance',
  branch: 'Mumbai',
  state: 'Maharashtra',
  managerId: 'EMP00040',
  joinDate: '2026-09-01',
  dateOfBirth: '1994-05-15',
  gender: 'female',
  workEmail: 'riya@example.invalid',
  phone: '9876543211',
  payGroup: 'General',
  monthlyBasic: 3000000,
  monthlyHra: 1200000,
  monthlySpecial: 800000,
  leaveBalanceDays: 12,
  pfMember: true,
  esiMember: false,
};

describe('directory', () => {
  test('lists people with realistic names, paging and filters', async () => {
    const page = await ctx.call(hr, 'GET', '/api/employees?size=5');
    expect(page.body.total).toBe(SEED_SIZE);
    expect(page.body.items).toHaveLength(5);
    expect(page.body.items[0]).toMatchObject({ id: 'EMP00008', positionLevel: 8, jobTitle: 'Managing Director' });
    expect(page.body.items[1].name).not.toMatch(/^Employee /);

    const contractors = await ctx.call(hr, 'GET', '/api/employees?employmentType=contractor&size=100');
    expect(contractors.body.items.every((person: { payrollScope: boolean }) => !person.payrollScope)).toBe(true);
    const karnataka = await ctx.call(hr, 'GET', '/api/employees?state=Karnataka&size=100');
    expect(karnataka.body.items.every((person: { state: string }) => person.state === 'Karnataka')).toBe(true);
    expect((await ctx.call(hr, 'GET', '/api/employees?size=500')).status).toBe(400);
  });

  test('employees see only their own record and can change only their tax regime', async () => {
    const employee = await ctx.login('employee');
    expect((await ctx.call(employee, 'GET', '/api/employees')).status).toBe(403);
    expect((await ctx.call(employee, 'GET', '/api/employees/EMP00002')).status).toBe(403);
    expect((await ctx.call(employee, 'PATCH', '/api/employees/EMP00001', { bankReady: true })).status).toBe(403);
    expect((await ctx.call(employee, 'PATCH', '/api/employees/EMP00001', { taxRegime: 'old' })).status).toBe(200);
    expect((await ctx.call(employee, 'GET', '/api/employees/EMP00001')).body.taxRegime).toBe('old');
    expect((await ctx.call(employee, 'PATCH', '/api/employees/EMP00001', { taxRegime: 'new' })).status).toBe(200);
  });

  test('auditors read but cannot edit', async () => {
    const auditor = await ctx.login('auditor');
    expect((await ctx.call(auditor, 'GET', '/api/employees/EMP00002')).status).toBe(200);
    expect((await ctx.call(auditor, 'PATCH', '/api/employees/EMP00002', { taxRegime: 'old' })).status).toBe(403);
  });

  test('unknown fields in updates are rejected', async () => {
    expect((await ctx.call(hr, 'PATCH', '/api/employees/EMP00002', { monthlyBasic: 1 })).status).toBe(400);
    expect((await ctx.call(hr, 'PATCH', '/api/employees/EMP00002', { bankAccountLast4: '12' })).status).toBe(400);
  });
});

describe('hierarchy', () => {
  test('summarises people by employment type and level', async () => {
    const summary = await ctx.call(hr, 'GET', '/api/hierarchy/summary');
    expect(summary.body.total).toBe(SEED_SIZE);
    expect(summary.body.positionLevels.at(-1).label).toBe('Managing Director');
    expect(summary.body.counts.some((row: { employmentType: string }) => row.employmentType === 'contractor')).toBe(
      true,
    );
  });

  test('offers only higher-level managers', async () => {
    const managers = await ctx.call(hr, 'GET', '/api/hierarchy/managers?level=3');
    expect(managers.body.length).toBeGreaterThan(0);
    expect(managers.body.every((item: { positionLevel: number }) => item.positionLevel > 3)).toBe(true);
    expect((await ctx.call(await ctx.login('payroll'), 'GET', '/api/hierarchy/managers')).status).toBe(403);
  });

  test('adds people with hierarchy and pay checks', async () => {
    expect(
      (await ctx.call(hr, 'POST', '/api/employees', { ...newHire, managerId: 'EMP00048', positionLevel: 3 })).body
        .error,
    ).toBe('Reporting manager must have a higher position level');
    expect((await ctx.call(hr, 'POST', '/api/employees', { ...newHire, monthlyBasic: 0 })).status).toBe(400);
    expect((await ctx.call(hr, 'POST', '/api/employees', { ...newHire, dateOfBirth: '2027-01-01' })).status).toBe(400);
    expect((await ctx.call(hr, 'POST', '/api/employees', { ...newHire, managerId: null })).status).toBe(400);

    const created = await ctx.call(hr, 'POST', '/api/employees', newHire);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      id: `EMP00${SEED_SIZE + 1}`,
      payrollScope: true,
      gender: 'female',
      workingDays: 30,
    });
    expect(created.body.managerName).toBeTruthy();

    const contractor = await ctx.call(hr, 'POST', '/api/employees', {
      ...newHire,
      name: 'Kavya Rao',
      employmentType: 'contractor',
      positionLevel: 1,
      managerId: 'EMP00048',
      monthlyBasic: 0,
      monthlyHra: 0,
      monthlySpecial: 0,
      pfMember: true,
    });
    expect(contractor.body).toMatchObject({ payrollScope: false, pfMember: false, monthlyBasic: 0 });
  });
});

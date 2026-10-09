import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, SEED_SIZE, type TestContext } from './helpers.js';

let ctx: TestContext;
let hr: string;
let summary: any;
beforeAll(async () => {
  ctx = await createTestContext();
  hr = await ctx.login('hr');
  summary = (await ctx.call(hr, 'GET', '/api/hierarchy/summary')).body;
});
afterAll(async () => {
  await ctx.close();
});

const newHire = () => ({
  name: 'Riya Sharma',
  employmentType: 'permanent',
  positionLevel: 2,
  jobTitle: 'Senior Associate',
  department: 'Finance',
  branchId: summary.branches.find((branch: { name: string }) => branch.name === 'Mumbai').id,
  payGroupId: summary.payGroups[0].id,
  managerId: 'EMP00040',
  joinDate: '2026-10-12',
  dateOfBirth: '1994-05-15',
  gender: 'female',
  workEmail: 'riya@example.invalid',
  phone: '9876543211',
  monthlyBasic: 3000000,
  monthlyHra: 1200000,
  monthlySpecial: 800000,
  leaveBalanceDays: 12,
  pfMember: true,
  esiMember: false,
});

describe('directory', () => {
  test('lists people with realistic names, paging and filters', async () => {
    const page = await ctx.call(hr, 'GET', '/api/employees?size=5');
    expect(page.body.total).toBe(SEED_SIZE);
    expect(page.body.items[0]).toMatchObject({ id: 'EMP00008', positionLevel: 8, jobTitle: 'Managing Director' });
    expect(page.body.items[1].name).not.toMatch(/^Employee /);
    const contractors = await ctx.call(hr, 'GET', '/api/employees?employmentType=contractor&size=100');
    expect(contractors.body.items.every((person: { payrollScope: boolean }) => !person.payrollScope)).toBe(true);
    const karnataka = await ctx.call(hr, 'GET', '/api/employees?state=Karnataka&size=100');
    expect(karnataka.body.items.every((person: { state: string }) => person.state === 'Karnataka')).toBe(true);
    expect((await ctx.call(hr, 'GET', '/api/employees?size=500')).status).toBe(400);
  });

  test('new joiners are pro-rated: unpaid days before joining in the current run', async () => {
    const joiner = await ctx.call(hr, 'GET', `/api/employees/EMP00${SEED_SIZE}`);
    expect(joiner.body).toMatchObject({ joinDate: '2026-10-01', workingDays: 31, unpaidDays: 0, bankReady: false });
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

  test('HR edits work details; unknown fields are rejected', async () => {
    const auditor = await ctx.login('auditor');
    expect((await ctx.call(auditor, 'PATCH', '/api/employees/EMP00002', { jobTitle: 'Lead' })).status).toBe(403);
    expect((await ctx.call(hr, 'PATCH', '/api/employees/EMP00002', { monthlyBasic: 1 })).status).toBe(400);
    const moved = await ctx.call(hr, 'PATCH', '/api/employees/EMP00002', {
      jobTitle: 'Senior Associate',
      department: 'People',
      phone: '9123456780',
    });
    expect(moved.status).toBe(200);
    expect((await ctx.call(hr, 'GET', '/api/employees/EMP00002')).body).toMatchObject({
      department: 'People',
      phone: '9123456780',
    });
    expect((await ctx.call(hr, 'PATCH', '/api/employees/EMP00002', { managerId: 'EMP00003' })).status).toBe(400);
  });
});

describe('lifecycle', () => {
  test('adds people with hierarchy and pay checks, in the organization’s branches only', async () => {
    const hire = newHire();
    expect(
      (await ctx.call(hr, 'POST', '/api/employees', { ...hire, managerId: 'EMP00048', positionLevel: 3 })).body.error,
    ).toBe('Reporting manager must have a higher position level');
    expect((await ctx.call(hr, 'POST', '/api/employees', { ...hire, monthlyBasic: 0 })).status).toBe(400);
    expect((await ctx.call(hr, 'POST', '/api/employees', { ...hire, dateOfBirth: '2027-01-01' })).status).toBe(400);
    expect(
      (await ctx.call(hr, 'POST', '/api/employees', { ...hire, branchId: '00000000-0000-4000-8000-000000000000' }))
        .status,
    ).toBe(400);
    const created = await ctx.call(hr, 'POST', '/api/employees', hire);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ id: `EMP00${SEED_SIZE + 1}`, payrollScope: true, gender: 'female' });
    // Joined on the 12th of a 31-day month: eleven unpaid days in the open run.
    expect(created.body).toMatchObject({ workingDays: 31, unpaidDays: 11 });
  });

  test('salary revisions are effective-dated from the first of a month', async () => {
    const code = `EMP00${SEED_SIZE + 1}`;
    const revise = (body: object) => ctx.call(hr, 'POST', `/api/employees/${code}/salary-revisions`, body);
    expect(
      (await revise({ effectiveFrom: '2026-11-15', monthlyBasic: 3300000, monthlyHra: 0, monthlySpecial: 0 })).status,
    ).toBe(400);
    expect(
      (await revise({ effectiveFrom: '2026-09-01', monthlyBasic: 3300000, monthlyHra: 0, monthlySpecial: 0 })).status,
    ).toBe(400);
    const revised = await revise({
      effectiveFrom: '2026-11-01',
      monthlyBasic: 3300000,
      monthlyHra: 1320000,
      monthlySpecial: 880000,
      reason: 'Confirmation increase',
    });
    expect(revised.body.map((item: { effectiveFrom: string }) => item.effectiveFrom)).toEqual([
      '2026-11-01',
      '2026-10-01',
    ]);
    expect((await ctx.call(hr, 'GET', `/api/employees/${code}`)).body.monthlyBasic).toBe(3300000);
  });

  test('exits need reassigned reports and pro-rate the exit month', async () => {
    expect((await ctx.call(hr, 'POST', '/api/employees/EMP00048/exit', { exitDate: '2026-10-20' })).status).toBe(409);
    const left = await ctx.call(hr, 'POST', '/api/employees/EMP00003/exit', {
      exitDate: '2026-10-20',
      reason: 'Resigned',
    });
    expect(left.body).toMatchObject({ employmentStatus: 'exited', exitDate: '2026-10-20', unpaidDays: 11 });
    expect((await ctx.call(hr, 'POST', '/api/employees/EMP00003/exit', { exitDate: '2026-10-21' })).status).toBe(409);
    const active = await ctx.call(hr, 'GET', '/api/employees?search=EMP00003');
    expect(active.body.total).toBe(0);
    const everyone = await ctx.call(hr, 'GET', '/api/employees?search=EMP00003&status=all');
    expect(everyone.body.total).toBe(1);
  });

  test('summarises the hierarchy and offers only higher-level managers', async () => {
    expect(summary.positionLevels.at(-1).label).toBe('Managing Director');
    expect(summary.states).toEqual(['Haryana', 'Karnataka', 'Maharashtra', 'Tamil Nadu', 'West Bengal']);
    const managers = await ctx.call(hr, 'GET', '/api/hierarchy/managers?level=3');
    expect(managers.body.every((item: { positionLevel: number }) => item.positionLevel > 3)).toBe(true);
    expect((await ctx.call(await ctx.login('payroll'), 'GET', '/api/hierarchy/managers')).status).toBe(403);
  });
});

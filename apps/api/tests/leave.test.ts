import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
const tokens: Record<string, string> = {};
let run: string;
beforeAll(async () => {
  ctx = await createTestContext();
  for (const username of ['admin', 'hr', 'payroll', 'auditor', 'employee']) {
    tokens[username] = await ctx.login(username);
  }
  run = `/api/runs/${await ctx.currentRunId(tokens.hr)}`;
});
afterAll(async () => {
  await ctx.close();
});

const request = (token: string, code: string, body: object) =>
  ctx.call(token, 'POST', `/api/employees/${code}/leave`, body);
const balance = (summary: { balances: Array<{ type: string }> }, type: string) =>
  summary.balances.find(item => item.type === type) as Record<string, number>;

describe('leave balances (OSH Code)', () => {
  test('earned leave accrues from last year’s work, plus carried-forward days', async () => {
    const summary = (await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00001/leave')).body;
    expect(summary).toMatchObject({ employeeId: 'EMP00001', year: 2026, earned: { qualifies: true } });
    // 313 working days in 2025 → 15 days; 5 carried forward; 2 days taken in May.
    expect(balance(summary, 'earned')).toMatchObject({ entitled: 15, carriedForward: 5, taken: 2, available: 18 });
    expect(balance(summary, 'sick')).toMatchObject({ entitled: 12, available: 12 });
    expect(balance(summary, 'unpaid')).toMatchObject({ entitled: null, available: null });
    expect((await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00002/leave')).status).toBe(403);
  });

  test('HR records carried-forward leave within the 30-day limit', async () => {
    const set = (days: number) => ctx.call(tokens.hr, 'PUT', '/api/employees/EMP00003/leave/carry-forward', { days });
    expect((await set(31)).status).toBe(400);
    expect(balance((await set(10)).body, 'earned').carriedForward).toBe(10);
    expect(
      (await ctx.call(tokens.payroll, 'PUT', '/api/employees/EMP00003/leave/carry-forward', { days: 1 })).status,
    ).toBe(403);
  });
});

describe('leave requests', () => {
  let requestId: string;

  test('employees request leave for themselves, within their balance and without overlaps', async () => {
    expect(
      (await request(tokens.employee, 'EMP00002', { type: 'earned', from: '2026-10-19', to: '2026-10-20' })).status,
    ).toBe(403);
    expect(
      (await request(tokens.employee, 'EMP00001', { type: 'earned', from: '2026-10-18', to: '2026-10-18' })).body.error,
    ).toMatch(/Sunday/);
    expect(
      (await request(tokens.employee, 'EMP00001', { type: 'sick', from: '2026-11-02', to: '2026-11-16' })).body.error,
    ).toMatch(/Only 12 days/);
    expect(
      (await request(tokens.employee, 'EMP00001', { type: 'earned', from: '2026-10-20', to: '2026-10-19' })).status,
    ).toBe(400);
    const created = await request(tokens.employee, 'EMP00001', {
      type: 'earned',
      from: '2026-11-02',
      to: '2026-11-07',
      reason: 'Diwali',
    });
    expect(created.body).toMatchObject({ status: 'pending', days: 6, employeeId: 'EMP00001' });
    requestId = created.body.id;
    expect(
      (await request(tokens.employee, 'EMP00001', { type: 'sick', from: '2026-11-05', to: '2026-11-05' })).status,
    ).toBe(409);
    const summary = (await ctx.call(tokens.employee, 'GET', '/api/employees/EMP00001/leave')).body;
    expect(balance(summary, 'earned')).toMatchObject({ pending: 6, available: 12 });
  });

  test('HR is notified and decides; nobody decides their own leave', async () => {
    const hrFeed = (await ctx.call(tokens.hr, 'GET', '/api/notifications')).body;
    expect(hrFeed.items[0]).toMatchObject({ kind: 'leave.requested', link: '/leave', read: false });
    const pending = (await ctx.call(tokens.hr, 'GET', '/api/leave?status=pending&size=100')).body;
    expect(pending.items.map((item: { id: string }) => item.id)).toContain(requestId);
    expect((await ctx.call(tokens.employee, 'GET', '/api/leave')).status).toBe(403);
    expect(
      (await ctx.call(tokens.employee, 'POST', `/api/leave/${requestId}/decision`, { decision: 'approved' })).status,
    ).toBe(403);
    const approved = await ctx.call(tokens.hr, 'POST', `/api/leave/${requestId}/decision`, {
      decision: 'approved',
      note: 'Enjoy the break',
    });
    expect(approved.body).toMatchObject({ status: 'approved', decidedBy: 'hr', decisionNote: 'Enjoy the break' });
    expect(
      (await ctx.call(tokens.hr, 'POST', `/api/leave/${requestId}/decision`, { decision: 'rejected' })).status,
    ).toBe(409);
    const feed = (await ctx.call(tokens.employee, 'GET', '/api/notifications')).body;
    expect(feed.items[0]).toMatchObject({ kind: 'leave.approved', body: 'Enjoy the break' });
    expect((await ctx.call(tokens.employee, 'POST', '/api/notifications/read', {})).body.unread).toBe(0);
  });

  test('managers decide leave for their direct reports', async () => {
    // EMP00048 supervises the level 1 and 2 associates, including EMP00049.
    const invitation = await ctx.call(tokens.admin, 'POST', '/api/invitations', {
      email: 'supervisor@example.com',
      role: 'employee',
      employeeId: 'EMP00048',
    });
    const manager = (
      await ctx.call(null, 'POST', '/api/invitations/accept', {
        token: invitation.body.token,
        displayName: 'Supervisor',
        password: 'Supervisor-Password-2026',
      })
    ).body.token;
    const created = await request(tokens.hr, 'EMP00049', { type: 'sick', from: '2026-10-22', to: '2026-10-22' });
    expect(created.status).toBe(200);
    const team = (await ctx.call(manager, 'GET', '/api/leave?scope=team&status=pending')).body;
    expect(team.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
    expect((await ctx.call(manager, 'GET', '/api/leave?scope=all')).status).toBe(403);
    expect(
      (await ctx.call(tokens.employee, 'POST', `/api/leave/${created.body.id}/decision`, { decision: 'approved' }))
        .status,
    ).toBe(403);
    const decided = await ctx.call(manager, 'POST', `/api/leave/${created.body.id}/decision`, {
      decision: 'rejected',
      note: 'Stock count that day',
    });
    expect(decided.body).toMatchObject({ status: 'rejected', decidedBy: 'supervisor@example.com' });
  });

  test('approved leave without pay is deducted in the month’s run', async () => {
    const unpaid = await request(tokens.employee, 'EMP00001', { type: 'unpaid', from: '2026-10-26', to: '2026-10-27' });
    await ctx.call(tokens.hr, 'POST', `/api/leave/${unpaid.body.id}/decision`, { decision: 'approved' });
    expect((await ctx.call(tokens.hr, 'GET', '/api/employees/EMP00001')).body.unpaidDays).toBe(2);
    await ctx.call(tokens.payroll, 'POST', `${run}/calculate`);
    const line = (await ctx.call(tokens.hr, 'GET', `${run}/payslip/EMP00001`)).body.line;
    expect(line).toMatchObject({ ncpDays: 2, paidDays: 29, workingDays: 31 });
    expect(line.ruleNotes).toContain('Includes 2 days of approved leave without pay');

    // A later decision on unpaid leave sends the calculated run back to draft for recalculation.
    const pending = (await ctx.call(tokens.hr, 'GET', '/api/leave?status=pending&size=100')).body.items.find(
      (item: { type: string; from: string }) => item.type === 'unpaid' && item.from.startsWith('2026-10'),
    );
    await ctx.call(tokens.hr, 'POST', `/api/leave/${pending.id}/decision`, { decision: 'approved' });
    expect((await ctx.call(tokens.hr, 'GET', run)).body.status).toBe('draft');
  });

  test('employees cancel their own requests', async () => {
    const created = await request(tokens.employee, 'EMP00001', { type: 'sick', from: '2026-12-01', to: '2026-12-01' });
    expect((await ctx.call(tokens.auditor, 'POST', `/api/leave/${created.body.id}/cancel`)).status).toBe(403);
    expect((await ctx.call(tokens.employee, 'POST', `/api/leave/${created.body.id}/cancel`)).status).toBe(200);
    expect((await ctx.call(tokens.employee, 'POST', `/api/leave/${created.body.id}/cancel`)).status).toBe(409);
  });

  test('approved months cannot take new leave', async () => {
    const sample = await ctx.signup('Leave Check Foods', 'sample');
    const response = await request(sample.token, 'EMP00002', { type: 'earned', from: '2026-09-07', to: '2026-09-08' });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/September 2026 payroll is already/);
  });
});

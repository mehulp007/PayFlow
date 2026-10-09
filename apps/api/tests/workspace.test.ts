import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
const tokens: Record<string, string> = {};
beforeAll(async () => {
  ctx = await createTestContext();
  for (const username of ['hr', 'auditor', 'employee']) tokens[username] = await ctx.login(username);
});
afterAll(async () => {
  await ctx.close();
});

describe('audit log and search', () => {
  test('the audit log filters by action and actor', async () => {
    const log = await ctx.call(tokens.auditor, 'GET', '/api/audit?action=auth&size=5');
    expect(log.body.items.length).toBeGreaterThan(0);
    expect(log.body.items.every((event: { action: string }) => event.action.startsWith('auth'))).toBe(true);
    expect(log.body.actors).toEqual(expect.arrayContaining(['hr', 'auditor']));
    const mine = (await ctx.call(tokens.auditor, 'GET', '/api/audit?actor=hr')).body;
    expect(mine.items.every((event: { actor: string }) => event.actor === 'hr')).toBe(true);
    expect((await ctx.call(tokens.auditor, 'GET', '/api/audit?from=2026-13-01')).status).toBe(400);
    expect((await ctx.call(tokens.employee, 'GET', '/api/audit')).status).toBe(403);
  });

  test('search finds people by name or code and runs by month', async () => {
    const people = (await ctx.call(tokens.hr, 'GET', '/api/search?q=sneha')).body.people;
    expect(people[0]).toMatchObject({ id: 'EMP00002', name: 'Sneha Iyer' });
    expect((await ctx.call(tokens.hr, 'GET', '/api/search?q=EMP00003')).body.people[0].name).toBe('Rohan Mehta');
    const runs = (await ctx.call(tokens.hr, 'GET', '/api/search?q=oct 2026')).body.runs;
    expect(runs).toEqual([expect.objectContaining({ year: 2026, month: 10, payGroupName: 'All pay groups' })]);
    expect((await ctx.call(tokens.hr, 'GET', '/api/search?q=')).status).toBe(400);
    expect((await ctx.call(tokens.employee, 'GET', '/api/search?q=sneha')).status).toBe(403);
  });
});

describe('analytics', () => {
  test('a sample company shows its cost trend and the latest month’s breakdowns', async () => {
    const sample = await ctx.signup('Analytics Foods', 'sample');
    const runId = await ctx.currentRunId(sample.token);
    await ctx.call(sample.token, 'POST', `/api/runs/${runId}/calculate`);
    const data = (await ctx.call(sample.token, 'GET', '/api/analytics')).body;
    expect(data.trend.map((point: { month: number }) => point.month)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(data.latest).toMatchObject({ year: 2026, month: 10, status: 'calculated' });
    const october = data.trend.at(-1);
    expect(october.gross - october.deductions).toBe(october.net);
    expect(data.departments.reduce((sum: number, row: { headcount: number }) => sum + row.headcount, 0)).toBe(
      october.headcount,
    );
    expect(data.statutory.find((item: { label: string }) => item.label === 'Provident fund').amount).toBeGreaterThan(0);
    expect(data.levels.at(-1)).toMatchObject({ level: 8, label: 'Managing Director', count: 1 });
    // Approved unpaid leave in October lowers some people's pay against September.
    expect(data.changes.some((row: { previous: number; current: number }) => row.current < row.previous)).toBe(true);
    expect((await ctx.call(tokens.employee, 'GET', '/api/analytics')).status).toBe(403);
  });
});

describe('one sign-in, several organizations', () => {
  test('an existing account adds organizations and switches between them', async () => {
    const first = await ctx.signup('Kaveri Foods', 'empty', 'owner@kaveri.example');
    const second = await ctx.signup('Kaveri Retail', 'empty', 'owner@kaveri.example');
    const bootstrap = (await ctx.call(second.token, 'GET', '/api/bootstrap')).body;
    expect(bootstrap.organization.name).toBe('Kaveri Retail');
    expect(bootstrap.organizations.map((org: { name: string; role: string }) => `${org.name}:${org.role}`)).toEqual([
      'Kaveri Foods:admin',
      'Kaveri Retail:admin',
    ]);

    const switched = await ctx.call(second.token, 'POST', '/api/auth/switch-organization', {
      organizationId: first.organization.id,
    });
    expect((await ctx.call(switched.body.token, 'GET', '/api/bootstrap')).body.organization.name).toBe('Kaveri Foods');
    expect((await ctx.call(second.token, 'GET', '/api/bootstrap')).status).toBe(401); // the old session ended
    const aster = (await ctx.call(tokens.hr, 'GET', '/api/bootstrap')).body.organization.id;
    expect(
      (await ctx.call(switched.body.token, 'POST', '/api/auth/switch-organization', { organizationId: aster })).status,
    ).toBe(404);
    // Signing in again opens the organization used most recently.
    const again = await ctx.login('owner@kaveri.example');
    expect((await ctx.call(again, 'GET', '/api/bootstrap')).body.organization.name).toBe('Kaveri Foods');
  });

  test('invitations to an existing account need its password, and admins cannot reset shared accounts', async () => {
    const foods = await ctx.login('owner@kaveri.example');
    // Switching ends the session it starts from, so the second organization gets its own sign-in.
    const other = await ctx.login('owner@kaveri.example');
    const retail = (
      await ctx.call(other, 'POST', '/api/auth/switch-organization', {
        organizationId: (await ctx.call(other, 'GET', '/api/bootstrap')).body.organizations[1].id,
      })
    ).body.token;
    const accept = async (admin: string, password: string, displayName?: string) => {
      const invitation = await ctx.call(admin, 'POST', '/api/invitations', {
        email: 'auditor@kaveri.example',
        role: 'auditor',
      });
      const preview = await ctx.call(null, 'GET', `/api/invitations/preview?token=${invitation.body.token}`);
      const accepted = await ctx.call(null, 'POST', '/api/invitations/accept', {
        token: invitation.body.token,
        password,
        displayName,
      });
      return { preview: preview.body, accepted };
    };
    const firstJoin = await accept(foods, 'Auditor-Password-2026', 'Kaveri Auditor');
    expect(firstJoin.preview.existingAccount).toBe(false);
    expect(firstJoin.accepted.status).toBe(200);

    const wrong = await accept(retail, 'not-the-password');
    expect(wrong.preview.existingAccount).toBe(true);
    expect(wrong.accepted.status).toBe(403);
    const secondJoin = await accept(retail, 'Auditor-Password-2026');
    expect(secondJoin.accepted.body.user).toMatchObject({ role: 'auditor', displayName: 'Kaveri Auditor' });
    expect(
      (await ctx.call(retail, 'POST', '/api/invitations', { email: 'auditor@kaveri.example', role: 'hr-operator' }))
        .status,
    ).toBe(409);

    const users = (await ctx.call(foods, 'GET', '/api/auth/users')).body as Array<{ id: string; username: string }>;
    const shared = users.find(user => user.username === 'auditor@kaveri.example')!;
    expect((await ctx.call(foods, 'POST', `/api/auth/users/${shared.id}/reset-password`)).status).toBe(409);
    // Removing the account from one organization keeps the sign-in for the other.
    expect((await ctx.call(foods, 'DELETE', `/api/auth/users/${shared.id}`)).status).toBe(200);
    const stillThere = await ctx.login('auditor@kaveri.example', 'Auditor-Password-2026');
    expect((await ctx.call(stillThere, 'GET', '/api/bootstrap')).body.organization.name).toBe('Kaveri Retail');
  });
});

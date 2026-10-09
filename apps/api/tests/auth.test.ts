import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, TEST_PASSWORD, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('sessions', () => {
  test('protected routes need a session; health does not', async () => {
    expect((await ctx.call(null, 'GET', '/api/bootstrap')).status).toBe(401);
    expect((await ctx.call('not-a-token', 'GET', '/api/bootstrap')).status).toBe(401);
    expect((await ctx.call(null, 'GET', '/api/health')).body.ruleVersion).toMatch(/^IN-TY2026-27-v2/);
  });

  test('wrong passwords are rejected and repeated failures lock the account', async () => {
    const wrong = { username: 'auditor', password: 'wrong-password' };
    expect((await ctx.call(null, 'POST', '/api/auth/login', wrong)).status).toBe(401);
    for (let attempt = 0; attempt < 4; attempt++) await ctx.call(null, 'POST', '/api/auth/login', wrong);
    const locked = await ctx.call(null, 'POST', '/api/auth/login', { username: 'auditor', password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
  });

  test('a session identifies the user and ends at logout', async () => {
    const token = await ctx.login('employee');
    const me = await ctx.call(token, 'GET', '/api/auth/me');
    expect(me.body.user).toMatchObject({ username: 'employee', role: 'employee', employeeId: 'EMP00001' });
    expect(me.body.user.organizationId).toBeUndefined(); // internal keys stay on the server
    expect((await ctx.call(token, 'POST', '/api/auth/logout')).status).toBe(200);
    expect((await ctx.call(token, 'GET', '/api/auth/me')).status).toBe(401);
  });

  test('request bodies are validated with field-level issues', async () => {
    const response = await ctx.call(null, 'POST', '/api/auth/login', { username: 'admin' });
    expect(response.status).toBe(400);
    expect(response.body.issues[0].path).toBe('password');
  });
});

describe('invitations', () => {
  test('only admins manage accounts and invitations', async () => {
    const hr = await ctx.login('hr');
    expect((await ctx.call(hr, 'GET', '/api/auth/users')).status).toBe(403);
    expect((await ctx.call(hr, 'POST', '/api/invitations', { email: 'x@example.com', role: 'auditor' })).status).toBe(
      403,
    );
    expect((await ctx.call(hr, 'POST', '/api/organization/reset-sample')).status).toBe(403);
  });

  test('an invitee accepts with their own password and sees only their own record', async () => {
    const admin = await ctx.login('admin');
    const created = await ctx.call(admin, 'POST', '/api/invitations', {
      email: 'Sneha.Iyer@Example.com',
      role: 'employee',
      employeeId: 'emp00002',
    });
    expect(created.status).toBe(200);
    expect(created.body.invitation).toMatchObject({ email: 'sneha.iyer@example.com', employeeId: 'EMP00002' });
    const { token } = created.body;

    const preview = await ctx.call(null, 'GET', `/api/invitations/preview?token=${token}`);
    expect(preview.body).toEqual({
      organizationName: 'Aster Group',
      email: 'sneha.iyer@example.com',
      role: 'employee',
    });
    expect(
      (await ctx.call(null, 'POST', '/api/invitations/accept', { token, displayName: 'Sneha', password: 'short' }))
        .status,
    ).toBe(400);
    const accepted = await ctx.call(null, 'POST', '/api/invitations/accept', {
      token,
      displayName: 'Sneha Iyer',
      password: 'Sneha-Password-2026',
    });
    expect(accepted.body.user).toMatchObject({ role: 'employee', employeeId: 'EMP00002', displayName: 'Sneha Iyer' });
    expect((await ctx.call(null, 'GET', `/api/invitations/preview?token=${token}`)).status).toBe(404); // single use

    const session = await ctx.login('sneha.iyer@example.com', 'Sneha-Password-2026');
    expect((await ctx.call(session, 'GET', '/api/employees/EMP00002')).status).toBe(200);
    expect((await ctx.call(session, 'GET', '/api/employees/EMP00001')).status).toBe(403);
  });

  test('invitation rules: one account per employee and per email, employee links only for employees', async () => {
    const admin = await ctx.login('admin');
    const invite = (body: object) => ctx.call(admin, 'POST', '/api/invitations', body);
    expect((await invite({ email: 'other@example.com', role: 'employee', employeeId: 'EMP00002' })).status).toBe(409);
    expect((await invite({ email: 'sneha.iyer@example.com', role: 'auditor' })).status).toBe(409);
    expect((await invite({ email: 'no.link@example.com', role: 'employee' })).status).toBe(400);
    expect((await invite({ email: 'wrong@example.com', role: 'auditor', employeeId: 'EMP00003' })).status).toBe(400);

    const pending = await invite({ email: 'pending@example.com', role: 'auditor' });
    const listed = await ctx.call(admin, 'GET', '/api/invitations');
    expect(listed.body.some((item: { email: string }) => item.email === 'pending@example.com')).toBe(true);
    expect((await ctx.call(admin, 'DELETE', `/api/invitations/${pending.body.invitation.id}`)).status).toBe(200);
    expect((await ctx.call(null, 'GET', `/api/invitations/preview?token=${pending.body.token}`)).status).toBe(404);
  });

  test('admins reset passwords for others and can remove only invited accounts', async () => {
    const admin = await ctx.login('admin');
    const users = (await ctx.call(admin, 'GET', '/api/auth/users')).body as Array<{ id: string; username: string }>;
    const self = users.find(user => user.username === 'admin')!;
    const builtIn = users.find(user => user.username === 'hr')!;
    const invited = users.find(user => user.username === 'sneha.iyer@example.com')!;
    expect((await ctx.call(admin, 'POST', `/api/auth/users/${self.id}/reset-password`)).status).toBe(400);

    const session = await ctx.login('sneha.iyer@example.com', 'Sneha-Password-2026');
    const reset = await ctx.call(admin, 'POST', `/api/auth/users/${invited.id}/reset-password`);
    expect(reset.body.temporaryPassword).toHaveLength(28);
    expect((await ctx.call(session, 'GET', '/api/auth/me')).status).toBe(401);
    const temporary = await ctx.login('sneha.iyer@example.com', reset.body.temporaryPassword);
    expect((await ctx.call(temporary, 'GET', '/api/employees/EMP00002')).status).toBe(403); // must change first
    expect(
      (
        await ctx.call(temporary, 'POST', '/api/auth/change-password', {
          currentPassword: reset.body.temporaryPassword,
          newPassword: 'Rotated-Password-2026',
        })
      ).status,
    ).toBe(200);

    expect((await ctx.call(admin, 'DELETE', `/api/auth/users/${builtIn.id}`)).status).toBe(403);
    expect((await ctx.call(admin, 'DELETE', `/api/auth/users/${invited.id}`)).status).toBe(200);
  });
});

import type { FastifyInstance } from 'fastify';
import { changePasswordBody, createUserBody, loginBody } from '@payflow/shared';
import { recordAudit } from '../../lib/audit.js';
import { badRequest, validate } from '../../lib/errors.js';
import { allow, bearerToken, currentUser } from '../../plugins/auth.js';
import * as auth from './service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.post(
    '/api/auth/login',
    {
      config: { public: true, rateLimit: { max: app.loginRateLimit, timeWindow: '1 minute' } },
    },
    async request => {
      const body = validate(loginBody, request.body);
      const result = await auth.login(db, body.username, body.password, request.ip);
      await recordAudit(db, { actor: result.user.id, action: 'auth.login' });
      return result;
    },
  );

  app.get('/api/auth/me', { config: { allowTemporaryPassword: true } }, async request => ({
    user: currentUser(request),
  }));

  app.post('/api/auth/logout', { config: { allowTemporaryPassword: true } }, async request => {
    await auth.logout(db, bearerToken(request));
    await recordAudit(db, { actor: currentUser(request).id, action: 'auth.logout' });
    return { ok: true };
  });

  app.post('/api/auth/change-password', { config: { allowTemporaryPassword: true } }, async request => {
    const body = validate(changePasswordBody, request.body);
    const user = currentUser(request);
    await auth.changePassword(db, user.id, body.currentPassword, body.newPassword);
    await recordAudit(db, { actor: user.id, action: 'auth.password.changed' });
    return { ok: true };
  });

  app.get('/api/auth/users', { preHandler: allow('users.manage') }, async () => auth.listUsers(db));

  app.post('/api/auth/users', { preHandler: allow('users.manage') }, async request => {
    const created = await auth.createUser(db, validate(createUserBody, request.body));
    await recordAudit(db, {
      actor: currentUser(request).id,
      action: 'auth.user.created',
      details: { userId: created.id, role: created.role, employeeId: created.employeeId },
    });
    return created;
  });

  app.post('/api/auth/users/:id/reset-password', { preHandler: allow('users.manage') }, async request => {
    const { id } = request.params as { id: string };
    if (id === currentUser(request).id) throw badRequest('Use Change my password for your own account');
    const temporaryPassword = await auth.resetUserPassword(db, id);
    await recordAudit(db, { actor: currentUser(request).id, action: 'auth.password.reset', details: { userId: id } });
    return { temporaryPassword };
  });

  app.delete('/api/auth/users/:id', { preHandler: allow('users.manage') }, async request => {
    const { id } = request.params as { id: string };
    await auth.removeUser(db, id);
    await recordAudit(db, { actor: currentUser(request).id, action: 'auth.user.removed', details: { userId: id } });
    return { ok: true };
  });
}

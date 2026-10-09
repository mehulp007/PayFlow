import type { FastifyInstance } from 'fastify';
import { acceptInviteBody, changePasswordBody, inviteBody, loginBody, switchOrganizationBody } from '@payflow/shared';
import { audit, recordAudit } from '../../lib/audit.js';
import { badRequest, validate } from '../../lib/errors.js';
import { allow, bearerToken, currentUser, orgOf } from '../../plugins/auth.js';
import { getOrganization } from '../organizations/service.js';
import * as invitations from './invitations.js';
import * as auth from './service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const limited = { max: app.loginRateLimit, timeWindow: '1 minute' };

  app.post('/api/auth/login', { config: { public: true, rateLimit: limited } }, async request => {
    const body = validate(loginBody, request.body);
    const result = await auth.login(db, body.username, body.password, request.ip);
    const principal = await auth.findPrincipal(db, result.user.id);
    await recordAudit(db, {
      organizationId: principal.organizationId,
      actor: principal.username,
      action: 'auth.login',
    });
    return result;
  });

  app.get('/api/auth/me', { config: { allowTemporaryPassword: true } }, async request => ({
    user: auth.toUser(currentUser(request)),
  }));

  app.post('/api/auth/logout', { config: { allowTemporaryPassword: true } }, async request => {
    await auth.logout(db, bearerToken(request));
    await audit(db, request, 'auth.logout');
    return { ok: true };
  });

  app.post('/api/auth/change-password', { config: { allowTemporaryPassword: true } }, async request => {
    const body = validate(changePasswordBody, request.body);
    await auth.changePassword(db, currentUser(request), body.currentPassword, body.newPassword);
    await audit(db, request, 'auth.password.changed');
    return { ok: true };
  });

  /** People who belong to several organizations move their session between them. */
  app.post('/api/auth/switch-organization', async request => {
    const { organizationId } = validate(switchOrganizationBody, request.body);
    const result = await auth.switchOrganization(db, currentUser(request), bearerToken(request), organizationId);
    await recordAudit(db, { organizationId, actor: result.user.username, action: 'auth.organization.switched' });
    return result;
  });

  // Accounts in the signed-in organization

  app.get('/api/auth/users', { preHandler: allow('users.manage') }, async request =>
    auth.listUsers(db, orgOf(request)),
  );

  app.post('/api/auth/users/:id/reset-password', { preHandler: allow('users.manage') }, async request => {
    const { id } = request.params as { id: string };
    if (id === currentUser(request).id) throw badRequest('Use Change my password for your own account');
    const temporaryPassword = await auth.resetUserPassword(db, orgOf(request), id);
    await audit(db, request, 'auth.password.reset', { userId: id });
    return { temporaryPassword };
  });

  app.delete('/api/auth/users/:id', { preHandler: allow('users.manage') }, async request => {
    const { id } = request.params as { id: string };
    const organization = await getOrganization(db, orgOf(request));
    await auth.removeUser(db, orgOf(request), id, organization.row.ownerUserId);
    await audit(db, request, 'auth.user.removed', { userId: id });
    return { ok: true };
  });

  // Invitations: an admin shares a one-time link; the invitee chooses their own password.

  app.get('/api/invitations', { preHandler: allow('users.manage') }, async request =>
    invitations.listInvitations(db, orgOf(request)),
  );

  app.post('/api/invitations', { preHandler: allow('users.manage') }, async request => {
    const body = validate(inviteBody, request.body);
    const created = await invitations.createInvitation(db, orgOf(request), currentUser(request).id, body);
    await audit(db, request, 'invitation.created', { email: body.email, role: body.role });
    return created;
  });

  app.delete('/api/invitations/:id', { preHandler: allow('users.manage') }, async request => {
    const { id } = request.params as { id: string };
    await invitations.revokeInvitation(db, orgOf(request), id);
    await audit(db, request, 'invitation.revoked', { invitationId: id });
    return { ok: true };
  });

  app.get('/api/invitations/preview', { config: { public: true, rateLimit: limited } }, async request => {
    const { token } = request.query as { token?: string };
    return invitations.previewInvitation(db, String(token ?? ''));
  });

  app.post('/api/invitations/accept', { config: { public: true, rateLimit: limited } }, async request => {
    const body = validate(acceptInviteBody, request.body);
    const result = await invitations.acceptInvitation(db, body.token, body.displayName, body.password);
    await recordAudit(db, {
      organizationId: result.organizationId,
      actor: result.user.username,
      action: 'invitation.accepted',
      details: { role: result.user.role },
    });
    return { token: result.token, user: result.user };
  });
}

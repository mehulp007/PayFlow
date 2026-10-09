import type { FastifyInstance } from 'fastify';
import { branchBody, payGroupBody, signupBody, viewAsBody } from '@payflow/shared';
import { audit, recordAudit } from '../../lib/audit.js';
import { validate } from '../../lib/errors.js';
import { allow, currentUser, orgOf } from '../../plugins/auth.js';
import * as organizations from './service.js';

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  /** Public sign-up, rate limited per client because each call creates an organization. */
  app.post(
    '/api/organizations',
    { config: { public: true, rateLimit: { max: app.signupRateLimit, timeWindow: '1 hour' } } },
    async request => {
      const body = validate(signupBody, request.body);
      const result = await organizations.signup(db, body);
      await recordAudit(db, {
        organizationId: result.organization.id,
        actor: result.user.username,
        action: 'organization.created',
        details: { start: body.start, branches: body.branches.length },
      });
      return result;
    },
  );

  app.get('/api/bootstrap', async request => organizations.bootstrap(db, currentUser(request)));

  app.post('/api/organization/view-as', async request => {
    const { role } = validate(viewAsBody, request.body);
    const result = await organizations.viewAs(db, currentUser(request), role);
    await audit(db, request, 'demo.view_as', { role, account: result.user.username });
    return result;
  });

  app.post('/api/organization/branches', { preHandler: allow('organization.manage') }, async request => {
    const created = await organizations.addBranch(db, orgOf(request), validate(branchBody, request.body));
    await audit(db, request, 'organization.branch.added', { branch: created.name, state: created.state });
    return created;
  });

  app.post('/api/organization/pay-groups', { preHandler: allow('organization.manage') }, async request => {
    const { name } = validate(payGroupBody, request.body);
    const created = await organizations.addPayGroup(db, orgOf(request), name);
    await audit(db, request, 'organization.pay_group.added', { payGroup: created.name });
    return created;
  });

  app.post('/api/organization/reset-sample', { preHandler: allow('organization.manage') }, async request => {
    await organizations.resetSample(db, orgOf(request));
    await audit(db, request, 'demo.reset');
    return organizations.bootstrap(db, currentUser(request));
  });

  app.get('/api/compliance/rules', { preHandler: allow('compliance.read') }, async request =>
    organizations.complianceRules(db, orgOf(request)),
  );
}

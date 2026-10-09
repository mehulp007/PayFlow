import type { FastifyInstance } from 'fastify';
import { declarationBody } from '@payflow/shared';
import { audit } from '../../lib/audit.js';
import { validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser, orgOf } from '../../plugins/auth.js';
import { accountsForEmployees, notifyPermission, notifyUsers } from '../notifications/service.js';
import * as tax from './service.js';

export async function taxRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const codeParam = (params: unknown) => String((params as { id: string }).id).toUpperCase();

  app.get('/api/employees/:id/tax', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'employees.read');
    return tax.taxSummary(db, orgOf(request), code);
  });

  /** Employees declare for themselves (Form 124); HR may enter a declaration on their behalf. */
  app.put('/api/employees/:id/declaration', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'leave.manage');
    const { person } = await tax.saveDeclaration(db, orgOf(request), code, validate(declarationBody, request.body));
    await audit(db, request, 'tax.declaration.submitted', { employeeId: code });
    await notifyPermission(
      db,
      orgOf(request),
      'leave.manage',
      {
        kind: 'declaration.submitted',
        title: `${person.name} submitted a tax declaration`,
        link: `/people?employee=${code}&tab=tax`,
      },
      currentUser(request).id,
    );
    return tax.taxSummary(db, orgOf(request), code);
  });

  app.post('/api/employees/:id/declaration/verify', { preHandler: allow('leave.manage') }, async request => {
    const code = codeParam(request.params);
    const { person } = await tax.verifyDeclaration(db, orgOf(request), code, currentUser(request).username);
    await audit(db, request, 'tax.declaration.verified', { employeeId: code });
    await notifyUsers(
      db,
      orgOf(request),
      await accountsForEmployees(db, orgOf(request), [person.id]),
      { kind: 'declaration.verified', title: 'HR verified your tax declaration', link: '/me' },
      currentUser(request).id,
    );
    return tax.taxSummary(db, orgOf(request), code);
  });
}

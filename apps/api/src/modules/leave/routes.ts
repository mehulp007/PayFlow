import type { FastifyInstance, FastifyRequest } from 'fastify';
import { carryForwardBody, leaveDecisionBody, leaveListQuery, leaveRequestBody } from '@payflow/shared';
import { audit } from '../../lib/audit.js';
import { validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser, orgOf } from '../../plugins/auth.js';
import { latestRun } from '../runs/service.js';
import * as leave from './service.js';

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const codeParam = (params: unknown) => String((params as { id: string }).id).toUpperCase();
  /** The leave year follows the organization's current pay period (the calendar year when it has none). */
  const leaveYear = async (request: FastifyRequest) =>
    (await latestRun(db, orgOf(request)))?.year ?? new Date().getUTCFullYear();

  app.get('/api/employees/:id/leave', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'employees.read');
    return leave.leaveSummary(db, orgOf(request), code, await leaveYear(request));
  });

  app.post('/api/employees/:id/leave', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'leave.manage');
    const body = validate(leaveRequestBody, request.body);
    const created = await leave.requestLeave(db, orgOf(request), currentUser(request), code, body);
    await audit(db, request, 'leave.requested', { employeeId: code, type: body.type, from: body.from, to: body.to });
    return created;
  });

  app.put('/api/employees/:id/leave/carry-forward', { preHandler: allow('leave.manage') }, async request => {
    const code = codeParam(request.params);
    const { days } = validate(carryForwardBody, request.body);
    const year = await leaveYear(request);
    await leave.setCarryForward(db, orgOf(request), code, year, days);
    await audit(db, request, 'leave.carry_forward.set', { employeeId: code, year, days });
    return leave.leaveSummary(db, orgOf(request), code, year);
  });

  app.get('/api/leave', async request =>
    leave.listLeave(db, orgOf(request), currentUser(request), validate(leaveListQuery, request.query)),
  );

  app.post('/api/leave/:id/decision', async request => {
    const { id } = request.params as { id: string };
    const body = validate(leaveDecisionBody, request.body);
    const decided = await leave.decideLeave(db, orgOf(request), currentUser(request), id, body);
    await audit(db, request, `leave.${body.decision}`, { employeeId: decided.employeeId, from: decided.from });
    return decided;
  });

  app.post('/api/leave/:id/cancel', async request => {
    const { id } = request.params as { id: string };
    await leave.cancelLeave(db, orgOf(request), currentUser(request), id);
    await audit(db, request, 'leave.cancelled', { requestId: id });
    return { ok: true };
  });
}

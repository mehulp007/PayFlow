import type { FastifyInstance } from 'fastify';
import {
  can,
  createEmployeeBody,
  employeeListQuery,
  exitBody,
  managersQuery,
  salaryRevisionBody,
  updateEmployeeBody,
} from '@payflow/shared';
import { audit } from '../../lib/audit.js';
import { forbidden, validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser, orgOf } from '../../plugins/auth.js';
import { refreshOpenRuns } from '../runs/service.js';
import * as service from './service.js';

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const codeParam = (params: unknown) => String((params as { id: string }).id).toUpperCase();

  app.get('/api/employees', { preHandler: allow('employees.read') }, async request =>
    service.listEmployees(db, orgOf(request), validate(employeeListQuery, request.query)),
  );

  app.post('/api/employees', { preHandler: allow('employees.write') }, async request => {
    const body = validate(createEmployeeBody, request.body);
    const code = await service.createEmployee(db, orgOf(request), body, currentUser(request).username);
    await refreshOpenRuns(db, orgOf(request));
    await audit(db, request, 'employee.created', {
      employeeId: code,
      employmentType: body.employmentType,
      positionLevel: body.positionLevel,
    });
    return service.getEmployee(db, orgOf(request), code);
  });

  app.get('/api/employees/:id', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'employees.read');
    return service.getEmployee(db, orgOf(request), code);
  });

  app.patch('/api/employees/:id', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'employees.write');
    const body = validate(updateEmployeeBody, request.body);
    await service.updateEmployee(db, orgOf(request), code, body, currentUser(request));
    if (body.payGroupId) await refreshOpenRuns(db, orgOf(request));
    await audit(db, request, 'employee.updated', { employeeId: code, fields: Object.keys(body) });
    return { ok: true, message: 'Employee updated. Recalculate open runs to apply the change.' };
  });

  app.get('/api/employees/:id/salary-revisions', async request => {
    const code = codeParam(request.params);
    assertSelfOrPermission(request, code, 'employees.read');
    return service.listRevisions(db, orgOf(request), code);
  });

  app.post('/api/employees/:id/salary-revisions', { preHandler: allow('employees.write') }, async request => {
    const code = codeParam(request.params);
    const body = validate(salaryRevisionBody, request.body);
    await service.addRevision(db, orgOf(request), code, body, currentUser(request).username);
    await audit(db, request, 'employee.salary.revised', { employeeId: code, effectiveFrom: body.effectiveFrom });
    return service.listRevisions(db, orgOf(request), code);
  });

  app.post('/api/employees/:id/exit', { preHandler: allow('employees.write') }, async request => {
    const code = codeParam(request.params);
    const body = validate(exitBody, request.body);
    await service.exitEmployee(db, orgOf(request), code, body);
    await refreshOpenRuns(db, orgOf(request));
    await audit(db, request, 'employee.exited', { employeeId: code, exitDate: body.exitDate });
    return service.getEmployee(db, orgOf(request), code);
  });

  app.get('/api/hierarchy/summary', { preHandler: allow('hierarchy.read') }, async request =>
    service.hierarchySummary(db, orgOf(request)),
  );

  app.get('/api/hierarchy/managers', async request => {
    if (!can(currentUser(request).role, 'employees.write')) throw forbidden();
    const query = validate(managersQuery, request.query);
    return service.managerOptions(db, orgOf(request), query.level, query.search);
  });
}

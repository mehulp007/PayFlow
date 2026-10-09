import type { FastifyInstance } from 'fastify';
import {
  BRANCHES,
  can,
  createEmployeeBody,
  EMPLOYMENT_TYPES,
  employeeListQuery,
  managersQuery,
  POSITION_LEVELS,
  updateEmployeeBody,
  type EmploymentType,
  type HierarchySummary,
} from '@payflow/shared';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { employees } from '../../db/schema.js';
import { recordAudit } from '../../lib/audit.js';
import { forbidden, validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser } from '../../plugins/auth.js';
import { currentRunId } from '../runs/service.js';
import * as service from './service.js';

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/api/employees', { preHandler: allow('employees.read') }, async request =>
    service.listEmployees(db, await currentRunId(db), validate(employeeListQuery, request.query)),
  );

  app.post('/api/employees', { preHandler: allow('employees.write') }, async request => {
    const body = validate(createEmployeeBody, request.body);
    const runId = await currentRunId(db);
    const id = await service.createEmployee(db, runId, body);
    await recordAudit(db, {
      actor: currentUser(request).id,
      action: 'employee.created',
      details: { employeeId: id, employmentType: body.employmentType, positionLevel: body.positionLevel },
    });
    return service.getEmployee(db, runId, id);
  });

  app.get('/api/employees/:id', async request => {
    const { id } = request.params as { id: string };
    assertSelfOrPermission(request, id, 'employees.read');
    return service.getEmployee(db, await currentRunId(db), id);
  });

  app.patch('/api/employees/:id', async request => {
    const { id } = request.params as { id: string };
    const user = currentUser(request);
    assertSelfOrPermission(request, id, 'employees.write');
    const body = validate(updateEmployeeBody, request.body);
    await service.updateEmployee(db, await currentRunId(db), id, body, user.role);
    await recordAudit(db, {
      actor: user.id,
      action: 'employee.updated',
      details: { employeeId: id, fields: Object.keys(body) },
    });
    return { ok: true, message: 'Employee updated. Recalculate the payroll run to refresh exceptions.' };
  });

  app.get('/api/hierarchy/summary', { preHandler: allow('hierarchy.read') }, async (): Promise<HierarchySummary> => {
    const counts = await db
      .select({
        employmentType: employees.employmentType,
        level: employees.positionLevel,
        count: sql<number>`count(*)::int`,
      })
      .from(employees)
      .where(eq(employees.employmentStatus, 'active'))
      .groupBy(employees.employmentType, employees.positionLevel);
    const departments = await db
      .selectDistinct({ department: employees.department })
      .from(employees)
      .where(and(isNotNull(employees.department)))
      .orderBy(employees.department);
    return {
      employmentTypes: [...EMPLOYMENT_TYPES],
      positionLevels: [...POSITION_LEVELS],
      branches: [...BRANCHES],
      departments: departments.map(row => row.department),
      total: counts.reduce((sum, row) => sum + row.count, 0),
      counts: counts.map(row => ({ ...row, employmentType: row.employmentType as EmploymentType })),
    };
  });

  app.get('/api/hierarchy/managers', async request => {
    if (!can(currentUser(request).role, 'employees.write')) throw forbidden();
    const query = validate(managersQuery, request.query);
    return service.managerOptions(db, query.level, query.search);
  });
}

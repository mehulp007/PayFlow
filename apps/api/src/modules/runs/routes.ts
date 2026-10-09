import type { FastifyInstance } from 'fastify';
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import {
  APPROVED_STATUSES,
  approveBody,
  can,
  csvBody,
  lineListQuery,
  reportKindParam,
  type Bootstrap,
} from '@payflow/shared';
import { appUsers, authSessions, employees, payrollInputs, payrollLines, payrollRuns } from '../../db/schema.js';
import {
  DEMO_ORGANIZATION,
  DEMO_RUN_ID,
  demoSeedSize,
  resetDemoInputs,
  SEEDED_BANK_EXCEPTIONS,
} from '../../db/seed.js';
import { recordAudit } from '../../lib/audit.js';
import { toCsv } from '../../lib/csv.js';
import { conflict, validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser } from '../../plugins/auth.js';
import { commitImport, reviewImport } from './imports.js';
import { buildReport } from './reports.js';
import * as runs from './service.js';

const employeeId = (n: number) => `EMP${String(n).padStart(5, '0')}`;

export async function runRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const runParam = (params: unknown) => (params as { id: string }).id;

  app.get('/api/bootstrap', async request => {
    const run = await runs.getRun(db, await runs.currentRunId(db));
    const user = currentUser(request);
    const currentRun = can(user.role, 'runs.read') ? await runs.summarize(db, run) : runs.toPeriod(run);
    return { organization: DEMO_ORGANIZATION, currentRun } satisfies Bootstrap;
  });

  app.get('/api/runs/:id', async request => {
    const run = await runs.getRun(db, runParam(request.params));
    return can(currentUser(request).role, 'runs.read') ? runs.summarize(db, run) : runs.toPeriod(run);
  });

  app.get('/api/runs/:id/lines', { preHandler: allow('runs.read') }, async request =>
    runs.listLines(db, runParam(request.params), validate(lineListQuery, request.query)),
  );

  app.get('/api/runs/:id/exceptions', { preHandler: allow('runs.read') }, async request =>
    runs.listExceptions(db, runParam(request.params)),
  );

  app.get('/api/runs/:id/audit', { preHandler: allow('audit.read') }, async request =>
    runs.listAudit(db, runParam(request.params)),
  );

  app.post('/api/runs/:id/calculate', { preHandler: allow('runs.prepare') }, async request => {
    const id = runParam(request.params);
    const count = await runs.calculateRun(db, id);
    const run = await runs.getRun(db, id);
    await recordAudit(db, {
      runId: id,
      actor: currentUser(request).id,
      action: 'payroll.calculated',
      details: { employees: count, version: run.version },
    });
    return runs.summarize(db, run);
  });

  app.post('/api/runs/:id/import/preview', { preHandler: allow('runs.prepare') }, async request =>
    reviewImport(db, validate(csvBody, request.body).csv),
  );

  app.post('/api/runs/:id/import/commit', { preHandler: allow('runs.prepare') }, async request => {
    const id = runParam(request.params);
    const imported = await commitImport(db, id, validate(csvBody, request.body).csv);
    await recordAudit(db, {
      runId: id,
      actor: currentUser(request).id,
      action: 'inputs.imported',
      details: { count: imported },
    });
    return { ok: true, imported };
  });

  app.post('/api/runs/:id/submit', { preHandler: allow('runs.prepare') }, async request => {
    const id = runParam(request.params);
    await runs.submitRun(db, id, currentUser(request).id);
    await recordAudit(db, { runId: id, actor: currentUser(request).id, action: 'payroll.submitted' });
    return runs.summarize(db, await runs.getRun(db, id));
  });

  app.post('/api/runs/:id/approve', { preHandler: allow('runs.approve') }, async request => {
    const id = runParam(request.params);
    const { note } = validate(approveBody, request.body);
    await runs.approveRun(db, id, currentUser(request).id);
    await recordAudit(db, {
      runId: id,
      actor: currentUser(request).id,
      action: 'payroll.approved',
      details: { note: note ?? '' },
    });
    return runs.summarize(db, await runs.getRun(db, id));
  });

  app.post('/api/runs/:id/reconcile-demo', { preHandler: allow('runs.reconcile') }, async request => {
    const id = runParam(request.params);
    await runs.reconcileRun(db, id);
    await recordAudit(db, {
      runId: id,
      actor: currentUser(request).id,
      action: 'payments.reconciled.demo',
      details: { notice: 'Synthetic demonstration only' },
    });
    return runs.summarize(db, await runs.getRun(db, id));
  });

  app.get('/api/runs/:id/payslip/:employeeId', async request => {
    const { id, employeeId: target } = request.params as { id: string; employeeId: string };
    assertSelfOrPermission(request, target, 'runs.read');
    return runs.getPayslip(db, id, target, currentUser(request).role === 'employee');
  });

  app.get('/api/runs/:id/export/:kind', { preHandler: allow('reports.export') }, async (request, reply) => {
    const { id, kind: rawKind } = request.params as { id: string; kind: string };
    const kind = validate(reportKindParam, rawKind);
    const run = await runs.getRun(db, id);
    if (kind === 'bank-demo' && !APPROVED_STATUSES.includes(run.status)) throw conflict('Bank file requires approval');
    const output = toCsv(buildReport(kind, await runs.linesForExport(db, id)));
    await recordAudit(db, { runId: id, actor: currentUser(request).id, action: 'report.exported', details: { kind } });
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${id}-${kind}.csv"`)
      .send(output);
  });

  /** Restores the synthetic company: removes added people and their accounts, and returns the run to draft. */
  app.post('/api/demo/reset', { preHandler: allow('demo.reset') }, async request => {
    const lastSeeded = employeeId(await demoSeedSize(db));
    await db.transaction(async tx => {
      const added = tx.select({ id: employees.id }).from(employees).where(gt(employees.id, lastSeeded));
      const addedUsers = tx.select({ id: appUsers.id }).from(appUsers).where(inArray(appUsers.employeeId, added));
      await tx.delete(payrollLines).where(eq(payrollLines.runId, DEMO_RUN_ID));
      await tx.delete(authSessions).where(inArray(authSessions.userId, addedUsers));
      await tx.delete(appUsers).where(inArray(appUsers.employeeId, added));
      await tx.delete(payrollInputs).where(inArray(payrollInputs.employeeId, added));
      await tx.delete(employees).where(gt(employees.id, lastSeeded));
      await tx
        .update(payrollRuns)
        .set({
          status: 'draft',
          preparedBy: null,
          approvedBy: null,
          approvedAt: null,
          version: sql`${payrollRuns.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(payrollRuns.id, DEMO_RUN_ID));
      await tx
        .update(employees)
        .set({ bankReady: false, bankAccountLast4: null })
        .where(lte(employees.id, employeeId(SEEDED_BANK_EXCEPTIONS)));
      await tx
        .update(employees)
        .set({ taxRegime: 'new' })
        .where(and(eq(employees.id, 'EMP00001')));
      await resetDemoInputs(tx);
    });
    await recordAudit(db, { runId: DEMO_RUN_ID, actor: currentUser(request).id, action: 'demo.reset' });
    return runs.summarize(db, await runs.getRun(db, DEMO_RUN_ID));
  });
}

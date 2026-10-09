import type { FastifyInstance } from 'fastify';
import {
  APPROVED_STATUSES,
  approveBody,
  can,
  createRunBody,
  csvBody,
  lineListQuery,
  rejectBody,
  reportKindParam,
} from '@payflow/shared';
import { audit } from '../../lib/audit.js';
import { toCsv } from '../../lib/csv.js';
import { conflict, forbidden, validate } from '../../lib/errors.js';
import { allow, assertSelfOrPermission, currentUser, orgOf } from '../../plugins/auth.js';
import { findEmployeeRow } from '../employees/service.js';
import { accountsForEmployees, notifyPermission, notifyUsers } from '../notifications/service.js';
import { getOrganization } from '../organizations/service.js';
import { commitImport, reviewImport } from './imports.js';
import { payslipPdf } from './payslipPdf.js';
import { buildReport } from './reports.js';
import * as runs from './service.js';

export async function runRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const runParam = (params: unknown) => String((params as { id: string }).id);
  const periodName = async (organizationId: string, id: string) => {
    const run = await runs.getRun(db, organizationId, id);
    return new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  app.get('/api/runs', { preHandler: allow('runs.read') }, async request => runs.listRuns(db, orgOf(request)));

  app.post('/api/runs', { preHandler: allow('runs.create') }, async request => {
    const body = validate(createRunBody, request.body);
    const run = await runs.createRun(db, orgOf(request), body);
    await audit(db, request, 'payroll.run.created', { year: body.year, month: body.month }, run.id);
    return runs.summarize(db, run);
  });

  app.get('/api/runs/:id', async request => {
    const run = await runs.getRun(db, orgOf(request), runParam(request.params));
    return can(currentUser(request).role, 'runs.read') ? runs.summarize(db, run) : runs.toPeriod(db, run);
  });

  app.get('/api/runs/:id/lines', { preHandler: allow('runs.read') }, async request =>
    runs.listLines(db, orgOf(request), runParam(request.params), validate(lineListQuery, request.query)),
  );

  app.get('/api/runs/:id/exceptions', { preHandler: allow('runs.read') }, async request =>
    runs.listExceptions(db, orgOf(request), runParam(request.params)),
  );

  app.get('/api/runs/:id/audit', { preHandler: allow('audit.read') }, async request =>
    runs.listAudit(db, orgOf(request), runParam(request.params)),
  );

  /** Lifecycle actions share one shape: perform, audit, return the fresh summary. */
  const action = (
    path: string,
    permission: Parameters<typeof allow>[0],
    event: string,
    perform: (organizationId: string, runId: string, request: Parameters<typeof currentUser>[0]) => Promise<unknown>,
  ) =>
    app.post(`/api/runs/:id/${path}`, { preHandler: allow(permission) }, async request => {
      const id = runParam(request.params);
      const details = await perform(orgOf(request), id, request);
      await audit(db, request, event, (details as Record<string, unknown>) ?? {}, id);
      return runs.summarize(db, await runs.getRun(db, orgOf(request), id));
    });

  action('calculate', 'runs.prepare', 'payroll.calculated', async (organizationId, id) => ({
    employees: await runs.calculateRun(db, organizationId, id),
  }));
  action('submit', 'runs.prepare', 'payroll.submitted', async (organizationId, id, request) => {
    await runs.submitRun(db, organizationId, id, currentUser(request).id);
    await notifyPermission(
      db,
      organizationId,
      'runs.approve',
      {
        kind: 'run.submitted',
        title: `${await periodName(organizationId, id)} payroll is ready for approval`,
        link: `/payroll/${id}`,
      },
      currentUser(request).id,
    );
  });
  action('approve', 'runs.approve', 'payroll.approved', async (organizationId, id, request) => {
    const { note } = validate(approveBody, request.body);
    await runs.approveRun(db, organizationId, id, currentUser(request).id);
    const period = await periodName(organizationId, id);
    await notifyPermission(
      db,
      organizationId,
      'runs.prepare',
      { kind: 'run.approved', title: `${period} payroll was approved`, body: note, link: `/payroll/${id}` },
      currentUser(request).id,
    );
    // Each employee with an account learns their wage slip is ready (Code on Wages, s. 50(3)).
    await notifyUsers(
      db,
      organizationId,
      await accountsForEmployees(db, organizationId, await runs.lineEmployeeKeys(db, id)),
      {
        kind: 'payslip.ready',
        title: `Your ${period} payslip is ready`,
        link: '/me',
      },
    );
    return { note: note ?? '' };
  });
  action('reject', 'runs.reject', 'payroll.sent_back', async (organizationId, id, request) => {
    const { note } = validate(rejectBody, request.body);
    await runs.rejectRun(db, organizationId, id, note);
    await notifyPermission(
      db,
      organizationId,
      'runs.prepare',
      {
        kind: 'run.sent_back',
        title: `${await periodName(organizationId, id)} payroll was sent back`,
        body: note,
        link: `/payroll/${id}`,
      },
      currentUser(request).id,
    );
    return { note };
  });
  action('reconcile', 'runs.reconcile', 'payments.reconciled.demo', async (organizationId, id) => {
    await runs.markPaid(db, organizationId, id);
    return { notice: 'Synthetic demonstration only' };
  });
  action('close', 'runs.close', 'payroll.closed', (organizationId, id) => runs.closeRun(db, organizationId, id));

  app.post('/api/runs/:id/import/preview', { preHandler: allow('runs.prepare') }, async request =>
    reviewImport(db, orgOf(request), runParam(request.params), validate(csvBody, request.body).csv),
  );

  app.post('/api/runs/:id/import/commit', { preHandler: allow('runs.prepare') }, async request => {
    const id = runParam(request.params);
    const imported = await commitImport(db, orgOf(request), id, validate(csvBody, request.body).csv);
    await audit(db, request, 'inputs.imported', { count: imported }, id);
    return { ok: true, imported };
  });

  app.get('/api/runs/:id/payslip/:employeeId', async request => {
    const { id, employeeId } = request.params as { id: string; employeeId: string };
    const code = employeeId.toUpperCase();
    assertSelfOrPermission(request, code, 'runs.read');
    return runs.getPayslip(db, orgOf(request), id, code, currentUser(request).role === 'employee');
  });

  /** The same payslip as a downloadable PDF wage slip. */
  app.get('/api/runs/:id/payslip/:employeeId/pdf', async (request, reply) => {
    const { id, employeeId } = request.params as { id: string; employeeId: string };
    const code = employeeId.toUpperCase();
    assertSelfOrPermission(request, code, 'runs.read');
    const organizationId = orgOf(request);
    const payslip = await runs.getPayslip(db, organizationId, id, code, currentUser(request).role === 'employee');
    const [run, person, organization] = await Promise.all([
      runs.getRun(db, organizationId, id),
      findEmployeeRow(db, organizationId, code),
      getOrganization(db, organizationId),
    ]);
    const pdf = await payslipPdf({
      organizationName: organization.name,
      year: run.year,
      month: run.month,
      paymentDate: run.paymentDate,
      status: run.status,
      line: payslip.line,
      employee: person,
    });
    await audit(db, request, 'payslip.downloaded', { employeeId: code }, id);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="payslip-${payslip.period}-${code}.pdf"`)
      .send(pdf);
  });

  /** The signed-in employee's approved payslips, newest first. */
  app.get('/api/me/payslips', async request => {
    const user = currentUser(request);
    if (!user.employeeKey) throw forbidden('This account is not linked to an employee record');
    return runs.payslipsFor(db, user.organizationId, user.employeeKey);
  });

  /** Approved payslips for one person: their own, or anyone's for staff who can read runs. */
  app.get('/api/employees/:id/payslips', async request => {
    const code = String((request.params as { id: string }).id).toUpperCase();
    assertSelfOrPermission(request, code, 'runs.read');
    const person = await findEmployeeRow(db, orgOf(request), code);
    return runs.payslipsFor(db, orgOf(request), person.id);
  });

  app.get('/api/runs/:id/export/:kind', { preHandler: allow('reports.export') }, async (request, reply) => {
    const { id, kind: rawKind } = request.params as { id: string; kind: string };
    const kind = validate(reportKindParam, rawKind);
    const run = await runs.getRun(db, orgOf(request), id);
    if (kind === 'bank-demo' && !APPROVED_STATUSES.includes(run.status)) throw conflict('Bank file requires approval');
    const output = toCsv(buildReport(kind, await runs.linesForExport(db, orgOf(request), id)));
    await audit(db, request, 'report.exported', { kind }, id);
    const period = `${run.year}-${String(run.month).padStart(2, '0')}`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="payroll-${period}-${kind}.csv"`)
      .send(output);
  });
}

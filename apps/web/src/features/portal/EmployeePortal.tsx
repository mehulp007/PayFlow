import { useState } from 'react';
import type { TaxRegime } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useReportError } from '../../app/FeedbackProvider';
import { useCurrentRun, useEmployee, useEmployeeMutations, useMyPayslips, usePayslip } from '../../app/queries';
import { DetailRow } from '../../components';
import { money } from '../../lib/format';
import { periodLabel } from '../../lib/period';

/** Self service: the signed-in employee's record, tax regime choice and payslip. */
export function EmployeePortal() {
  const user = useUser();
  const { run } = useCurrentRun();
  const employee = useEmployee(user.employeeId).data;
  const latest = useMyPayslips(Boolean(user.employeeId)).data?.[0];
  const [showPayslip, setShowPayslip] = useState(false);
  const payslip = usePayslip(latest?.runId, showPayslip ? user.employeeId : null);
  const { update } = useEmployeeMutations();
  useReportError(payslip.error ?? update.error);

  const status = run?.status ?? 'draft';
  const period = run ? periodLabel(run.year, run.month) : '';
  const month = latest ? periodLabel(latest.year, latest.month).split(' ')[0] : period.split(' ')[0];
  const contractor = employee?.payrollScope === false;
  const slip = payslip.data?.line;
  const chooseRegime = (taxRegime: TaxRegime) =>
    user.employeeId && update.mutate({ id: user.employeeId, changes: { taxRegime } });

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EMPLOYEE SELF SERVICE · {period.toUpperCase()}</div>
          <h1>Hello, {employee?.name.split(' ')[0] ?? 'there'}</h1>
          <p>Your pay, tax choice and employment details.</p>
        </div>
      </div>
      <div className="overview-banner">
        <div>
          <span className="banner-kicker">{contractor ? 'MY RECORD' : 'MY PAYSLIP'}</span>
          <h2>{contractor ? 'Directory and attendance' : slip ? `${month} pay` : `${month} payslip`}</h2>
          <p>
            {contractor
              ? 'This contractor record is outside employee payroll.'
              : slip
                ? `Net pay ${money(slip.net)}`
                : latest
                  ? 'Your latest approved payslip is ready.'
                  : 'Available after Finance approval.'}
          </p>
          {!contractor && (
            <button className="button white" onClick={() => (showPayslip ? payslip.refetch() : setShowPayslip(true))}>
              View my payslip
            </button>
          )}
        </div>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-title">
            <h2>My record</h2>
          </div>
          <div className="panel-rows">
            <DetailRow label="Employee ID" value={employee?.id ?? '—'} />
            <DetailRow label="Position" value={employee?.jobTitle ?? '—'} />
            <DetailRow label="Branch" value={employee?.branch ?? '—'} />
            <DetailRow label="Work state" value={employee?.state ?? '—'} />
            <DetailRow label="Working days" value={employee?.workingDays ?? '—'} />
            <DetailRow label="Unpaid days" value={employee?.unpaidDays ?? '—'} />
            <DetailRow label="Leave balance" value={`${employee?.leaveBalanceDays ?? '—'} days`} />
            {!contractor && (
              <>
                <DetailRow label="Tax regime" value={employee?.taxRegime ?? '—'} />
                <DetailRow
                  label="Bank account"
                  value={employee?.bankAccountLast4 ? `•••• ${employee.bankAccountLast4}` : 'Needs verification'}
                />
                <p>Tax regime selection for this pay run:</p>
                <div className="header-buttons">
                  <button
                    className="button outline"
                    disabled={status !== 'draft' || update.isPending}
                    onClick={() => chooseRegime('new')}
                  >
                    New regime
                  </button>
                  <button
                    className="button outline"
                    disabled={status !== 'draft' || update.isPending}
                    onClick={() => chooseRegime('old')}
                  >
                    Old regime
                  </button>
                </div>
                {status !== 'draft' && <div className="info-strip">Tax choice is locked after calculation.</div>}
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>{slip ? 'Payslip breakdown' : 'Pay status'}</h2>
          </div>
          <div className="panel-rows">
            {slip ? (
              <>
                <DetailRow label="Basic" value={money(slip.basic)} />
                <DetailRow label="HRA" value={money(slip.hra)} />
                <DetailRow label="Special allowance" value={money(slip.special)} />
                <DetailRow label="Variable pay" value={money(slip.variablePay)} />
                <DetailRow label="Gross" value={money(slip.gross)} />
                <DetailRow label="Deductions" value={money(slip.deductions)} />
                <DetailRow label="Net pay" value={money(slip.net)} />
              </>
            ) : (
              <div className="info-strip">The payslip appears here after the run is approved.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, CalendarCheck2, Download, FileText } from 'lucide-react';
import { useUser } from '../../app/AuthProvider';
import { useFeedback, useReportError } from '../../app/FeedbackProvider';
import { useCurrentRun, useEmployee, useMyPayslips, usePayslip } from '../../app/queries';
import { DetailRow } from '../../components';
import { download } from '../../lib/api';
import { money } from '../../lib/format';
import { periodLabel } from '../../lib/period';

/** Self service home: the signed-in employee's record and latest payslip. */
export function EmployeePortal() {
  const user = useUser();
  const navigate = useNavigate();
  const { notify, fail } = useFeedback();
  const { run } = useCurrentRun();
  const employee = useEmployee(user.employeeId).data;
  const latest = useMyPayslips(Boolean(user.employeeId)).data?.[0];
  const [showPayslip, setShowPayslip] = useState(false);
  const payslip = usePayslip(latest?.runId, showPayslip ? user.employeeId : null);
  useReportError(payslip.error);

  const period = run ? periodLabel(run.year, run.month) : '';
  const month = latest ? periodLabel(latest.year, latest.month).split(' ')[0] : period.split(' ')[0];
  const contractor = employee?.payrollScope === false;
  const slip = payslip.data?.line;
  const downloadPdf = () =>
    latest &&
    download(`/runs/${latest.runId}/payslip/${user.employeeId}/pdf`)
      .then(() => notify('Payslip PDF downloaded.'))
      .catch(fail);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EMPLOYEE SELF SERVICE · {period.toUpperCase()}</div>
          <h1>Hello, {employee?.name.split(' ')[0] ?? 'there'}</h1>
          <p>Your pay, tax choice, leave and employment details.</p>
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
            <div className="banner-actions">
              <button className="button white" onClick={() => (showPayslip ? payslip.refetch() : setShowPayslip(true))}>
                View my payslip
              </button>
              {latest && (
                <button className="button ghost-white" onClick={downloadPdf}>
                  <Download size={16} /> PDF
                </button>
              )}
            </div>
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
            {!contractor && (
              <>
                <DetailRow label="Earned leave left" value={`${employee?.leaveBalanceDays ?? '—'} days`} />
                <DetailRow label="Tax regime" value={employee ? `${employee.taxRegime} regime` : '—'} />
                <DetailRow
                  label="Bank account"
                  value={employee?.bankAccountLast4 ? `•••• ${employee.bankAccountLast4}` : 'Needs verification'}
                />
                <div className="header-buttons">
                  <button className="button outline" onClick={() => navigate('/me/tax')}>
                    <FileText size={16} /> Compare regimes
                  </button>
                  <button className="button outline" onClick={() => navigate('/me/leave')}>
                    <CalendarCheck2 size={16} /> Request leave
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>{slip ? 'Payslip breakdown' : 'Pay status'}</h2>
            {latest && (
              <button className="text-button" onClick={() => navigate('/me/payslips')}>
                All payslips <ArrowRight size={15} />
              </button>
            )}
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

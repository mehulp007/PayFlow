import { useState } from 'react';
import { Download, FileText, Receipt, Users } from 'lucide-react';
import type { TaxRegime } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback, useReportError } from '../../app/FeedbackProvider';
import { useEmployeeMutations, useLeaveList, useLeaveSummary, useMyPayslips, useTaxSummary } from '../../app/queries';
import { EmptyState, Heading, PanelTitle, Pill } from '../../components';
import { download } from '../../lib/api';
import { money, runTone, statusLabel } from '../../lib/format';
import { periodLabel } from '../../lib/period';
import { LeaveBalances, LeaveRequestForm, LeaveRequestTable } from '../leave/LeaveParts';
import { PayslipModal } from '../payslips/PayslipModal';
import { DeclarationForm } from '../tax/DeclarationForm';
import { RegimeComparison } from '../tax/RegimeComparison';

/** Every approved payslip, newest first, to view or download as PDF. */
export function PortalPayslips() {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const payslips = useMyPayslips(Boolean(user.employeeId));
  const [open, setOpen] = useState<string | null>(null);
  useReportError(payslips.error);

  return (
    <>
      <Heading
        eyebrow="EMPLOYEE SELF SERVICE / PAYSLIPS"
        title="Payslips"
        description="Wage slips for every month Finance approved. Download any of them as a PDF."
      />
      <section className="panel">
        {payslips.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th>Gross pay</th>
                  <th>Net pay</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payslips.data.map(slip => (
                  <tr key={slip.runId}>
                    <td>
                      <strong>{periodLabel(slip.year, slip.month)}</strong>
                    </td>
                    <td>
                      <Pill tone={runTone(slip.status)}>{statusLabel(slip.status)}</Pill>
                    </td>
                    <td className="numeric">{money(slip.gross)}</td>
                    <td className="numeric net-cell">{money(slip.net)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="button small outline" onClick={() => setOpen(slip.runId)}>
                          <FileText size={15} /> View
                        </button>
                        <button
                          className="button small primary"
                          aria-label={`Download ${periodLabel(slip.year, slip.month)} payslip`}
                          onClick={() =>
                            download(`/runs/${slip.runId}/payslip/${user.employeeId}/pdf`)
                              .then(() => notify('Payslip PDF downloaded.'))
                              .catch(fail)
                          }
                        >
                          <Download size={15} /> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          payslips.isSuccess && (
            <EmptyState icon={Receipt} title="No payslips yet">
              Your first payslip appears here once Finance approves a payroll run that includes you.
            </EmptyState>
          )
        )}
      </section>
      {open && user.employeeId && (
        <PayslipModal runId={open} employeeId={user.employeeId} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** Both regimes side by side, the regime choice, and the year's declaration (Form 124). */
export function PortalTax() {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const tax = useTaxSummary(user.employeeId);
  const { update } = useEmployeeMutations();
  useReportError(tax.error);
  const summary = tax.data;

  async function choose(taxRegime: TaxRegime) {
    if (!user.employeeId) return;
    try {
      await update.mutateAsync({ id: user.employeeId, changes: { taxRegime } });
      notify(`You chose the ${taxRegime} regime for this pay run.`);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <>
      <Heading
        eyebrow={`EMPLOYEE SELF SERVICE / TAX YEAR ${summary?.taxYearLabel ?? ''}`}
        title="Tax & declarations"
        description="See your year's tax under both regimes, choose one, and declare rent and savings for the old regime."
      />
      {summary && (
        <div className="tax-layout">
          <section className="panel">
            <PanelTitle
              title="Regime comparison"
              description={`Projected for ${periodLabel(summary.period.year, summary.period.month)} with your salary to March`}
            />
            <RegimeComparison summary={summary} />
            <div className="header-buttons regime-choice">
              {(['new', 'old'] as const).map(regime => (
                <button
                  key={regime}
                  className={`button ${summary.regime === regime ? 'primary' : 'outline'}`}
                  disabled={summary.regimeLocked || update.isPending || summary.regime === regime}
                  onClick={() => choose(regime)}
                >
                  {summary.regime === regime ? `Using the ${regime} regime` : `Switch to the ${regime} regime`}
                </button>
              ))}
            </div>
            {summary.regimeLocked && (
              <div className="info-strip">
                The regime is locked once this month’s payroll is calculated. You can change it in next month’s draft.
              </div>
            )}
          </section>
          <section className="panel">
            <PanelTitle
              title="Declaration (Form 124)"
              description="Used for TDS under the old regime; keep proofs for HR"
            />
            {user.employeeId && (
              <DeclarationForm
                key={summary.declaration?.submittedAt ?? 'new'}
                employeeId={user.employeeId}
                declaration={summary.declaration}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}

/** Leave balances, requests, and the team's requests for people who manage others. */
export function PortalLeave() {
  const user = useUser();
  const leave = useLeaveSummary(user.employeeId);
  const team = useLeaveList({ scope: 'team', status: 'pending', page: 1 });
  useReportError(leave.error);
  const summary = leave.data;

  return (
    <>
      <Heading
        eyebrow={`EMPLOYEE SELF SERVICE / LEAVE ${summary?.year ?? ''}`}
        title="Leave"
        description="Earned leave follows the OSH Code: one day for every 20 days worked last year, once you have worked 180 days."
      />
      {summary && <LeaveBalances summary={summary} />}
      {Boolean(team.data?.total) && (
        <section className="panel">
          <PanelTitle title="Your team’s requests" description="As their manager, you approve or reject these" />
          <LeaveRequestTable requests={team.data!.items} showPerson canDecide canCancel={false} empty="" />
        </section>
      )}
      <div className="two-column leave-columns">
        <section className="panel">
          <PanelTitle title="Request leave" description="Sundays are weekly rest days and are not counted" />
          {user.employeeId && <LeaveRequestForm employeeId={user.employeeId} />}
        </section>
        <section className="panel">
          <PanelTitle title="My requests" description="Pending requests can be cancelled" />
          {summary && (
            <LeaveRequestTable
              requests={summary.requests}
              showPerson={false}
              canDecide={false}
              canCancel
              empty="No leave requests yet."
            />
          )}
          {summary && !summary.earned.qualifies && (
            <div className="info-strip">
              <Users size={17} /> Earned leave starts once you work 180 days in a calendar year: you worked{' '}
              {summary.earned.daysWorkedLastYear} last year.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

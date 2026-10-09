import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarPlus, ChevronRight, ClipboardList } from 'lucide-react';
import { can } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useReportError } from '../../app/FeedbackProvider';
import { useBootstrap, useRuns } from '../../app/queries';
import { EmptyState, Heading, Pill } from '../../components';
import { count, money, runTone, statusLabel } from '../../lib/format';
import { periodLabel } from '../../lib/period';
import { NewRunModal } from './NewRunModal';

/** Every pay period of the organization, newest first. */
export function RunsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const runs = useRuns();
  const organization = useBootstrap().data?.organization;
  const [creating, setCreating] = useState(false);
  useReportError(runs.error);
  const canCreate = can(user.role, 'runs.create');
  const newRunButton = canCreate && (
    <button className="button primary" onClick={() => setCreating(true)}>
      <CalendarPlus size={17} /> New pay run
    </button>
  );

  return (
    <>
      <Heading
        eyebrow="PAYROLL / RUNS"
        title="Pay runs"
        description="Open a period, calculate, send to Finance, then record payment and close."
        action={newRunButton}
      />
      <section className="panel">
        {runs.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Pay group</th>
                  <th>Status</th>
                  <th>People</th>
                  <th>Gross pay</th>
                  <th>Net pay</th>
                  <th>Payment date</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map(run => (
                  <tr key={run.id} onClick={() => navigate(`/payroll/${run.id}`)}>
                    <td>
                      <strong>{periodLabel(run.year, run.month)}</strong>
                      <small>
                        {run.calculatedEmployees ? `${count(run.calculatedEmployees)} calculated` : 'Not calculated'}
                      </small>
                    </td>
                    <td>{run.payGroupName}</td>
                    <td>
                      <Pill tone={runTone(run.status)}>{statusLabel(run.status)}</Pill>
                    </td>
                    <td className="numeric">{count(run.totalEmployees)}</td>
                    <td className="numeric">{money(run.gross)}</td>
                    <td className="numeric net-cell">{money(run.net)}</td>
                    <td>{run.paymentDate}</td>
                    <td>
                      <button className="icon-button" aria-label={`Open ${periodLabel(run.year, run.month)}`}>
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          runs.isSuccess && (
            <EmptyState icon={ClipboardList} title="No pay runs yet" action={newRunButton}>
              {organization?.branches.length
                ? 'Open your first pay period. Everyone employed in the month is included automatically.'
                : 'Add a branch and your people first, then open a pay period.'}
            </EmptyState>
          )
        )}
      </section>
      {creating && (
        <NewRunModal
          payGroups={organization?.payGroups ?? []}
          onClose={() => setCreating(false)}
          onCreated={id => navigate(`/payroll/${id}`)}
        />
      )}
    </>
  );
}

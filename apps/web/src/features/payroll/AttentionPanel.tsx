import { useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Info,
  LockKeyhole,
  Send,
} from 'lucide-react';
import { can, type RunException, type RunSummary } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useRunAction, useUpdateEmployee, type RunAction } from '../../app/queries';
import { download } from '../../lib/api';
import { ApprovalModal } from './ApprovalModal';

const VISIBLE_EXCEPTIONS = 6;

/** Exceptions to resolve, plus the next action in the run's lifecycle for this role. */
export function AttentionPanel({ run, exceptions }: { run: RunSummary; exceptions: RunException[] }) {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const action = useRunAction(run.id);
  const updateEmployee = useUpdateEmployee();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const canPrepare = can(user.role, 'runs.prepare');

  async function perform(name: RunAction, success: string, body?: unknown) {
    try {
      await action.mutateAsync({ action: name, body });
      notify(success);
    } catch (error) {
      fail(error);
    }
  }
  async function verifyBank(employeeId: string) {
    try {
      await updateEmployee.mutateAsync({ id: employeeId, changes: { bankReady: true, bankAccountLast4: '1234' } });
      notify('Synthetic bank verification added. Recalculate to refresh exceptions.');
    } catch (error) {
      fail(error);
    }
  }
  async function exportBank() {
    try {
      await download(`/runs/${run.id}/export/bank-demo`);
      notify('Fictional demo bank file downloaded.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <aside className="panel attention-panel">
      <div className="attention-heading">
        <div>
          <h2>Needs attention</h2>
          <p>Resolve blocking items before approval.</p>
        </div>
        <span className="attention-count">{run.blocking + run.warnings}</span>
      </div>
      <div className="attention-metrics">
        <span>
          <CircleAlert size={16} /> {run.blocking} blocking
        </span>
        <span>
          <AlertCircle size={16} /> {run.warnings} warnings
        </span>
      </div>
      <div className="exception-list">
        {exceptions.slice(0, VISIBLE_EXCEPTIONS).map((exception, index) => (
          <div
            className={`exception-item ${exception.severity}`}
            key={`${exception.employeeId}-${exception.code}-${index}`}
          >
            <div className="exception-symbol">
              {exception.severity === 'blocking' ? <CircleAlert size={18} /> : <AlertCircle size={18} />}
            </div>
            <div>
              <strong>{exception.name}</strong>
              <span>{exception.message}</span>
              <small>
                {exception.employeeId} · {exception.code}
              </small>
              {exception.code === 'BANK_MISSING' && can(user.role, 'employees.write') && (
                <button
                  className="text-button"
                  disabled={updateEmployee.isPending && updateEmployee.variables?.id === exception.employeeId}
                  onClick={() => verifyBank(exception.employeeId)}
                >
                  Verify demo bank details <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {!exceptions.length && (
          <div className="clear-box">
            <CheckCircle2 size={22} />
            <strong>
              {run.calculatedEmployees ? 'No exceptions in this run' : 'Calculate to identify exceptions'}
            </strong>
          </div>
        )}
      </div>
      {exceptions.length > VISIBLE_EXCEPTIONS && (
        <p className="more-exceptions">
          Showing the first {VISIBLE_EXCEPTIONS} of {exceptions.length} exceptions
        </p>
      )}
      <div className="attention-actions">
        {run.status === 'calculated' && canPrepare && (
          <button
            className="button primary full"
            disabled={action.isPending || run.blocking > 0}
            onClick={() => perform('submit', 'Payroll submitted to Finance for approval.')}
          >
            <Send size={16} /> Send for approval
          </button>
        )}
        {run.status === 'approval_pending' && can(user.role, 'runs.approve') && (
          <button className="button primary full" disabled={action.isPending} onClick={() => setApprovalOpen(true)}>
            <BadgeCheck size={17} /> Approve payroll
          </button>
        )}
        {run.status === 'approved' && (
          <>
            <button className="button primary full" onClick={exportBank}>
              <ArrowDownToLine size={17} /> Export demo bank file
            </button>
            {can(user.role, 'runs.reconcile') && (
              <button
                className="button outline full"
                onClick={() => perform('reconcile-demo', 'Synthetic payment reconciliation recorded.')}
              >
                Simulate reconciliation
              </button>
            )}
          </>
        )}
        {run.status === 'reconciled' && (
          <div className="approved-box">
            <CheckCircle2 size={19} /> Demo payroll reconciled
          </div>
        )}
        {run.status === 'draft' && (
          <div className="info-strip">
            <Info size={17} /> Inputs can be changed until calculation.
          </div>
        )}
        <div className="source-note">
          <LockKeyhole size={18} />
          <div>
            <strong>Source of calculation</strong>
            <span>Rule version, component amounts and exceptions appear in employee details.</span>
          </div>
        </div>
      </div>
      {approvalOpen && (
        <ApprovalModal
          run={run}
          onClose={() => setApprovalOpen(false)}
          onConfirm={async note => {
            setApprovalOpen(false);
            await perform('approve', 'Payroll approved by Finance.', { note });
          }}
        />
      )}
    </aside>
  );
}

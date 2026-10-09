import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowRight,
  Banknote,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
} from 'lucide-react';
import { APPROVED_STATUSES, can, type PayrollLine } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useCurrentRun, useExceptions, useRunAction, useRunLines } from '../../app/queries';
import { EmptyState, Heading, Pagination, Pill, StatCard, Stepper } from '../../components';
import { count, money, statusLabel } from '../../lib/format';
import { periodLabel, periodRange } from '../../lib/period';
import { AttentionPanel } from './AttentionPanel';
import { AuditDrawer } from './AuditDrawer';
import { CalculationDrawer } from './CalculationDrawer';
import { ImportDialog } from './ImportDialog';

const STAGES: Array<[string, string]> = [
  ['Inputs', 'Import & validate'],
  ['Review', 'Calculate & resolve'],
  ['Approval', 'Finance sign-off'],
  ['Disbursement', 'Export & reconcile'],
];
const STAGE_BY_STATUS: Record<string, number> = { draft: 0, calculated: 1, approval_pending: 2 };

export function PayrollPage() {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? 1);
  const exceptionOnly = params.get('exceptions') === '1';
  const updateParams = (changes: Record<string, string | null>) =>
    setParams(
      current => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  const { summary: run, runId } = useCurrentRun();
  const calculated = Boolean(run?.calculatedEmployees);
  const lines = useRunLines(runId, { page, search, exceptionOnly }, calculated);
  const exceptions = useExceptions(runId, calculated);
  const action = useRunAction(runId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const status = run?.status ?? 'draft';
  const canPrepare = can(user.role, 'runs.prepare');
  const selected = lines.data?.items.find(line => line.employeeId === selectedId) ?? null;

  async function calculate() {
    try {
      await action.mutateAsync({ action: 'calculate' });
      notify('Payroll calculated. Review all exceptions.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <>
      <Heading
        eyebrow="PAYROLL / RUNS"
        title={run ? `${periodLabel(run.year, run.month)} payroll` : 'Payroll run'}
        description={run ? `${periodRange(run.year, run.month, run.paymentDate)} · All India` : undefined}
        action={
          <div className="header-buttons">
            <Pill tone={APPROVED_STATUSES.includes(status) ? 'success' : status === 'draft' ? 'neutral' : 'info'}>
              {statusLabel(status)}
            </Pill>
            <button className="button outline" onClick={() => setAuditOpen(true)}>
              <History size={16} /> Audit trail
            </button>
          </div>
        }
      />
      <Stepper steps={STAGES} current={STAGE_BY_STATUS[status] ?? 3} />
      <div className="stats-grid">
        <StatCard
          label="Employees"
          value={run ? count(run.totalEmployees) : '—'}
          icon={Users}
          foot={`${count(run?.calculatedEmployees)} calculated`}
        />
        <StatCard label="Gross pay" value={run?.gross ?? 0} icon={Wallet} tone="mint" foot="Before deductions" />
        <StatCard
          label="Deductions"
          value={run?.deductions ?? 0}
          icon={ShieldCheck}
          tone="rose"
          foot="Tax & contributions"
        />
        <StatCard label="Net pay" value={run?.net ?? 0} icon={Banknote} tone="violet" foot="Pending settlement" />
      </div>
      <div className="payroll-layout">
        <section className="panel payroll-main">
          <div className="panel-title">
            <div>
              <h2>Employee calculations</h2>
              <p>Review each payslip and the source of every deduction.</p>
            </div>
            {canPrepare && (
              <div className="table-actions">
                <button className="button subtle" onClick={() => setImportOpen(true)} disabled={status !== 'draft'}>
                  <FileSpreadsheet size={16} /> Import inputs
                </button>
                <button
                  className="button subtle"
                  onClick={calculate}
                  disabled={action.isPending || !['draft', 'calculated'].includes(status)}
                >
                  <SlidersHorizontal size={16} />
                  {action.isPending ? 'Calculating…' : 'Calculate'}
                </button>
              </div>
            )}
          </div>
          {calculated ? (
            <>
              <div className="filter-row">
                <div className="table-search">
                  <Search size={17} />
                  <input
                    placeholder="Search name, ID or branch"
                    value={search}
                    onChange={event => updateParams({ search: event.target.value || null, page: null })}
                  />
                </div>
                <button
                  className={`filter-chip ${exceptionOnly ? 'selected' : ''}`}
                  onClick={() => updateParams({ exceptions: exceptionOnly ? null : '1', page: null })}
                >
                  <CircleAlert size={16} /> Exceptions only
                </button>
                <span className="result-count">{count(lines.data?.total)} results</span>
              </div>
              <LinesTable lines={lines.data?.items ?? []} onSelect={setSelectedId} />
              {lines.data && (
                <Pagination
                  page={page}
                  size={lines.data.size}
                  total={lines.data.total}
                  onPage={next => updateParams({ page: String(next) })}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="No calculations yet"
              action={
                canPrepare && (
                  <button className="button primary" disabled={action.isPending} onClick={calculate}>
                    Calculate demo payroll <ArrowRight size={16} />
                  </button>
                )
              }
            >
              {canPrepare
                ? 'Import any variable pay, then calculate this month’s payroll to see employee-level results.'
                : 'Calculations will appear after the payroll team prepares this run.'}
            </EmptyState>
          )}
        </section>
        {run && <AttentionPanel run={run} exceptions={exceptions.data ?? []} />}
      </div>

      {selected && run && (
        <CalculationDrawer
          line={selected}
          period={periodLabel(run.year, run.month)}
          onClose={() => setSelectedId(null)}
        />
      )}
      {importOpen && <ImportDialog runId={runId} onClose={() => setImportOpen(false)} />}
      {auditOpen && <AuditDrawer runId={runId} onClose={() => setAuditOpen(false)} />}
    </>
  );
}

function LinesTable({ lines, onSelect }: { lines: PayrollLine[]; onSelect: (employeeId: string) => void }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Branch / State</th>
            <th>Gross pay</th>
            <th>Deductions</th>
            <th>Net pay</th>
            <th>Check</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => (
            <tr key={line.employeeId} onClick={() => onSelect(line.employeeId)}>
              <td>
                <strong>{line.employeeName}</strong>
                <small>{line.employeeId}</small>
              </td>
              <td>
                {line.branch}
                <small>{line.state}</small>
              </td>
              <td className="numeric">{money(line.gross)}</td>
              <td className="numeric">{money(line.deductions)}</td>
              <td className="numeric net-cell">{money(line.net)}</td>
              <td>
                {line.flags.some(flag => flag.severity === 'blocking') ? (
                  <Pill tone="danger">Blocking</Pill>
                ) : line.flags.length ? (
                  <Pill tone="warning">Review</Pill>
                ) : (
                  <Pill tone="success">Clear</Pill>
                )}
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`View calculation for ${line.employeeName}`}
                  onClick={() => onSelect(line.employeeId)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

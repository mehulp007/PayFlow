import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Landmark,
  MapPinned,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { APPROVED_STATUSES, can } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useCurrentRun, useRunAction } from '../../app/queries';
import { Heading, PanelTitle, Pill, StatCard } from '../../components';
import { count } from '../../lib/format';
import { periodLabel, taxYearLabel } from '../../lib/period';

/** The chart library loads only when a chart is shown. */
const CostTrend = lazy(() => import('./CostTrend'));

export function OverviewPage() {
  const user = useUser();
  const navigate = useNavigate();
  const { notify, fail } = useFeedback();
  const { summary: run, runId, isSuccess, data } = useCurrentRun();
  const branchCount = data?.organization.branches.length ?? 0;
  const action = useRunAction(runId);
  const calculated = Boolean(run?.calculatedEmployees);
  const period = run ? periodLabel(run.year, run.month) : '';
  const openRun = () => navigate(runId ? `/payroll/${runId}` : '/payroll');

  async function calculate() {
    try {
      await action.mutateAsync({ action: 'calculate' });
      notify('Payroll calculated. Review the exceptions.');
    } catch (error) {
      fail(error);
    }
  }

  const checklist: Array<[title: string, detail: string, done: boolean]> = [
    ['Inputs accepted for calculation', 'Attendance, variable pay and deductions', calculated],
    ['Calculate and review', 'Inspect pay, tax and statutory lines', calculated],
    ['Clear blocking exceptions', 'Fix employee records, then recalculate', calculated && run?.blocking === 0],
    [
      'Finance approval',
      'A separate approver confirms final totals',
      APPROVED_STATUSES.includes(run?.status ?? 'draft'),
    ],
    [
      'Export and reconcile',
      'Prepare demo bank file and mark settlement',
      ['paid', 'closed'].includes(run?.status ?? ''),
    ],
  ];

  if (isSuccess && !runId) return <GettingStarted />;

  return (
    <>
      <Heading
        eyebrow={`OVERVIEW / TAX YEAR ${run ? taxYearLabel(run.year, run.month) : ''}`}
        title="Good morning, payroll team"
        description={`Here is what needs your attention before the ${period.split(' ')[0]} payroll closes.`}
        action={
          <button className="button primary" onClick={openRun}>
            Open payroll run <ArrowRight size={17} />
          </button>
        }
      />
      <div className="overview-banner">
        <div>
          <span className="banner-kicker">{period.toUpperCase()} PAYROLL</span>
          <h2>{calculated ? 'Review the run before approval' : 'Ready to prepare your payroll'}</h2>
          <p>
            {calculated
              ? `${run?.blocking} blocking exceptions and ${run?.warnings} warnings need a closer look.`
              : 'Import any variable inputs, calculate pay, and review every exception before approval.'}
          </p>
          <div className="banner-actions">
            <button className="button white" onClick={openRun}>
              Review pay run <ArrowRight size={16} />
            </button>
            {!calculated && can(user.role, 'runs.prepare') && (
              <button className="button ghost-white" disabled={action.isPending} onClick={calculate}>
                {action.isPending ? 'Calculating…' : 'Calculate demo payroll'}
              </button>
            )}
          </div>
        </div>
        <div className="banner-graphic">
          <div className="graphic-ring">
            <Wallet size={54} />
          </div>
          <div className="graphic-pill">
            {run ? count(run.totalEmployees) : '—'} <span>in payroll</span>
          </div>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Employees in scope"
          value={run ? count(run.totalEmployees) : '—'}
          icon={Users}
          foot={`Across ${branchCount} ${branchCount === 1 ? 'branch' : 'branches'}`}
        />
        <StatCard
          label="Gross pay"
          value={run?.gross ?? 0}
          icon={Wallet}
          tone="mint"
          foot={calculated ? 'Current pay run' : 'After calculation'}
        />
        <StatCard
          label="Total deductions"
          value={run?.deductions ?? 0}
          icon={ShieldCheck}
          tone="rose"
          foot="Tax and statutory"
        />
        <StatCard label="Net pay" value={run?.net ?? 0} icon={Landmark} tone="violet" foot="Before bank export" />
      </div>
      {can(user.role, 'runs.read') && (
        <Suspense fallback={null}>
          <CostTrend />
        </Suspense>
      )}
      <div className="two-column">
        <section className="panel">
          <PanelTitle title="Payroll checklist" description="One clear path from inputs to reconciliation" />
          <div className="checklist">
            {checklist.map(([title, detail, done], index) => (
              <button className="checklist-row" key={title} onClick={openRun}>
                <span className={`check-step ${done ? 'done' : ''}`}>
                  {done ? <CheckCircle2 size={19} /> : index + 1}
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle
            title="Compliance watch"
            description="Statutory work stays visible alongside pay"
            action={
              <button className="text-button" onClick={() => navigate('/compliance')}>
                View all <ArrowRight size={15} />
              </button>
            }
          />
          <div className="watch-list">
            <div>
              <span className="watch-icon amber">
                <CalendarClock size={19} />
              </span>
              <span>
                <strong>{period.split(' ')[0]} contributions</strong>
                <small>EPF and ESI preparation after payroll approval</small>
              </span>
              <Pill tone="warning">Upcoming</Pill>
            </div>
            <div>
              <span className="watch-icon blue">
                <FileCheck2 size={19} />
              </span>
              <span>
                <strong>Form 138 · quarterly TDS</strong>
                <small>Quarterly salary TDS preparation</small>
              </span>
              <Pill tone="info">Prepare</Pill>
            </div>
            <div>
              <span className="watch-icon mint">
                <MapPinned size={19} />
              </span>
              <span>
                <strong>State deductions</strong>
                <small>Professional tax and welfare schedules</small>
              </span>
              <Pill tone="neutral">Review</Pill>
            </div>
          </div>
          <div className="info-strip">
            <AlertCircle size={18} /> State rules cover Karnataka, Maharashtra, Tamil Nadu, West Bengal and Haryana
            (reviewed October 2026). Verify against state notifications before live use.
          </div>
        </section>
      </div>
    </>
  );
}

/** A new organization without pay runs: the next steps to its first payroll. */
function GettingStarted() {
  const navigate = useNavigate();
  const steps: Array<[title: string, detail: string, to: string]> = [
    [
      'Check branches and pay groups',
      'Branches decide the state rules for professional tax and welfare fund',
      '/settings',
    ],
    ['Add your people', 'Start with the most senior person; everyone else reports up to them', '/hierarchy'],
    [
      'Invite your team',
      'HR, payroll, finance, auditors and employees each get their own sign-in',
      '/settings?tab=access',
    ],
    ['Open your first pay period', 'Everyone employed in the month is included automatically', '/payroll'],
  ];
  return (
    <>
      <Heading
        eyebrow="OVERVIEW / GETTING STARTED"
        title="Welcome to PayFlow"
        description="Four steps to your first payroll run."
      />
      <div className="overview-banner">
        <div>
          <span className="banner-kicker">NEW ORGANIZATION</span>
          <h2>Set up people, then open a pay period</h2>
          <p>
            Calculations follow the October 2026 rule pack: income tax, Labour Codes wages, EPF, ESI and state
            deductions.
          </p>
          <div className="banner-actions">
            <button className="button white" onClick={() => navigate('/hierarchy')}>
              Add people <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="banner-graphic">
          <div className="graphic-ring">
            <Wallet size={54} />
          </div>
        </div>
      </div>
      <section className="panel">
        <PanelTitle title="Getting started" description="Each step opens the page where it is done" />
        <div className="checklist">
          {steps.map(([title, detail, to], index) => (
            <button className="checklist-row" key={title} onClick={() => navigate(to)}>
              <span className="check-step">{index + 1}</span>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

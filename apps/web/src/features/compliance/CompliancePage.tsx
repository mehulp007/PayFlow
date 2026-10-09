import { BookOpenCheck, LockKeyhole, MapPinned, ShieldCheck, Users } from 'lucide-react';
import { APPROVED_STATUSES } from '@payflow/shared';
import { useCurrentRun } from '../../app/queries';
import { Heading, PanelTitle, Pill } from '../../components';
import { statusLabel } from '../../lib/format';
import { filingCalendar, taxYearLabel } from '../../lib/period';

const AREAS = [
  {
    icon: BookOpenCheck,
    title: 'Income tax',
    text: 'Old/new regime slabs, ₹75,000 standard deduction, ₹60,000 rebate with marginal relief, surcharge, cess and monthly TDS from a year-to-date projection.',
    tag: 'Form 138 preparation',
  },
  {
    icon: Users,
    title: 'EPF, EPS & EDLI',
    text: 'Wages per the Code on Wages (50% rule). Ceiling ₹25,000 from 17 Sep 2026 (S.O. 5109(E)); September split by days. EPS stops at 58.',
    tag: 'ECR preparation',
  },
  {
    icon: ShieldCheck,
    title: 'ESI',
    text: '0.75% + 3.25% under the ₹21,000 ceiling; coverage continues to the end of the contribution period; ₹176/day exemption.',
    tag: 'Contribution preparation',
  },
  {
    icon: MapPinned,
    title: 'State rules',
    text: 'Professional tax and labour welfare fund slabs, deduction months and caps for each supported state.',
    tag: 'Reviewed Oct 2026',
  },
];

export function CompliancePage() {
  const { summary: run } = useCurrentRun();
  const calendar = run ? filingCalendar(run.year, run.month) : [];
  return (
    <>
      <Heading
        eyebrow="TAXES & COMPLIANCE"
        title="Statutory workspace"
        description="Rule versions, filing preparation, and due dates in one place."
      />
      <div className="compliance-hero">
        <ShieldCheck size={31} />
        <div>
          <strong>Tax Year {run ? taxYearLabel(run.year, run.month) : ''}</strong>
          <span>
            Income-tax Act, 2025 · salary TDS section 392 · new regime default · Labour Codes in force from 21 Nov 2025
          </span>
        </div>
        <Pill tone="info">Rule pack v2 · Oct 2026</Pill>
      </div>
      <div className="compliance-grid">
        {AREAS.map(item => (
          <section className="panel compliance-card" key={item.title}>
            <div className="compliance-icon">
              <item.icon size={22} />
            </div>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <Pill tone="neutral">{item.tag}</Pill>
          </section>
        ))}
      </div>
      <div className="two-column">
        <section className="panel">
          <PanelTitle
            title="Filing calendar"
            description="Dates are reminders; confirm each current portal deadline before filing"
          />
          {calendar.map(item => (
            <div className="calendar-row" key={item.title}>
              <span>
                {item.month} <strong>{item.day}</strong>
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <Pill tone="warning">Review date</Pill>
            </div>
          ))}
        </section>
        <section className="panel">
          <PanelTitle title="Run control" description="Current status and outstanding work" />
          <div className="control-metric">
            <span>Current run</span>
            <Pill tone={run && APPROVED_STATUSES.includes(run.status) ? 'success' : 'info'}>
              {run ? statusLabel(run.status) : 'Loading'}
            </Pill>
          </div>
          <div className="control-metric">
            <span>Blocking exceptions</span>
            <strong>{run?.blocking ?? 0}</strong>
          </div>
          <div className="control-metric">
            <span>Rule version</span>
            <strong>IN-TY2026-27-v2</strong>
          </div>
          <div className="info-strip">
            <LockKeyhole size={17} /> Production filing formats and state rates require payroll-specialist sign-off.
          </div>
        </section>
      </div>
    </>
  );
}

import {
  AlertCircle,
  Banknote,
  Download,
  FileCheck2,
  FileSpreadsheet,
  MapPinned,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReportKind } from '@payflow/shared';
import { useFeedback } from '../../app/FeedbackProvider';
import { useCurrentRun } from '../../app/queries';
import { Heading } from '../../components';
import { download } from '../../lib/api';

const REPORTS: Array<{ kind: ReportKind; title: string; description: string; icon: LucideIcon }> = [
  {
    kind: 'salary-register',
    title: 'Salary register',
    description: 'Gross, deductions, net pay and employer cost by employee',
    icon: FileSpreadsheet,
  },
  {
    kind: 'bank-demo',
    title: 'Demo bank file',
    description: 'Fictional account references; approval required',
    icon: Banknote,
  },
  {
    kind: 'epf-prep',
    title: 'EPF preparation',
    description: 'ECR-style EPF, EPS and EDLI wages and shares',
    icon: Users,
  },
  { kind: 'esi-prep', title: 'ESI preparation', description: 'Employee and employer contributions', icon: ShieldCheck },
  { kind: 'form138-prep', title: 'Form 138 preparation', description: 'Salary and TDS source data', icon: FileCheck2 },
  {
    kind: 'state-deductions',
    title: 'State deductions',
    description: 'Professional tax and labour welfare by state',
    icon: MapPinned,
  },
];

export function ReportsPage() {
  const { notify, fail } = useFeedback();
  const { summary: run } = useCurrentRun();

  async function exportReport(kind: ReportKind) {
    try {
      await download(`/runs/${run?.id}/export/${kind}`);
      notify('Report downloaded.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <>
      <Heading
        eyebrow="REPORTS & EXPORTS"
        title="Payroll reports"
        description="Download calculation outputs for review and reconciliation."
      />
      <div className="notice">
        <AlertCircle size={19} />
        <span>
          These are demonstration preparation reports. They are not government-portal upload files or a bank-ready
          payment instruction.
        </span>
      </div>
      <div className="report-grid">
        {REPORTS.map(report => (
          <section className="panel report-card" key={report.kind}>
            <div className="report-icon">
              <report.icon size={23} />
            </div>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <button
              className="button outline"
              disabled={!run?.calculatedEmployees}
              onClick={() => exportReport(report.kind)}
            >
              <Download size={16} /> Download CSV
            </button>
          </section>
        ))}
      </div>
    </>
  );
}

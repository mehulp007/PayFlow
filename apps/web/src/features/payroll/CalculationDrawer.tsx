import type { PayrollLine } from '@payflow/shared';
import { DetailRow, Drawer, Pill } from '../../components';
import { money } from '../../lib/format';

/** Explains one employee's calculation: earnings, deductions, employer cost and the rules applied. */
export function CalculationDrawer({
  line,
  period,
  onClose,
}: {
  line: PayrollLine;
  period: string;
  onClose: () => void;
}) {
  const earnings: Array<[string, number]> = [
    ['Basic pay', line.basic],
    ['House rent allowance', line.hra],
    ['Special allowance', line.special],
    ['Variable pay', line.variablePay],
  ];
  const deductions: Array<[string, number]> = [
    ['Provident fund', line.pfEmployee],
    ['Employee ESI', line.esiEmployee],
    ['Professional tax', line.professionalTax],
    ['Labour welfare', line.labourWelfareFund],
    ['Income tax (TDS)', line.incomeTax],
    ['Other', line.otherDeduction],
  ];
  return (
    <Drawer
      eyebrow="EMPLOYEE CALCULATION"
      title={line.employeeName}
      subtitle={`${line.employeeId} · ${line.branch}, ${line.state}`}
      onClose={onClose}
    >
      <div className="drawer-body">
        <div className="net-highlight">
          <span>Net pay</span>
          <strong>{money(line.net)}</strong>
          <small>{period}</small>
        </div>
        <h3>Earnings</h3>
        {earnings.map(([label, value]) => (
          <DetailRow key={label} label={label} value={money(value)} />
        ))}
        <DetailRow total label="Gross pay" value={money(line.gross)} />
        <h3>Deductions</h3>
        {deductions.map(([label, value]) => (
          <DetailRow key={label} label={label} value={money(value)} />
        ))}
        <DetailRow total label="Total deductions" value={money(line.deductions)} />
        <div className="calculation-meta">
          <strong>Calculation trace</strong>
          <span>Rule {line.ruleVersion}</span>
          <span>
            Statutory wages {money(line.statutoryWages)} · PF wages {money(line.pfWages)} · EPS wages{' '}
            {money(line.epsWages)}
          </span>
          <span>Projected annual income tax {money(line.annualProjectedTax)}</span>
          <span>
            Employer PF {money(line.pfEmployer)} · EPS {money(line.epsEmployer)} · EDLI {money(line.edliEmployer)} ·
            Admin {money(line.epfAdminCharges)}
          </span>
          <span>
            Employer ESI {money(line.esiEmployer)} · Employer LWF {money(line.labourWelfareFundEmployer)}
          </span>
          <span>Total employer cost {money(line.employerCost)}</span>
          {line.ruleNotes.map(note => (
            <span key={note}>{note}</span>
          ))}
        </div>
        {line.flags.length > 0 && (
          <div className="detail-flags">
            <h3>Exceptions</h3>
            {line.flags.map(flag => (
              <div key={flag.code}>
                <Pill tone={flag.severity === 'blocking' ? 'danger' : 'warning'}>{flag.severity}</Pill> {flag.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

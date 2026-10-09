import type { RegimeResult, TaxSummary } from '@payflow/shared';
import { DetailRow, Pill } from '../../components';
import { money } from '../../lib/format';

const TITLES = { new: 'New regime', old: 'Old regime' } as const;
const SUBTITLES = {
  new: 'Default (s. 202): lower slab rates, ₹75,000 standard deduction',
  old: 'Higher rates, with HRA, s. 123 savings and other declared deductions',
} as const;

function RegimeCard({ result, summary }: { result: RegimeResult; summary: TaxSummary }) {
  const { comparison, regime } = summary;
  const recommended = comparison.recommended === result.regime && comparison.saving > 0;
  return (
    <div className={`regime-card ${recommended ? 'recommended' : ''}`}>
      <div className="regime-card-head">
        <div>
          <strong>{TITLES[result.regime]}</strong>
          <small>{SUBTITLES[result.regime]}</small>
        </div>
        <div className="regime-pills">
          {regime === result.regime && <Pill tone="info">Current</Pill>}
          {recommended && <Pill tone="success">Saves {money(comparison.saving)}</Pill>}
        </div>
      </div>
      <DetailRow label="Projected salary" value={money(comparison.projectedGross)} />
      <DetailRow label="Standard deduction" value={`− ${money(result.standardDeduction)}`} />
      <DetailRow
        label="Other deductions"
        value={result.regime === 'new' ? 'Not allowed' : `− ${money(result.deductions.total)}`}
      />
      <DetailRow label="Taxable income" value={money(result.taxableIncome)} />
      <DetailRow label="Tax after rebate" value={money(result.slabTax - result.rebate)} />
      <DetailRow label="Surcharge and 4% cess" value={money(result.surcharge + result.cess)} />
      <DetailRow total label="Tax for the year" value={money(result.total)} />
      <DetailRow label="TDS this month" value={money(result.monthlyTds)} />
    </div>
  );
}

/** Side-by-side projection of the tax year under both regimes, with the old regime's deductions. */
export function RegimeComparison({ summary }: { summary: TaxSummary }) {
  const deductions = summary.comparison.old.deductions.lines;
  return (
    <>
      <div className="regime-compare">
        <RegimeCard result={summary.comparison.new} summary={summary} />
        <RegimeCard result={summary.comparison.old} summary={summary} />
      </div>
      {deductions.length > 0 && (
        <div className="table-scroll deduction-table">
          <table>
            <thead>
              <tr>
                <th>Old-regime deduction</th>
                <th>Claimed</th>
                <th>Allowed</th>
              </tr>
            </thead>
            <tbody>
              {deductions.map(line => (
                <tr key={line.code}>
                  <td>
                    <strong>{line.label}</strong>
                    <small>{line.note}</small>
                  </td>
                  <td className="numeric">{money(line.claimed)}</td>
                  <td className="numeric net-cell">{money(line.allowed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

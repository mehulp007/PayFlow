import { useEffect } from 'react';
import { Download, Wallet } from 'lucide-react';
import { useBootstrap, usePayslip } from '../../app/queries';
import { useFeedback } from '../../app/FeedbackProvider';
import { DetailRow, Modal } from '../../components';
import { download } from '../../lib/api';
import { money } from '../../lib/format';

/** A printable payslip. The print stylesheet hides everything except this modal. */
export function PayslipModal({
  runId,
  employeeId,
  onClose,
}: {
  runId: string | undefined;
  employeeId: string;
  onClose: () => void;
}) {
  const { fail, notify } = useFeedback();
  const payslip = usePayslip(runId, employeeId);
  const organization = useBootstrap().data?.organization;

  useEffect(() => {
    if (payslip.error) {
      fail(payslip.error);
      onClose();
    }
  }, [payslip.error, fail, onClose]);
  if (!payslip.data) return null;

  const { line, period } = payslip.data;
  const [year, month] = period.split('-').map(Number);
  const periodName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const earnings: Array<[string, number]> = [
    ['Basic', line.basic],
    ['HRA', line.hra],
    ['Special', line.special],
    ['Variable', line.variablePay],
  ];
  const deductions: Array<[string, number]> = [
    ['PF', line.pfEmployee],
    ['ESI', line.esiEmployee],
    ['Professional tax', line.professionalTax],
    ['Labour welfare', line.labourWelfareFund],
    ['Income tax', line.incomeTax],
    ['Other', line.otherDeduction],
  ];

  return (
    <Modal onClose={onClose} className="payslip-modal" label="Payslip">
      <div className="payslip-header">
        <div>
          <span>{(organization?.name ?? 'Aster Group').toUpperCase()}</span>
          <h2>Payslip · {periodName}</h2>
          <small>Synthetic demonstration document</small>
        </div>
        <Wallet size={31} />
      </div>
      <div className="payslip-net">
        <span>Net pay</span>
        <strong>{money(line.net)}</strong>
        <small>
          {line.employeeName} · {line.employeeId}
        </small>
      </div>
      <div className="payslip-columns">
        <div>
          <h3>Earnings</h3>
          {earnings.map(([label, value]) => (
            <DetailRow key={label} label={label} value={money(value)} />
          ))}
          <DetailRow total label="Gross" value={money(line.gross)} />
        </div>
        <div>
          <h3>Deductions</h3>
          {deductions.map(([label, value]) => (
            <DetailRow key={label} label={label} value={money(value)} />
          ))}
          <DetailRow total label="Total" value={money(line.deductions)} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="button outline" onClick={onClose}>
          Close
        </button>
        <button className="button outline" onClick={() => window.print()}>
          Print
        </button>
        <button
          className="button primary"
          onClick={() =>
            download(`/runs/${runId}/payslip/${employeeId}/pdf`)
              .then(() => notify('Payslip PDF downloaded.'))
              .catch(fail)
          }
        >
          <Download size={16} /> Download PDF
        </button>
      </div>
    </Modal>
  );
}

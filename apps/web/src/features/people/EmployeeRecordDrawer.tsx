import { useState } from 'react';
import { ArrowRight, CircleUserRound, FileText, Landmark, MapPin } from 'lucide-react';
import { can, type Employee, type TaxRegime } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useCurrentRun, useEmployee, useUpdateEmployee } from '../../app/queries';
import { DetailRow, Drawer, Pill } from '../../components';
import { money } from '../../lib/format';
import { PayslipModal } from '../payslips/PayslipModal';

/** Monthly pay, statutory setup and the editable tax/bank fields for one employee. */
export function EmployeeRecordDrawer({
  employeeId,
  fallback,
  onClose,
}: {
  employeeId: string;
  fallback: Employee;
  onClose: () => void;
}) {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const { runId } = useCurrentRun();
  const employee = useEmployee(employeeId).data ?? fallback;
  const update = useUpdateEmployee();
  const [taxRegime, setTaxRegime] = useState<TaxRegime>(fallback.taxRegime);
  const [bankLast4, setBankLast4] = useState(fallback.bankAccountLast4 ?? '');
  const [payslipOpen, setPayslipOpen] = useState(false);
  const canEdit = can(user.role, 'employees.write');

  async function save() {
    try {
      await update.mutateAsync({
        id: employee.id,
        changes: {
          taxRegime,
          ...(bankLast4 ? { bankAccountLast4: bankLast4, bankReady: /^\d{4}$/.test(bankLast4) } : {}),
        },
      });
      notify('Employee record saved. Recalculate the run to apply changes.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <>
      <Drawer
        eyebrow="EMPLOYEE RECORD"
        title={employee.name}
        subtitle={`${employee.id} · ${employee.payGroup}`}
        onClose={onClose}
      >
        <div className="drawer-body">
          <div className="employee-summary">
            <span className="large-avatar">
              <CircleUserRound size={36} />
            </span>
            <div>
              <strong>{employee.name}</strong>
              <span>
                <MapPin size={14} /> {employee.branch}, {employee.state}
              </span>
            </div>
          </div>
          <h3>Monthly salary</h3>
          <DetailRow label="Basic pay" value={money(employee.monthlyBasic)} />
          <DetailRow label="House rent allowance" value={money(employee.monthlyHra)} />
          <DetailRow label="Special allowance" value={money(employee.monthlySpecial)} />
          <DetailRow
            total
            label="Regular gross"
            value={money(employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial)}
          />
          <h3>Statutory setup</h3>
          <DetailRow label="EPF membership" value={employee.pfMember ? 'Yes' : 'No'} />
          <DetailRow label="EPS membership" value={employee.epsMember ? 'Yes' : 'No'} />
          <DetailRow label="ESI membership" value={employee.esiMember ? 'Yes' : 'No'} />
          <DetailRow label="Professional tax & LWF" value={`${employee.state} rules`} />
          <h3>Tax & payment</h3>
          <label className="form-label">
            Tax regime
            <select
              value={taxRegime}
              onChange={event => setTaxRegime(event.target.value as TaxRegime)}
              disabled={!canEdit}
            >
              <option value="new">New (default)</option>
              <option value="old">Old</option>
            </select>
          </label>
          <label className="form-label">
            Bank account ending
            <input
              value={bankLast4}
              maxLength={4}
              placeholder="Last four digits"
              onChange={event => setBankLast4(event.target.value)}
              disabled={!canEdit}
            />
          </label>
          <div className="detail-row">
            <span>Bank status</span>
            <Pill tone={employee.bankReady ? 'success' : 'danger'}>{employee.bankReady ? 'Verified' : 'Missing'}</Pill>
          </div>
          <div className="drawer-actions">
            {canEdit && (
              <button className="button primary" disabled={update.isPending} onClick={save}>
                {update.isPending ? 'Saving…' : 'Save record'} <ArrowRight size={16} />
              </button>
            )}
            <button className="button outline" onClick={() => setPayslipOpen(true)}>
              <FileText size={16} /> View payslip
            </button>
          </div>
          <div className="info-strip">
            <Landmark size={17} /> This demo stores only fictional bank ending digits. Production bank verification and
            encryption are pending.
          </div>
        </div>
      </Drawer>
      {payslipOpen && <PayslipModal runId={runId} employeeId={employee.id} onClose={() => setPayslipOpen(false)} />}
    </>
  );
}

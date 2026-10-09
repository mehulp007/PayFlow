import { useState, type FormEvent } from 'react';
import { ArrowRight, CircleUserRound, FileText, Landmark, LogOut, MapPin, TrendingUp } from 'lucide-react';
import { can, type Employee, type TaxRegime, type UpdateEmployeeBody } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useBootstrap, useCurrentRun, useEmployee, useEmployeeMutations, useSalaryRevisions } from '../../app/queries';
import { DetailRow, Drawer, Pill } from '../../components';
import { money, titleCase } from '../../lib/format';
import { PayslipModal } from '../payslips/PayslipModal';

export type RecordTab = 'record' | 'salary' | 'exit';
const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const toRupees = (paise: number) => String(paise / 100);

/** One employee: record and statutory setup, effective-dated salary history, and exit. */
export function EmployeeRecordDrawer({
  employeeId,
  fallback,
  initialTab = 'record',
  onClose,
}: {
  employeeId: string;
  fallback: Employee;
  initialTab?: RecordTab;
  onClose: () => void;
}) {
  const user = useUser();
  const employee = useEmployee(employeeId).data ?? fallback;
  const [tab, setTab] = useState<RecordTab>(initialTab);
  const canEdit = can(user.role, 'employees.write');
  return (
    <Drawer
      eyebrow={employee.employmentStatus === 'exited' ? 'EMPLOYEE RECORD · LEFT' : 'EMPLOYEE RECORD'}
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
              <MapPin size={14} /> {employee.branch}, {employee.state} · {employee.jobTitle}
            </span>
          </div>
        </div>
        <div className="tab-bar drawer-tabs">
          <button className={tab === 'record' ? 'selected' : ''} onClick={() => setTab('record')}>
            Record
          </button>
          {employee.payrollScope && (
            <button className={tab === 'salary' ? 'selected' : ''} onClick={() => setTab('salary')}>
              Salary history
            </button>
          )}
          {canEdit && (
            <button className={tab === 'exit' ? 'selected' : ''} onClick={() => setTab('exit')}>
              Exit
            </button>
          )}
        </div>
        {tab === 'record' && <RecordTabView employee={employee} canEdit={canEdit} />}
        {tab === 'salary' && <SalaryTab employee={employee} canEdit={canEdit} />}
        {tab === 'exit' && <ExitTab employee={employee} />}
      </div>
    </Drawer>
  );
}

function RecordTabView({ employee, canEdit }: { employee: Employee; canEdit: boolean }) {
  const { notify, fail } = useFeedback();
  const { runId } = useCurrentRun();
  const organization = useBootstrap().data?.organization;
  const { update } = useEmployeeMutations();
  const [form, setForm] = useState({
    jobTitle: employee.jobTitle,
    department: employee.department,
    branchId: employee.branchId,
    payGroupId: employee.payGroupId,
    workEmail: employee.workEmail ?? '',
    phone: employee.phone ?? '',
    taxRegime: employee.taxRegime,
    bankLast4: employee.bankAccountLast4 ?? '',
    pfMember: employee.pfMember,
    esiMember: employee.esiMember,
  });
  const [payslipOpen, setPayslipOpen] = useState(false);
  const change = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const changes: UpdateEmployeeBody = {
      jobTitle: form.jobTitle,
      department: form.department,
      branchId: form.branchId,
      payGroupId: form.payGroupId,
      workEmail: form.workEmail || null,
      phone: form.phone || null,
      taxRegime: form.taxRegime,
      ...(employee.payrollScope ? { pfMember: form.pfMember, esiMember: form.esiMember } : {}),
      ...(form.bankLast4 ? { bankAccountLast4: form.bankLast4, bankReady: /^\d{4}$/.test(form.bankLast4) } : {}),
    };
    try {
      await update.mutateAsync({ id: employee.id, changes });
      notify('Employee record saved. Recalculate open runs to apply changes.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <form className="hierarchy-form" onSubmit={save}>
      <h3>Monthly salary</h3>
      <DetailRow label="Basic pay" value={money(employee.monthlyBasic)} />
      <DetailRow label="House rent allowance" value={money(employee.monthlyHra)} />
      <DetailRow label="Special allowance" value={money(employee.monthlySpecial)} />
      <DetailRow
        total
        label="Regular gross"
        value={money(employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial)}
      />
      <h3>Work details</h3>
      <div className="hierarchy-form-grid">
        <label>
          Job title
          <input
            value={form.jobTitle}
            disabled={!canEdit}
            onChange={event => change({ jobTitle: event.target.value })}
          />
        </label>
        <label>
          Department
          <input
            value={form.department}
            disabled={!canEdit}
            onChange={event => change({ department: event.target.value })}
          />
        </label>
      </div>
      <div className="hierarchy-form-grid">
        <label>
          Branch
          <select
            value={form.branchId}
            disabled={!canEdit}
            onChange={event => change({ branchId: event.target.value })}
          >
            {organization?.branches.map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name} · {branch.state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pay group
          <select
            value={form.payGroupId}
            disabled={!canEdit}
            onChange={event => change({ payGroupId: event.target.value })}
          >
            {organization?.payGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="hierarchy-form-grid">
        <label>
          Work email
          <input
            type="email"
            value={form.workEmail}
            disabled={!canEdit}
            onChange={event => change({ workEmail: event.target.value })}
          />
        </label>
        <label>
          Phone
          <input value={form.phone} disabled={!canEdit} onChange={event => change({ phone: event.target.value })} />
        </label>
      </div>
      <DetailRow
        label="Reports to"
        value={employee.managerName ? `${employee.managerName} · ${employee.managerId}` : 'Top position'}
      />
      <DetailRow label="Joined" value={employee.joinDate} />
      {employee.exitDate && <DetailRow label="Left" value={employee.exitDate} />}
      {employee.payrollScope && (
        <>
          <h3>Statutory setup</h3>
          <div className="hierarchy-checks">
            <label>
              <input
                type="checkbox"
                checked={form.pfMember}
                disabled={!canEdit}
                onChange={event => change({ pfMember: event.target.checked })}
              />{' '}
              EPF member
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.esiMember}
                disabled={!canEdit}
                onChange={event => change({ esiMember: event.target.checked })}
              />{' '}
              ESI member
            </label>
          </div>
          <DetailRow label="EPS membership" value={employee.epsMember ? 'Yes' : 'No'} />
          <DetailRow label="Professional tax & LWF" value={`${employee.state} rules`} />
          <h3>Tax & payment</h3>
          <div className="hierarchy-form-grid">
            <label>
              Tax regime
              <select
                value={form.taxRegime}
                disabled={!canEdit}
                onChange={event => change({ taxRegime: event.target.value as TaxRegime })}
              >
                <option value="new">New (default)</option>
                <option value="old">Old</option>
              </select>
            </label>
            <label>
              Bank account ending
              <input
                value={form.bankLast4}
                maxLength={4}
                placeholder="Last four digits"
                disabled={!canEdit}
                onChange={event => change({ bankLast4: event.target.value })}
              />
            </label>
          </div>
          <div className="detail-row">
            <span>Bank status</span>
            <Pill tone={employee.bankReady ? 'success' : 'danger'}>{employee.bankReady ? 'Verified' : 'Missing'}</Pill>
          </div>
        </>
      )}
      <div className="drawer-actions">
        {canEdit && (
          <button className="button primary" type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save record'} <ArrowRight size={16} />
          </button>
        )}
        {employee.payrollScope && (
          <button className="button outline" type="button" onClick={() => setPayslipOpen(true)}>
            <FileText size={16} /> View payslip
          </button>
        )}
      </div>
      <div className="info-strip">
        <Landmark size={17} /> This demo stores only fictional bank ending digits. Production bank verification and
        encryption are pending.
      </div>
      {payslipOpen && <PayslipModal runId={runId} employeeId={employee.id} onClose={() => setPayslipOpen(false)} />}
    </form>
  );
}

function SalaryTab({ employee, canEdit }: { employee: Employee; canEdit: boolean }) {
  const { notify } = useFeedback();
  const revisions = useSalaryRevisions(employee.id);
  const { revise } = useEmployeeMutations();
  const [form, setForm] = useState({
    month: '2026-11',
    basic: toRupees(employee.monthlyBasic),
    hra: toRupees(employee.monthlyHra),
    special: toRupees(employee.monthlySpecial),
    reason: '',
  });
  const change = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await revise.mutateAsync({
        id: employee.id,
        body: {
          effectiveFrom: `${form.month}-01`,
          monthlyBasic: toPaise(form.basic),
          monthlyHra: toPaise(form.hra),
          monthlySpecial: toPaise(form.special),
          reason: form.reason,
        },
      });
      notify(`Salary revised from ${form.month}.`);
    } catch {
      // Shown inline from the mutation state.
    }
  }

  return (
    <div className="hierarchy-form">
      <h3>Salary history</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Effective from</th>
              <th>Basic</th>
              <th>HRA</th>
              <th>Special</th>
              <th>Gross</th>
            </tr>
          </thead>
          <tbody>
            {revisions.data?.map(revision => (
              <tr key={revision.id}>
                <td>
                  <strong>{revision.effectiveFrom}</strong>
                  <small>{revision.reason ?? '—'}</small>
                </td>
                <td className="numeric">{money(revision.monthlyBasic)}</td>
                <td className="numeric">{money(revision.monthlyHra)}</td>
                <td className="numeric">{money(revision.monthlySpecial)}</td>
                <td className="numeric net-cell">
                  {money(revision.monthlyBasic + revision.monthlyHra + revision.monthlySpecial)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form onSubmit={save}>
          <h3>
            <TrendingUp size={15} /> Revise salary
          </h3>
          <div className="hierarchy-form-grid">
            <label>
              Effective from (month)
              <input
                type="month"
                required
                value={form.month}
                onChange={event => change({ month: event.target.value })}
              />
            </label>
            <label>
              Reason
              <input
                value={form.reason}
                onChange={event => change({ reason: event.target.value })}
                placeholder="e.g. Promotion"
              />
            </label>
          </div>
          <div className="hierarchy-form-grid">
            <label>
              Basic · INR/month
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={form.basic}
                onChange={event => change({ basic: event.target.value })}
              />
            </label>
            <label>
              HRA · INR/month
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.hra}
                onChange={event => change({ hra: event.target.value })}
              />
            </label>
          </div>
          <label>
            Special allowance · INR/month
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.special}
              onChange={event => change({ special: event.target.value })}
            />
          </label>
          {revise.error && <div className="message error">{revise.error.message}</div>}
          <div className="info-strip">
            Revisions start on the first day of a month, after the last month Finance approved. Arrears for earlier
            months are not modelled.
          </div>
          <div className="drawer-actions">
            <button className="button primary" type="submit" disabled={revise.isPending}>
              {revise.isPending ? 'Saving…' : 'Save revision'} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ExitTab({ employee }: { employee: Employee }) {
  const { notify } = useFeedback();
  const { exit } = useEmployeeMutations();
  const [exitDate, setExitDate] = useState('2026-10-31');
  const [reason, setReason] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(`Record ${employee.name}'s last working day as ${exitDate}?`)) return;
    try {
      await exit.mutateAsync({ id: employee.id, exitDate, reason });
      notify(`${employee.name} recorded as leaving on ${exitDate}.`);
    } catch {
      // Shown inline from the mutation state.
    }
  }

  if (employee.exitDate) {
    return (
      <div className="hierarchy-form">
        <h3>Exit</h3>
        <DetailRow label="Last working day" value={employee.exitDate} />
        <DetailRow label="Status" value={titleCase(employee.employmentStatus)} />
      </div>
    );
  }
  return (
    <form className="hierarchy-form" onSubmit={save}>
      <h3>
        <LogOut size={15} /> Record exit
      </h3>
      <label>
        Last working day
        <input type="date" required value={exitDate} onChange={event => setExitDate(event.target.value)} />
      </label>
      <label>
        Reason
        <input value={reason} onChange={event => setReason(event.target.value)} placeholder="e.g. Resigned" />
      </label>
      {exit.error && <div className="message error">{exit.error.message}</div>}
      <div className="info-strip">
        The exit month is pro-rated automatically in its run. Under the Code on Wages (s. 17(2)), wages due on exit,
        including on resignation, must be paid within two working days, so settle them separately from the monthly run.
      </div>
      <div className="drawer-actions">
        <button className="button primary" type="submit" disabled={exit.isPending}>
          {exit.isPending ? 'Saving…' : 'Record exit'} <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

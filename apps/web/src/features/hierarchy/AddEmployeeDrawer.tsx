import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { TOP_POSITION_LEVEL, type Employee, type EmploymentType, type HierarchySummary } from '@payflow/shared';
import { useCreateEmployee, useManagers } from '../../app/queries';
import { Drawer } from '../../components';
import { titleCase } from '../../lib/format';

interface Form {
  name: string;
  employmentType: EmploymentType;
  positionLevel: number;
  jobTitle: string;
  department: string;
  branch: string;
  state: string;
  managerId: string;
  joinDate: string;
  dateOfBirth: string;
  gender: string;
  workEmail: string;
  phone: string;
  payGroup: string;
  monthlyBasic: string;
  monthlyHra: string;
  monthlySpecial: string;
  leaveBalanceDays: string;
  pfMember: boolean;
  esiMember: boolean;
}

const INITIAL: Form = {
  name: '',
  employmentType: 'permanent',
  positionLevel: 1,
  jobTitle: 'Associate',
  department: 'Operations',
  branch: 'Bengaluru',
  state: 'Karnataka',
  managerId: '',
  joinDate: '2026-09-01',
  dateOfBirth: '1995-01-01',
  gender: '',
  workEmail: '',
  phone: '',
  payGroup: 'General',
  monthlyBasic: '18000',
  monthlyHra: '9000',
  monthlySpecial: '7000',
  leaveBalanceDays: '12',
  pfMember: true,
  esiMember: false,
};
const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);

export function AddEmployeeDrawer({
  summary,
  onClose,
  onCreated,
}: {
  summary: HierarchySummary;
  onClose: () => void;
  onCreated: (employee: Employee) => void;
}) {
  const [form, setForm] = useState<Form>(INITIAL);
  const [managerSearch, setManagerSearch] = useState('');
  const isTop = form.positionLevel === TOP_POSITION_LEVEL;
  const managers = useManagers(form.positionLevel, managerSearch, !isTop);
  const create = useCreateEmployee();
  const change = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  const contractor = form.employmentType === 'contractor';

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const employee = await create.mutateAsync({
        ...form,
        managerId: isTop ? null : form.managerId || null,
        gender: (form.gender || null) as Employee['gender'],
        monthlyBasic: toPaise(form.monthlyBasic),
        monthlyHra: toPaise(form.monthlyHra),
        monthlySpecial: toPaise(form.monthlySpecial),
        leaveBalanceDays: Number(form.leaveBalanceDays),
      });
      onCreated(employee);
    } catch {
      // The error is shown inside the form from the mutation state.
    }
  }

  return (
    <Drawer
      eyebrow="NEW PERSON / HIERARCHY"
      title="Add employee"
      subtitle="HR activates the record directly in this demo."
      className="hierarchy-add-drawer"
      onClose={onClose}
    >
      <form className="drawer-body hierarchy-form" onSubmit={save}>
        {create.error && <div className="message error">{create.error.message}</div>}
        <h3>Identity and place in hierarchy</h3>
        <label>
          Full name
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={event => change({ name: event.target.value })}
            placeholder="e.g. Kavya Rao"
          />
        </label>
        <div className="hierarchy-form-grid">
          <label>
            Employment type
            <select
              value={form.employmentType}
              onChange={event => {
                const next = event.target.value as EmploymentType;
                const paid = next !== 'contractor';
                change({
                  employmentType: next,
                  monthlyBasic: paid ? '18000' : '0',
                  monthlyHra: paid ? '9000' : '0',
                  monthlySpecial: paid ? '7000' : '0',
                  leaveBalanceDays: next === 'permanent' ? '12' : '0',
                  pfMember: paid,
                });
              }}
            >
              {summary.employmentTypes.map(type => (
                <option key={type} value={type}>
                  {titleCase(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Position level
            <select
              value={form.positionLevel}
              onChange={event => {
                const level = Number(event.target.value);
                change({
                  positionLevel: level,
                  jobTitle: summary.positionLevels.find(item => item.level === level)?.label ?? '',
                  managerId: '',
                });
              }}
            >
              {summary.positionLevels.map(item => (
                <option key={item.level} value={item.level}>
                  L{item.level} · {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="hierarchy-form-grid">
          <label>
            Job title
            <input required value={form.jobTitle} onChange={event => change({ jobTitle: event.target.value })} />
          </label>
          <label>
            Department
            <input
              required
              value={form.department}
              onChange={event => change({ department: event.target.value })}
              list="departments"
            />
            <datalist id="departments">
              {summary.departments.map(item => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
        </div>
        {!isTop && (
          <>
            <label>
              Find reporting manager
              <input
                value={managerSearch}
                onChange={event => setManagerSearch(event.target.value)}
                placeholder="Search name or employee ID"
              />
            </label>
            <label>
              Reporting manager
              <select required value={form.managerId} onChange={event => change({ managerId: event.target.value })}>
                <option value="">Choose a higher level manager</option>
                {managers.data?.map(item => (
                  <option key={item.id} value={item.id}>
                    L{item.positionLevel} · {item.name} · {item.jobTitle}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <h3>Work details</h3>
        <div className="hierarchy-form-grid">
          <label>
            Branch
            <select
              value={form.branch}
              onChange={event => {
                const found = summary.branches.find(item => item.branch === event.target.value);
                if (found) change({ branch: found.branch, state: found.state });
              }}
            >
              {summary.branches.map(item => (
                <option key={item.branch}>{item.branch}</option>
              ))}
            </select>
          </label>
          <label>
            Work state
            <input value={form.state} readOnly />
          </label>
        </div>
        <div className="hierarchy-form-grid">
          <label>
            Join date
            <input
              required
              type="date"
              value={form.joinDate}
              onChange={event => change({ joinDate: event.target.value })}
            />
          </label>
          <label>
            Date of birth
            <input
              required
              type="date"
              value={form.dateOfBirth}
              onChange={event => change({ dateOfBirth: event.target.value })}
            />
          </label>
        </div>
        <label>
          Gender
          <select value={form.gender} onChange={event => change({ gender: event.target.value })}>
            <option value="">Not recorded</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="hierarchy-form-grid">
          <label>
            Work email
            <input
              type="email"
              value={form.workEmail}
              onChange={event => change({ workEmail: event.target.value })}
              placeholder="optional@example.invalid"
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={event => change({ phone: event.target.value })}
              placeholder="Optional, 10–15 digits"
            />
          </label>
        </div>
        <h3>{contractor ? 'Attendance setup' : 'Pay and statutory setup'}</h3>
        {contractor ? (
          <div className="info-strip">
            Contractors are added to the directory and attendance only. No salary or tax is calculated for them in this
            payroll run.
          </div>
        ) : (
          <>
            <div className="hierarchy-form-grid">
              <label>
                Basic pay · INR/month
                <input
                  required
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.monthlyBasic}
                  onChange={event => change({ monthlyBasic: event.target.value })}
                />
              </label>
              <label>
                HRA · INR/month
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyHra}
                  onChange={event => change({ monthlyHra: event.target.value })}
                />
              </label>
            </div>
            <div className="hierarchy-form-grid">
              <label>
                Special allowance · INR/month
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlySpecial}
                  onChange={event => change({ monthlySpecial: event.target.value })}
                />
              </label>
              <label>
                Pay group
                <select value={form.payGroup} onChange={event => change({ payGroup: event.target.value })}>
                  <option>General</option>
                  <option>Operations</option>
                </select>
              </label>
            </div>
            <div className="hierarchy-checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.pfMember}
                  onChange={event => change({ pfMember: event.target.checked })}
                />{' '}
                EPF member
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.esiMember}
                  onChange={event => change({ esiMember: event.target.checked })}
                />{' '}
                ESI member
              </label>
            </div>
          </>
        )}
        <label>
          Opening leave balance · days
          <input
            type="number"
            min="0"
            max="365"
            step="1"
            value={form.leaveBalanceDays}
            onChange={event => change({ leaveBalanceDays: event.target.value })}
          />
        </label>
        <div className="info-strip">
          New records start with 30 working days in the current run. Attendance can be adjusted by importing inputs
          before calculation.
        </div>
        <div className="drawer-actions">
          <button className="button primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add and activate'} <ArrowRight size={16} />
          </button>
          <button className="button outline" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
}

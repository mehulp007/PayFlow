import type { Employee } from '@payflow/shared';
import { DetailRow, Drawer } from '../../components';
import { money, titleCase } from '../../lib/format';

const notRecorded = (value: number | string | null) => (value === null ? 'Not recorded' : String(value));

export function EmployeeDetailDrawer({ person, onClose }: { person: Employee; onClose: () => void }) {
  const regularGross = person.monthlyBasic + person.monthlyHra + person.monthlySpecial;
  return (
    <Drawer
      eyebrow="FULL EMPLOYEE RECORD"
      title={person.name}
      subtitle={`${person.id} · ${person.employmentStatus}`}
      onClose={onClose}
    >
      <div className="drawer-body">
        <div className="hierarchy-detail-banner">
          <span>L{person.positionLevel}</span>
          <div>
            <strong>{person.jobTitle}</strong>
            <small>
              {titleCase(person.employmentType)} · {person.department}
            </small>
          </div>
        </div>
        <h3>Work and reporting</h3>
        <DetailRow label="Employment type" value={titleCase(person.employmentType)} />
        <DetailRow label="Position level" value={`L${person.positionLevel}`} />
        <DetailRow label="Job title" value={person.jobTitle} />
        <DetailRow label="Department" value={person.department} />
        <DetailRow label="Branch" value={person.branch} />
        <DetailRow label="Work state" value={person.state} />
        <DetailRow
          label="Reports to"
          value={person.managerName ? `${person.managerName} · ${person.managerId}` : 'Top position'}
        />
        <DetailRow label="Join date" value={person.joinDate} />
        <DetailRow label="Date of birth" value={person.dateOfBirth} />
        <DetailRow label="Gender" value={person.gender ? titleCase(person.gender) : 'Not recorded'} />
        <DetailRow label="Work email" value={person.workEmail ?? 'Not recorded'} />
        <DetailRow label="Phone" value={person.phone ?? 'Not recorded'} />
        <DetailRow label="Pay group" value={person.payGroup} />
        <h3>Pay and statutory setup</h3>
        {person.payrollScope ? (
          <>
            <DetailRow label="Basic pay" value={money(person.monthlyBasic)} />
            <DetailRow label="House rent allowance" value={money(person.monthlyHra)} />
            <DetailRow label="Special allowance" value={money(person.monthlySpecial)} />
            <DetailRow label="Regular monthly gross" value={money(regularGross)} />
            <DetailRow label="Tax regime" value={titleCase(person.taxRegime)} />
            <DetailRow label="EPF member" value={person.pfMember ? 'Yes' : 'No'} />
            <DetailRow label="EPS member" value={person.epsMember ? 'Yes' : 'No'} />
            <DetailRow label="ESI member" value={person.esiMember ? 'Yes' : 'No'} />
            <DetailRow label="Professional tax & LWF" value={`${person.state} rules`} />
            <DetailRow label="Bank verified" value={person.bankReady ? 'Yes' : 'No'} />
            <DetailRow label="Account ending" value={person.bankAccountLast4 ?? 'Not recorded'} />
          </>
        ) : (
          <div className="info-strip">
            Contractor-based people are in the directory and attendance view only. Their payments are outside this
            employee payroll run.
          </div>
        )}
        <h3>Attendance and leave</h3>
        <DetailRow label="Working days" value={notRecorded(person.workingDays)} />
        <DetailRow label="Unpaid days" value={notRecorded(person.unpaidDays)} />
        <DetailRow
          label="Paid days"
          value={person.workingDays === null ? 'Not recorded' : String(person.workingDays - (person.unpaidDays ?? 0))}
        />
        <DetailRow label="Leave taken" value={`${person.leaveTakenDays} days`} />
        <DetailRow label="Leave balance" value={`${person.leaveBalanceDays} days`} />
        <div className="info-strip">Attendance and leave are synthetic monthly summaries in this prototype.</div>
      </div>
    </Drawer>
  );
}

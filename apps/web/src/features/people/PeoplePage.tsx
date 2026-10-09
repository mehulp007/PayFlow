import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { BadgeCheck, ChevronRight, FileText, Search, ShieldCheck, Users } from 'lucide-react';
import type { Employee } from '@payflow/shared';
import { useReportError } from '../../app/FeedbackProvider';
import { useBootstrap, useEmployee, useEmployees } from '../../app/queries';
import { Heading, Pagination, PanelTitle, Pill } from '../../components';
import { count, initials, money } from '../../lib/format';
import { EmployeeRecordDrawer, type RecordTab } from './EmployeeRecordDrawer';

const PAGE_SIZE = 20;

/** The employee directory; the compensation view shows the same people with their monthly gross. */
export function PeoplePage({ compensation }: { compensation: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Employee | null>(null);
  // Links from search and notifications open a person directly: /people?employee=EMP00002&tab=tax
  const [params, setParams] = useSearchParams();
  const linked = useEmployee(params.get('employee')).data;
  const employees = useEmployees(page, PAGE_SIZE, { search });
  useReportError(employees.error);
  const data = employees.data;
  const branchCount = useBootstrap().data?.organization.branches.length ?? 0;

  return (
    <>
      <Heading
        eyebrow={compensation ? 'COMPENSATION / SALARY STRUCTURES' : 'PEOPLE / EMPLOYEE RECORDS'}
        title={compensation ? 'Compensation' : 'People'}
        description={`${count(data?.total)} active employee records across ${branchCount} ${branchCount === 1 ? 'branch' : 'branches'}.`}
      />
      <div className="people-layout">
        <section className="panel people-list">
          <PanelTitle
            title={compensation ? 'Salary structures' : 'Employee directory'}
            description={
              compensation
                ? 'Select an employee to inspect monthly pay components.'
                : 'Search and inspect employee records.'
            }
          />
          <div className="filter-row">
            <div className="table-search">
              <Search size={17} />
              <input
                placeholder="Find employee by name or ID"
                value={search}
                onChange={event => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <span className="result-count">{count(data?.total)} employees</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Pay group</th>
                  <th>{compensation ? 'Monthly gross' : 'Tax regime'}</th>
                  <th>Bank</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map(employee => (
                  <tr key={employee.id} onClick={() => setSelected(employee)}>
                    <td>
                      <div className="employee-cell">
                        <span className="mini-avatar">{initials(employee.name)}</span>
                        <span>
                          <strong>{employee.name}</strong>
                          <small>{employee.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {employee.branch}
                      <small>{employee.state}</small>
                    </td>
                    <td>{employee.payGroup}</td>
                    <td>
                      {compensation ? (
                        money(employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial)
                      ) : (
                        <Pill tone="info">{employee.taxRegime} regime</Pill>
                      )}
                    </td>
                    <td>
                      {employee.bankReady ? <Pill tone="success">Verified</Pill> : <Pill tone="danger">Missing</Pill>}
                    </td>
                    <td>
                      <ChevronRight size={17} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={page} size={data.size} total={data.total} onPage={setPage} showPageCount={false} />
          )}
        </section>
        <aside className="panel people-side">
          <div className="side-illustration">
            <Users size={34} />
          </div>
          <h2>One trusted employee record</h2>
          <p>
            Employment location, pay structure, tax choice and statutory eligibility feed every payroll calculation.
          </p>
          <div className="side-benefit">
            <BadgeCheck size={18} /> Effective-dated pay details
          </div>
          <div className="side-benefit">
            <ShieldCheck size={18} /> Role-controlled changes
          </div>
          <div className="side-benefit">
            <FileText size={18} /> Explainable payslips
          </div>
        </aside>
      </div>
      {selected && (
        <EmployeeRecordDrawer
          employeeId={selected.id}
          fallback={selected}
          initialTab={compensation ? 'salary' : 'record'}
          onClose={() => setSelected(null)}
        />
      )}
      {!selected && linked && (
        <EmployeeRecordDrawer
          key={linked.id}
          employeeId={linked.id}
          fallback={linked}
          initialTab={(params.get('tab') as RecordTab | null) ?? 'record'}
          onClose={() => setParams({}, { replace: true })}
        />
      )}
    </>
  );
}

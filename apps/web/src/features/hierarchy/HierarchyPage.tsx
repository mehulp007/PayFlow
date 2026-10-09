import { useState } from 'react';
import { ArrowRight, FilterX, Network, Plus, Search } from 'lucide-react';
import { can, type Employee } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback, useReportError } from '../../app/FeedbackProvider';
import { useEmployees, useHierarchySummary } from '../../app/queries';
import { Heading, Pagination, Pill } from '../../components';
import { count, money, titleCase } from '../../lib/format';
import { AddEmployeeDrawer } from './AddEmployeeDrawer';
import { EmployeeDetailDrawer } from './EmployeeDetailDrawer';

type Filters = { search: string; employmentType: string; level: string; department: string; state: string };
const EMPTY_FILTERS: Filters = { search: '', employmentType: '', level: '', department: '', state: '' };
const PAGE_SIZE = 25;

export function HierarchyPage() {
  const user = useUser();
  const { notify } = useFeedback();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const summary = useHierarchySummary();
  const records = useEmployees(page, PAGE_SIZE, filters);
  useReportError(summary.error ?? records.error);

  const update = (patch: Partial<Filters>) => {
    setFilters(current => ({ ...current, ...patch }));
    setPage(1);
  };
  const toggle = (key: keyof Filters, value: string) => update({ [key]: filters[key] === value ? '' : value });
  const counts = summary.data?.counts ?? [];
  const countFor = (level: number, type?: string) =>
    counts
      .filter(item => item.level === level && (!type || item.employmentType === type))
      .reduce((total, item) => total + item.count, 0);
  const sum = (predicate: (type: string) => boolean) =>
    counts.filter(item => predicate(item.employmentType)).reduce((total, item) => total + item.count, 0);
  const isEditor = can(user.role, 'employees.write');
  const canAdd = isEditor && Boolean(summary.data?.branches.length);
  const levels = [...(summary.data?.positionLevels ?? [])].reverse();

  return (
    <>
      <Heading
        eyebrow="PEOPLE / ORGANIZATION HIERARCHY"
        title="Employee hierarchy"
        description="Explore employment types and reporting levels, then open any person for their full record."
        action={
          <button className="button primary" disabled={!canAdd} onClick={() => setAddOpen(true)}>
            <Plus size={17} /> Add employee
          </button>
        }
      />
      <div className="hierarchy-metrics">
        <div className="panel">
          <span>People in directory</span>
          <strong>{count(summary.data?.total)}</strong>
          <small>All employment types</small>
        </div>
        <div className="panel">
          <span>In employee payroll</span>
          <strong>{count(sum(type => type !== 'contractor'))}</strong>
          <small>Excludes contractors</small>
        </div>
        <div className="panel">
          <span>Contractor records</span>
          <strong>{count(sum(type => type === 'contractor'))}</strong>
          <small>Directory and attendance only</small>
        </div>
      </div>
      <section className="panel hierarchy-map">
        <div className="panel-title">
          <div>
            <h2>Position levels</h2>
            <p>Click a level or a category count to filter the people below.</p>
          </div>
          <Network size={21} />
        </div>
        <div className="hierarchy-legend">
          {summary.data?.employmentTypes.map(type => (
            <button
              key={type}
              className={`hierarchy-legend-chip ${filters.employmentType === type ? 'selected' : ''}`}
              onClick={() => toggle('employmentType', type)}
            >
              {titleCase(type)}
            </button>
          ))}
        </div>
        <div className="hierarchy-levels">
          {levels.map(item => (
            <div className="hierarchy-level" key={item.level}>
              <button
                className={`hierarchy-level-name ${filters.level === String(item.level) ? 'selected' : ''}`}
                onClick={() => toggle('level', String(item.level))}
              >
                <span>L{item.level}</span>
                <strong>{item.label}</strong>
                <small>{count(countFor(item.level))} people</small>
              </button>
              <div className="hierarchy-level-types">
                {summary.data?.employmentTypes.map(type => {
                  const total = countFor(item.level, type);
                  const active = filters.level === String(item.level) && filters.employmentType === type;
                  return (
                    <button
                      key={type}
                      disabled={!total}
                      className={active ? 'selected' : ''}
                      onClick={() => update({ level: String(item.level), employmentType: type })}
                    >
                      <strong>{total}</strong>
                      <span>{titleCase(type)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel hierarchy-directory">
        <div className="panel-title">
          <div>
            <h2>People matching your filters</h2>
            <p>{count(records.data?.total)} records · select a row for all work, pay, attendance and leave details</p>
          </div>
          {Object.values(filters).some(Boolean) && (
            <button className="button outline" onClick={() => update(EMPTY_FILTERS)}>
              <FilterX size={15} /> Clear filters
            </button>
          )}
        </div>
        <div className="hierarchy-filters">
          <label className="table-search">
            <Search size={16} />
            <input
              aria-label="Search people"
              placeholder="Search name, ID or job title"
              value={filters.search}
              onChange={event => update({ search: event.target.value })}
            />
          </label>
          <select
            aria-label="Employment type"
            value={filters.employmentType}
            onChange={event => update({ employmentType: event.target.value })}
          >
            <option value="">All types</option>
            {summary.data?.employmentTypes.map(type => (
              <option key={type} value={type}>
                {titleCase(type)}
              </option>
            ))}
          </select>
          <select
            aria-label="Position level"
            value={filters.level}
            onChange={event => update({ level: event.target.value })}
          >
            <option value="">All levels</option>
            {summary.data?.positionLevels.map(item => (
              <option key={item.level} value={item.level}>
                L{item.level} · {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Department"
            value={filters.department}
            onChange={event => update({ department: event.target.value })}
          >
            <option value="">All departments</option>
            {summary.data?.departments.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Work state"
            value={filters.state}
            onChange={event => update({ state: event.target.value })}
          >
            <option value="">All states</option>
            {summary.data?.states.map(state => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Position</th>
                <th>Department</th>
                <th>Location</th>
                <th>Reports to</th>
                <th>Attendance</th>
                <th>Leave</th>
                <th>Pay</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {records.data?.items.map(person => (
                <tr key={person.id} onClick={() => setSelected(person)}>
                  <td>
                    <strong>{person.name}</strong>
                    <small>
                      {person.id} · {person.employmentStatus}
                    </small>
                  </td>
                  <td>
                    <Pill tone={person.employmentType === 'contractor' ? 'warning' : 'info'}>
                      {titleCase(person.employmentType)}
                    </Pill>
                  </td>
                  <td>
                    <strong>
                      L{person.positionLevel} · {person.jobTitle}
                    </strong>
                  </td>
                  <td>{person.department}</td>
                  <td>
                    {person.branch}
                    <small>{person.state}</small>
                  </td>
                  <td>{person.managerName ?? '—'}</td>
                  <td>
                    {person.workingDays === null
                      ? '—'
                      : `${person.workingDays - (person.unpaidDays ?? 0)}/${person.workingDays} paid`}
                  </td>
                  <td>{person.leaveBalanceDays} days</td>
                  <td>
                    {person.payrollScope
                      ? money(person.monthlyBasic + person.monthlyHra + person.monthlySpecial)
                      : 'Outside payroll'}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View full record for ${person.name}`}
                      onClick={() => setSelected(person)}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!records.data?.items.length && (
            <div className="hierarchy-empty">
              {records.isFetching ? 'Loading people…' : 'No employees match these filters.'}
            </div>
          )}
        </div>
        {Boolean(records.data?.total) && records.data && (
          <Pagination page={page} size={records.data.size} total={records.data.total} onPage={setPage} />
        )}
      </section>
      {selected && <EmployeeDetailDrawer person={selected} onClose={() => setSelected(null)} />}
      {addOpen && summary.data && (
        <AddEmployeeDrawer
          summary={summary.data}
          onClose={() => setAddOpen(false)}
          onCreated={employee => {
            setAddOpen(false);
            notify(`${employee.name} added as an active ${titleCase(employee.employmentType)} record.`);
            setSelected(employee);
          }}
        />
      )}
    </>
  );
}

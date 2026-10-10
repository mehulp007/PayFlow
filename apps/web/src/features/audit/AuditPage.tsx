import { useState } from 'react';
import { Link } from 'react-router';
import { History, RotateCcw } from 'lucide-react';
import { useReportError } from '../../app/FeedbackProvider';
import { useAuditLog, type AuditFilters } from '../../app/queries';
import { EmptyState, Heading, Pagination, Pill, type PillTone } from '../../components';
import { count, dateTime } from '../../lib/format';

/** Action families, by the prefix of the recorded action name. */
const AREAS: Array<[prefix: string, label: string, tone: PillTone]> = [
  ['payroll', 'Payroll', 'info'],
  ['payments', 'Payments', 'success'],
  ['inputs', 'Inputs', 'info'],
  ['employee', 'People', 'neutral'],
  ['leave', 'Leave', 'warning'],
  ['tax', 'Tax', 'warning'],
  ['payslip', 'Payslips', 'success'],
  ['report', 'Reports', 'neutral'],
  ['auth', 'Sign-in', 'neutral'],
  ['invitation', 'Invitations', 'neutral'],
  ['organization', 'Organization', 'neutral'],
  ['demo', 'Sample company', 'danger'],
];
const EMPTY: AuditFilters = { actor: '', action: '', from: '', to: '' };

const areaOf = (action: string) => AREAS.find(([prefix]) => action.startsWith(prefix));
/** Short readable details: "employeeId EMP00002 · type earned". */
const describe = (details: Record<string, unknown>) =>
  Object.entries(details)
    .filter(([, value]) => value !== null && value !== '' && typeof value !== 'object')
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(' · ');

/** Everything recorded in the organization, newest first, with filters. */
export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY);
  const [page, setPage] = useState(1);
  const log = useAuditLog(page, filters);
  useReportError(log.error);
  const change = (patch: Partial<AuditFilters>) => {
    setFilters(current => ({ ...current, ...patch }));
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <Heading
        eyebrow="GOVERNANCE / AUDIT LOG"
        title="Audit log"
        description="Every sign-in, change, approval and export, with who did it and when."
      />
      <section className="panel">
        <div className="audit-filters">
          <label>
            Person
            <select value={filters.actor} onChange={event => change({ actor: event.target.value })}>
              <option value="">Everyone</option>
              {log.data?.actors.map(actor => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </label>
          <label>
            Area
            <select value={filters.action} onChange={event => change({ action: event.target.value })}>
              <option value="">All areas</option>
              {AREAS.map(([prefix, label]) => (
                <option key={prefix} value={prefix}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" value={filters.from} onChange={event => change({ from: event.target.value })} />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={event => change({ to: event.target.value })}
            />
          </label>
          <button className="text-button" disabled={!filtered} onClick={() => change(EMPTY)}>
            <RotateCcw size={15} /> Clear
          </button>
        </div>
        <span className="result-count">
          {count(log.data?.total)} {log.data?.total === 1 ? 'event' : 'events'}
        </span>
        {log.data?.items.length ? (
          <div className="table-scroll">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {log.data.items.map(event => {
                  const area = areaOf(event.action);
                  return (
                    <tr key={event.id}>
                      <td className="nowrap">{dateTime(event.createdAt)}</td>
                      <td>{event.actor}</td>
                      <td>
                        <Pill tone={area?.[2] ?? 'neutral'}>{area?.[1] ?? 'Other'}</Pill>
                        <small>{event.action}</small>
                      </td>
                      <td className="audit-details">
                        {describe(event.details) || '—'}
                        {event.runId && (
                          <small>
                            <Link to={`/payroll/${event.runId}`}>Open pay run</Link>
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          log.isSuccess && (
            <EmptyState icon={History} title="No events">
              Nothing matches these filters.
            </EmptyState>
          )
        )}
        {log.data && log.data.total > log.data.size && (
          <Pagination page={page} size={log.data.size} total={log.data.total} onPage={setPage} />
        )}
      </section>
    </>
  );
}

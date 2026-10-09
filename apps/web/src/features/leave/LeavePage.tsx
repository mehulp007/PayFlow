import { useState } from 'react';
import { CalendarCheck2, CalendarPlus, Scale } from 'lucide-react';
import { LEAVE_TYPE_DETAILS, LEAVE_TYPES } from '@payflow/shared';
import { useReportError } from '../../app/FeedbackProvider';
import { useLeaveList } from '../../app/queries';
import { EmptyState, Heading, Modal, Pagination, PanelTitle } from '../../components';
import { count } from '../../lib/format';
import { LeaveRequestForm, LeaveRequestTable } from './LeaveParts';

const FILTERS = [
  ['pending', 'Waiting'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['', 'All'],
] as const;

/** HR's leave desk: decide requests, and record leave for people without their own sign-in. */
export function LeavePage() {
  const [status, setStatus] = useState<string>('pending');
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const list = useLeaveList({ scope: 'all', status, page });
  useReportError(list.error);
  const data = list.data;

  return (
    <>
      <Heading
        eyebrow="PEOPLE / LEAVE"
        title="Leave"
        description="Approve or reject requests. Approved leave without pay is deducted in that month’s payroll run."
        action={
          <button className="button primary" onClick={() => setRecording(true)}>
            <CalendarPlus size={17} /> Record leave
          </button>
        }
      />
      <div className="leave-desk">
        <section className="panel">
          <PanelTitle
            title="Requests"
            description={
              status === 'pending' ? `${count(data?.total)} waiting for a decision` : `${count(data?.total)} requests`
            }
          />
          <div className="tab-bar">
            {FILTERS.map(([value, label]) => (
              <button
                key={label}
                className={status === value ? 'selected' : ''}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {data && data.total === 0 ? (
            <EmptyState icon={CalendarCheck2} title={status === 'pending' ? 'Nothing waiting' : 'No requests'}>
              {status === 'pending' ? 'Every leave request has been decided.' : 'No leave requests match this filter.'}
            </EmptyState>
          ) : (
            <LeaveRequestTable
              requests={data?.items ?? []}
              showPerson
              canDecide
              canCancel={status !== 'pending'}
              empty=""
            />
          )}
          {data && data.total > data.size && (
            <Pagination page={page} size={data.size} total={data.total} onPage={setPage} />
          )}
        </section>
        <aside className="panel leave-rules">
          <div className="side-illustration">
            <Scale size={30} />
          </div>
          <h2>Leave rules</h2>
          {LEAVE_TYPES.map(type => (
            <div key={type} className="leave-rule">
              <strong>{LEAVE_TYPE_DETAILS[type].label}</strong>
              <small>{LEAVE_TYPE_DETAILS[type].rule}</small>
            </div>
          ))}
          <div className="info-strip">
            Managers with a PayFlow sign-in decide their own team’s requests from their portal.
          </div>
        </aside>
      </div>
      {recording && (
        <Modal onClose={() => setRecording(false)} label="Record leave" className="wide-modal">
          <h2>Record leave</h2>
          <p>For someone who asked in person. The request is created in their name and still needs a decision.</p>
          <label>
            Employee ID
            <input
              value={employeeId}
              placeholder="EMP00001"
              onChange={event => setEmployeeId(event.target.value.toUpperCase().trim())}
            />
          </label>
          {/^EMP\d{5}$/.test(employeeId) && (
            <LeaveRequestForm employeeId={employeeId} onDone={() => setRecording(false)} />
          )}
        </Modal>
      )}
    </>
  );
}

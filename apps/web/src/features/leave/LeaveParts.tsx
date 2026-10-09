import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarX2, Check, X } from 'lucide-react';
import {
  LEAVE_TYPE_DETAILS,
  LEAVE_TYPES,
  leaveDays,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveSummary,
  type LeaveType,
} from '@payflow/shared';
import { useFeedback } from '../../app/FeedbackProvider';
import { useLeaveMutations } from '../../app/queries';
import { Modal, Pill, type PillTone } from '../../components';
import { shortDate } from '../../lib/format';

const today = () => new Date().toISOString().slice(0, 10);

export const STATUS_TONE: Record<LeaveStatus, PillTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Earned, sick and unpaid leave for the year: what is left, carried forward, taken and waiting. */
export function LeaveBalances({ summary }: { summary: LeaveSummary }) {
  return (
    <div className="leave-balances">
      {summary.balances.map(balance => (
        <div key={balance.type} className={`leave-balance ${balance.type}`}>
          <span>{LEAVE_TYPE_DETAILS[balance.type].label}</span>
          <strong>{balance.available === null ? '—' : balance.available}</strong>
          <small>
            {balance.entitled === null
              ? `${balance.taken} days taken${balance.pending ? ` · ${balance.pending} waiting` : ''}`
              : `of ${balance.entitled}${balance.carriedForward ? ` + ${balance.carriedForward} carried forward` : ''} · ${balance.taken} taken${balance.pending ? ` · ${balance.pending} waiting` : ''}`}
          </small>
        </div>
      ))}
    </div>
  );
}

export function LeaveRequestForm({ employeeId, onDone }: { employeeId: string; onDone?: () => void }) {
  const { notify } = useFeedback();
  const { request } = useLeaveMutations();
  const [form, setForm] = useState({ type: 'earned' as LeaveType, from: '', to: '', reason: '' });
  const change = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const days = form.from && form.to && form.from <= form.to ? leaveDays(form.from, form.to) : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await request.mutateAsync({ employeeId, body: form });
      notify(`Leave requested for ${days} ${days === 1 ? 'day' : 'days'}.`);
      setForm({ type: form.type, from: '', to: '', reason: '' });
      onDone?.();
    } catch {
      // Shown inline from the mutation state.
    }
  }

  return (
    <form className="hierarchy-form leave-form" onSubmit={submit}>
      <div className="hierarchy-form-grid">
        <label>
          Leave type
          <select value={form.type} onChange={event => change({ type: event.target.value as LeaveType })}>
            {LEAVE_TYPES.map(type => (
              <option key={type} value={type}>
                {LEAVE_TYPE_DETAILS[type].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <input
            value={form.reason}
            maxLength={300}
            placeholder="Optional"
            onChange={event => change({ reason: event.target.value })}
          />
        </label>
      </div>
      <div className="hierarchy-form-grid">
        <label>
          From
          <input
            type="date"
            required
            value={form.from}
            onChange={event => change({ from: event.target.value, to: form.to || event.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            required
            min={form.from}
            value={form.to}
            onChange={event => change({ to: event.target.value })}
          />
        </label>
      </div>
      <small className="field-hint">{LEAVE_TYPE_DETAILS[form.type].rule}</small>
      {request.error && <div className="message error">{request.error.message}</div>}
      <div className="drawer-actions">
        <button className="button primary" type="submit" disabled={request.isPending || !days}>
          {request.isPending ? 'Sending…' : days ? `Request ${days} ${days === 1 ? 'day' : 'days'}` : 'Request leave'}{' '}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

/**
 * Leave requests as a table. Deciders (HR, or the manager for their team) approve or reject pending ones;
 * the person themselves can cancel.
 */
export function LeaveRequestTable({
  requests,
  showPerson,
  canDecide,
  canCancel,
  empty,
}: {
  requests: LeaveRequest[];
  showPerson: boolean;
  canDecide: boolean;
  canCancel: boolean;
  empty: string;
}) {
  const { notify, fail } = useFeedback();
  const { decide, cancel } = useLeaveMutations();
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [note, setNote] = useState('');
  const busy = decide.isPending || cancel.isPending;

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      notify(message);
    } catch (error) {
      fail(error);
    }
  }
  async function reject(item: LeaveRequest) {
    setRejecting(null);
    await run(() => decide.mutateAsync({ id: item.id, decision: 'rejected', note: note.trim() }), 'Leave rejected.');
    setNote('');
  }

  if (!requests.length) return <p className="table-empty">{empty}</p>;
  return (
    <div className="table-scroll">
      <table className="leave-table">
        <thead>
          <tr>
            {showPerson && <th>Employee</th>}
            <th>Leave</th>
            <th>Dates</th>
            <th>Days</th>
            <th>Status</th>
            {(canDecide || canCancel) && <th />}
          </tr>
        </thead>
        <tbody>
          {requests.map(item => (
            <tr key={item.id}>
              {showPerson && (
                <td>
                  <strong>{item.employeeName}</strong>
                  <small>{item.employeeId}</small>
                </td>
              )}
              <td>
                {LEAVE_TYPE_DETAILS[item.type].label}
                {item.reason && <small>{item.reason}</small>}
              </td>
              <td>
                {shortDate(item.from)}
                {item.to !== item.from && <small>to {shortDate(item.to)}</small>}
              </td>
              <td className="numeric">{item.days}</td>
              <td>
                <Pill tone={STATUS_TONE[item.status]}>{item.status}</Pill>
                {item.decidedBy && item.status !== 'pending' && (
                  <small>
                    by {item.decidedBy}
                    {item.decisionNote ? ` · ${item.decisionNote}` : ''}
                  </small>
                )}
              </td>
              {(canDecide || canCancel) && (
                <td>
                  <div className="row-actions">
                    {canDecide && item.status === 'pending' && (
                      <>
                        <button
                          className="button small primary"
                          disabled={busy}
                          onClick={() =>
                            run(() => decide.mutateAsync({ id: item.id, decision: 'approved' }), 'Leave approved.')
                          }
                        >
                          <Check size={15} /> Approve
                        </button>
                        <button className="button small outline" disabled={busy} onClick={() => setRejecting(item)}>
                          <X size={15} /> Reject
                        </button>
                      </>
                    )}
                    {canCancel &&
                      (item.status === 'pending' || (item.status === 'approved' && item.from > today())) && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => run(() => cancel.mutateAsync(item.id), 'Leave cancelled.')}
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rejecting && (
        <Modal onClose={() => setRejecting(null)} label="Reject leave">
          <div className="modal-icon">
            <CalendarX2 size={25} />
          </div>
          <h2>Reject leave</h2>
          <p>
            {rejecting.employeeName} asked for {rejecting.days} {rejecting.days === 1 ? 'day' : 'days'} from{' '}
            {shortDate(rejecting.from)}. They are notified with your note.
          </p>
          <label>
            Note for {rejecting.employeeName.split(' ')[0]}
            <textarea
              value={note}
              maxLength={300}
              onChange={event => setNote(event.target.value)}
              placeholder="e.g. Quarter-end close that week"
            />
          </label>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button className="button primary" onClick={() => reject(rejecting)}>
              Reject leave
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

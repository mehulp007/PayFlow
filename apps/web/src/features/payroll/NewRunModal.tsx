import { useState, type FormEvent } from 'react';
import { CalendarPlus } from 'lucide-react';
import type { PayGroup } from '@payflow/shared';
import { useCreateRun } from '../../app/queries';
import { Modal } from '../../components';
import { daysInMonth, periodLabel } from '../../lib/period';

const pad = (value: number) => String(value).padStart(2, '0');
const lastDay = (year: number, month: number) => `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

/** Opens a pay period. The API enforces the wage deadline and that no month is paid twice. */
export function NewRunModal({
  payGroups,
  onClose,
  onCreated,
}: {
  payGroups: PayGroup[];
  onClose: () => void;
  onCreated: (runId: string) => void;
}) {
  const create = useCreateRun();
  const [period, setPeriod] = useState('2026-11');
  const [year, month] = period.split('-').map(Number);
  const [paymentDate, setPaymentDate] = useState(lastDay(2026, 11));
  const [payGroupId, setPayGroupId] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const run = await create.mutateAsync({ year, month, paymentDate, payGroupId: payGroupId || null });
      onCreated(run.id);
    } catch {
      // Shown below from the mutation state.
    }
  }

  return (
    <Modal onClose={onClose} label="New pay run">
      <div className="modal-icon">
        <CalendarPlus size={25} />
      </div>
      <h2>New pay run</h2>
      <p>
        Everyone employed during the month is included, with joiners and leavers pro-rated. Monthly wages must be paid
        before the 7th of the following month (Code on Wages, s. 17).
      </p>
      <form onSubmit={submit}>
        <label>
          Pay month
          <input
            type="month"
            required
            value={period}
            onChange={event => {
              setPeriod(event.target.value);
              const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
              if (nextYear && nextMonth) setPaymentDate(lastDay(nextYear, nextMonth));
            }}
          />
        </label>
        <label>
          Payment date
          <input type="date" required value={paymentDate} onChange={event => setPaymentDate(event.target.value)} />
        </label>
        <label>
          Pay group
          <select value={payGroupId} onChange={event => setPayGroupId(event.target.value)}>
            <option value="">All pay groups</option>
            {payGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        {create.error && <div className="auth-error">{create.error.message}</div>}
        <div className="modal-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={create.isPending || !year || !month}>
            {create.isPending ? 'Opening…' : `Open ${year && month ? periodLabel(year, month) : 'period'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

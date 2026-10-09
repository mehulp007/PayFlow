import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { RunSummary } from '@payflow/shared';
import { Modal } from '../../components';
import { count, money } from '../../lib/format';
import { periodLabel } from '../../lib/period';

export function ApprovalModal({
  run,
  onClose,
  onConfirm,
}: {
  run: RunSummary;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const month = periodLabel(run.year, run.month).split(' ')[0];
  return (
    <Modal onClose={onClose} className="approval-modal" label={`Approve ${month} payroll`}>
      <div className="modal-icon">
        <BadgeCheck size={25} />
      </div>
      <h2>Approve {month} payroll</h2>
      <p>
        Confirm {count(run.totalEmployees)} employees and {money(run.net)} net pay. Your decision is recorded in the
        audit trail.
      </p>
      <label>
        Approval note
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="Optional note for the approval record"
        />
      </label>
      <div className="modal-actions">
        <button className="button outline" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" onClick={() => onConfirm(note)}>
          Confirm approval
        </button>
      </div>
    </Modal>
  );
}

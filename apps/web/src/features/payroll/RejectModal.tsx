import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Modal } from '../../components';

/** Finance returns a submitted run to the preparers, with a note that stays on the run until resubmission. */
export function RejectModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal onClose={onClose} label="Send back to payroll">
      <div className="modal-icon">
        <Undo2 size={25} />
      </div>
      <h2>Send back to payroll</h2>
      <p>The run returns to the payroll team for changes and must be submitted again. Your note is recorded.</p>
      <label>
        What needs to change?
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="e.g. Recheck the October bonus file"
        />
      </label>
      <div className="modal-actions">
        <button className="button outline" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" disabled={note.trim().length < 3} onClick={() => onConfirm(note.trim())}>
          Send back
        </button>
      </div>
    </Modal>
  );
}

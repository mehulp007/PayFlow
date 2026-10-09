import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useFeedback } from '../../app/FeedbackProvider';
import { useImport } from '../../app/queries';
import { Modal } from '../../components';

const SAMPLE = [
  'employee_id,variable_pay,other_deduction,unpaid_days,working_days,note',
  'EMP00001,2500,0,0,30,September bonus',
  'EMP00002,0,0,1,30,One unpaid day',
].join('\n');

/** Paste or choose a CSV, preview the validation result, then import the accepted rows. */
export function ImportDialog({ runId, onClose }: { runId: string | undefined; onClose: () => void }) {
  const { notify, fail } = useFeedback();
  const { preview, commit } = useImport(runId);
  const [contents, setContents] = useState(SAMPLE);
  const result = preview.data;
  const busy = preview.isPending || commit.isPending;
  const edit = (text: string) => {
    setContents(text);
    preview.reset();
  };

  async function importRows() {
    try {
      const { imported } = await commit.mutateAsync(contents);
      notify(`${imported} input rows imported.`);
      onClose();
    } catch (error) {
      fail(error);
    }
  }

  return (
    <Modal onClose={onClose} className="import-modal" label="Import payroll inputs">
      <div className="modal-icon">
        <FileSpreadsheet size={25} />
      </div>
      <h2>Import payroll inputs</h2>
      <p>
        Paste a CSV or choose a file. Preview checks columns, duplicates, employee IDs, amounts and attendance before
        importing.
      </p>
      <input
        className="file-input"
        type="file"
        accept=".csv,text/csv"
        onChange={async event => {
          const file = event.target.files?.[0];
          if (file) edit(await file.text());
        }}
      />
      <label>
        CSV data
        <textarea className="csv-textarea" value={contents} onChange={event => edit(event.target.value)} />
      </label>
      {result && (
        <div className={`import-preview ${result.errors.length ? 'has-error' : ''}`}>
          <strong>
            {result.valid.length} valid rows · {result.errors.length} errors
          </strong>
          {result.errors.slice(0, 5).map((item, index) => (
            <span key={index}>
              {item.row ? `Row ${item.row}` : 'File'}: {item.message}
            </span>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button className="button outline" onClick={onClose}>
          Cancel
        </button>
        <button className="button outline" disabled={busy} onClick={() => preview.mutate(contents, { onError: fail })}>
          Preview
        </button>
        <button className="button primary" disabled={!result || result.errors.length > 0 || busy} onClick={importRows}>
          Import rows
        </button>
      </div>
    </Modal>
  );
}

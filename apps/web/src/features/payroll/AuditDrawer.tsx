import { useAudit } from '../../app/queries';
import { dateTime } from '../../lib/format';
import { Drawer } from '../../components';

export function AuditDrawer({ runId, onClose }: { runId: string | undefined; onClose: () => void }) {
  const audit = useAudit(runId, true);
  return (
    <Drawer eyebrow="PAYROLL GOVERNANCE" title="Audit trail" subtitle={`Run ${runId ?? ''}`} onClose={onClose}>
      <div className="drawer-body">
        <div className="audit-list">
          {audit.data?.map(event => (
            <div key={event.id}>
              <span className="audit-dot" />
              <div>
                <strong>{event.action.replaceAll('.', ' · ')}</strong>
                <span>
                  {event.actor} · {dateTime(event.createdAt)}
                </span>
                <small>
                  {Object.entries(event.details)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(' · ')}
                </small>
              </div>
            </div>
          ))}
          {audit.isSuccess && !audit.data.length && <p>No events recorded yet.</p>}
          {audit.isPending && <p>Loading events…</p>}
        </div>
      </div>
    </Drawer>
  );
}

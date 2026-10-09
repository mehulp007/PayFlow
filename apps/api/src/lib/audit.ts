import type { Db, Tx } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

export async function recordAudit(
  db: Db | Tx,
  event: { runId?: string | null; actor: string; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditEvents).values({
    runId: event.runId ?? null,
    actor: event.actor,
    action: event.action,
    details: event.details ?? {},
  });
}

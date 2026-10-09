import type { FastifyRequest } from 'fastify';
import type { Db, Tx } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { currentUser } from '../plugins/auth.js';

export async function recordAudit(
  db: Db | Tx,
  event: {
    organizationId: string | null;
    runId?: string | null;
    actor: string;
    action: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: event.organizationId,
    runId: event.runId ?? null,
    actor: event.actor,
    action: event.action,
    details: event.details ?? {},
  });
}

/** Records an action by the signed-in account in its own organization. */
export function audit(
  db: Db,
  request: FastifyRequest,
  action: string,
  details?: Record<string, unknown>,
  runId?: string,
): Promise<void> {
  const user = currentUser(request);
  return recordAudit(db, { organizationId: user.organizationId, runId, actor: user.username, action, details });
}

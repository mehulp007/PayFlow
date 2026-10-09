import type { FastifyInstance } from 'fastify';
import { auditQuery, notificationsReadBody, searchQuery } from '@payflow/shared';
import { validate } from '../../lib/errors.js';
import { allow, currentUser, orgOf } from '../../plugins/auth.js';
import { feed, markRead } from '../notifications/service.js';
import { auditLog, search } from './service.js';

/** Cross-cutting workspace features: notifications, the audit log and global search. */
export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;

  app.get('/api/notifications', async request => feed(db, currentUser(request).id));

  app.post('/api/notifications/read', async request => {
    const { ids } = validate(notificationsReadBody, request.body ?? {});
    await markRead(db, currentUser(request).id, ids);
    return feed(db, currentUser(request).id);
  });

  app.get('/api/audit', { preHandler: allow('audit.read') }, async request =>
    auditLog(db, orgOf(request), validate(auditQuery, request.query)),
  );

  app.get('/api/search', { preHandler: allow('employees.read') }, async request =>
    search(db, orgOf(request), validate(searchQuery, request.query).q),
  );
}

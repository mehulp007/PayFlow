import type { FastifyInstance } from 'fastify';
import { allow, orgOf } from '../../plugins/auth.js';
import { analytics } from './service.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/analytics', { preHandler: allow('runs.read') }, async request => analytics(app.db, orgOf(request)));
}

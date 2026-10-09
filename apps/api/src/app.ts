import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { RULE_VERSION } from '@payflow/core';
import type { Db } from './db/client.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { employeeRoutes } from './modules/employees/routes.js';
import { organizationRoutes } from './modules/organizations/routes.js';
import { runRoutes } from './modules/runs/routes.js';
import { registerAuth } from './plugins/auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    loginRateLimit: number;
    signupRateLimit: number;
  }
}

export interface AppOptions {
  db: Db;
  logger?: boolean;
  corsOrigins?: string[];
  /** Sign-in attempts allowed per client per minute. */
  loginRateLimit?: number;
  /** Organizations a client may create per hour. */
  signupRateLimit?: number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 8 * 1024 * 1024 });
  app.decorate('db', options.db);
  app.decorate('loginRateLimit', options.loginRateLimit ?? 20);
  app.decorate('signupRateLimit', options.signupRateLimit ?? 5);
  await app.register(cors, { origin: options.corsOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173'] });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error, request, reply) => {
    const status =
      error instanceof HttpError ? error.statusCode : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500) request.log.error(error);
    const body: Record<string, unknown> = { error: status >= 500 ? 'Something went wrong' : (error as Error).message };
    if (error instanceof HttpError && error.issues) body.issues = error.issues;
    void reply.code(status).send(body);
  });

  registerAuth(app);
  app.get('/api/health', { config: { public: true } }, async () => ({
    ok: true,
    mode: 'demo',
    ruleVersion: RULE_VERSION,
  }));
  await app.register(authRoutes);
  await app.register(organizationRoutes);
  await app.register(employeeRoutes);
  await app.register(runRoutes);
  return app;
}

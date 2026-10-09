import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { can, type Permission, type User } from '@payflow/shared';
import { sessionUser } from '../modules/auth/service.js';
import { forbidden, HttpError, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
  interface FastifyContextConfig {
    /** No session required (health check, sign-in). */
    public?: boolean;
    /** Allowed while the account still has a temporary password. */
    allowTemporaryPassword?: boolean;
  }
}

export function bearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/** Resolves the session for every /api route that is not marked public. */
export function registerAuth(app: FastifyInstance): void {
  app.addHook('preHandler', async request => {
    const config = request.routeOptions.config;
    if (!request.url.startsWith('/api/') || config.public) return;
    const user = await sessionUser(app.db, bearerToken(request));
    if (!user) throw unauthorized();
    request.user = user;
    if (user.mustChangePassword && !config.allowTemporaryPassword) {
      throw new HttpError(403, 'Change your temporary password before continuing');
    }
  });
}

/** The signed-in user; only call from routes behind the auth hook. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function allow(permission: Permission): preHandlerAsyncHookHandler {
  return async request => {
    if (!can(currentUser(request).role, permission)) throw forbidden();
  };
}

/** Employees may only act on their own linked record. */
export function assertSelfOrPermission(request: FastifyRequest, employeeId: string, permission: Permission): void {
  const user = currentUser(request);
  if (user.role === 'employee') {
    if (user.employeeId !== employeeId) throw forbidden('Access denied');
    return;
  }
  if (!can(user.role, permission)) throw forbidden();
}

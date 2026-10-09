import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { can, type Permission } from '@payflow/shared';
import { sessionPrincipal, type Principal } from '../modules/auth/service.js';
import { forbidden, HttpError, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
  interface FastifyContextConfig {
    /** No session required (health check, sign-in, sign-up, invitation links). */
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
    const principal = await sessionPrincipal(app.db, bearerToken(request));
    if (!principal) throw unauthorized();
    request.principal = principal;
    if (principal.mustChangePassword && !config.allowTemporaryPassword) {
      throw new HttpError(403, 'Change your temporary password before continuing');
    }
  });
}

/** The signed-in account; only call from routes behind the auth hook. */
export function currentUser(request: FastifyRequest): Principal {
  if (!request.principal) throw unauthorized();
  return request.principal;
}

/** The organization every query in this request is scoped to. */
export const orgOf = (request: FastifyRequest) => currentUser(request).organizationId;

export function allow(permission: Permission): preHandlerAsyncHookHandler {
  return async request => {
    if (!can(currentUser(request).role, permission)) throw forbidden();
  };
}

/** Employees may only act on their own linked record; staff need the given permission. */
export function assertSelfOrPermission(request: FastifyRequest, employeeCode: string, permission: Permission): void {
  const user = currentUser(request);
  if (user.role === 'employee') {
    if (user.employeeId !== employeeCode) throw forbidden('Access denied');
    return;
  }
  if (!can(user.role, permission)) throw forbidden();
}

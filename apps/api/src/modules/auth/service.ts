import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { LoginResult, Role, User } from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import { appUsers, authSessions, employees } from '../../db/schema.js';
import { badRequest, forbidden, HttpError, notFound } from '../../lib/errors.js';

const SESSION_HOURS = 12;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

/** The signed-in account as the API sees it: always tied to one organization. */
export interface Principal extends User {
  organizationId: string;
  /** Internal key of the linked employee record. */
  employeeKey: string | null;
  builtIn: boolean;
}

const principalColumns = {
  id: appUsers.id,
  organizationId: appUsers.organizationId,
  username: appUsers.username,
  displayName: appUsers.displayName,
  role: appUsers.role,
  employeeKey: appUsers.employeeId,
  employeeId: employees.code,
  mustChangePassword: appUsers.mustChangePassword,
  builtIn: appUsers.builtIn,
};
type PrincipalRow = Omit<Principal, 'role'> & { role: string };
const toPrincipal = (row: PrincipalRow): Principal => ({ ...row, role: row.role as Role });
/** The public shape of an account (no organization or internal keys). */
export const toUser = ({
  id,
  username,
  displayName,
  role,
  employeeId,
  mustChangePassword,
  builtIn,
}: Principal): User => ({
  id,
  username,
  displayName,
  role,
  employeeId,
  mustChangePassword,
  builtIn,
});

export function randomPassword(): string {
  return `${randomBytes(18).toString('base64url')}aA1!`;
}
export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || !/^[0-9a-f]{128}$/.test(expected)) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

function selectPrincipals(db: Db | Tx) {
  return db.select(principalColumns).from(appUsers).leftJoin(employees, eq(employees.id, appUsers.employeeId));
}

export async function findPrincipal(db: Db | Tx, userId: string): Promise<Principal> {
  const [row] = await selectPrincipals(db).where(eq(appUsers.id, userId));
  if (!row) throw notFound('Account not found');
  return toPrincipal(row);
}

/** Starts a 12-hour session and returns its bearer token. Only a hash of the token is stored. */
export async function startSession(db: Db | Tx, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(authSessions).values({
    tokenHash: tokenHash(token),
    userId,
    expiresAt: sql`now() + make_interval(hours => ${SESSION_HOURS})`,
  });
  return token;
}

export async function login(db: Db, username: string, password: string, source: string): Promise<LoginResult> {
  const name = username.trim().toLowerCase();
  const invalid = () => new HttpError(401, 'Invalid email or password');
  if (!/^[a-z0-9._+@-]{2,120}$/.test(name)) throw invalid();
  const key = `${source}:${name}`;
  const failed = failures.get(key);
  if (failed && failed.count >= LOCKOUT_ATTEMPTS && failed.until > Date.now()) {
    throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  }
  const [account] = await db
    .select({ id: appUsers.id, passwordHash: appUsers.passwordHash, active: appUsers.active })
    .from(appUsers)
    .where(eq(appUsers.username, name));
  if (!account?.active || !passwordMatches(password, account.passwordHash)) {
    const count = (failed && failed.until > Date.now() ? failed.count : 0) + 1;
    failures.set(key, { count, until: Date.now() + LOCKOUT_MS });
    throw invalid();
  }
  failures.delete(key);
  return { token: await startSession(db, account.id), user: toUser(await findPrincipal(db, account.id)) };
}

export async function sessionPrincipal(db: Db, token: string): Promise<Principal | null> {
  if (!isTokenShape(token)) return null;
  const [row] = await db
    .select(principalColumns)
    .from(authSessions)
    .innerJoin(appUsers, eq(appUsers.id, authSessions.userId))
    .leftJoin(employees, eq(employees.id, appUsers.employeeId))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash(token)),
        gt(authSessions.expiresAt, sql`now()`),
        eq(appUsers.active, true),
      ),
    );
  return row ? toPrincipal(row) : null;
}

export async function logout(db: Db, token: string): Promise<void> {
  if (isTokenShape(token)) await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token)));
}

export async function listUsers(db: Db, organizationId: string): Promise<User[]> {
  const rows = await selectPrincipals(db)
    .where(and(eq(appUsers.organizationId, organizationId), eq(appUsers.active, true)))
    .orderBy(asc(appUsers.username));
  return rows.map(row => toUser(toPrincipal(row)));
}

async function userInOrganization(db: Db | Tx, organizationId: string, id: string) {
  const [user] = await db
    .select({ id: appUsers.id, builtIn: appUsers.builtIn })
    .from(appUsers)
    .where(and(eq(appUsers.id, id), eq(appUsers.organizationId, organizationId)));
  if (!user) throw notFound('Account not found');
  return user;
}

export async function removeUser(
  db: Db,
  organizationId: string,
  id: string,
  ownerUserId: string | null,
): Promise<void> {
  const user = await userInOrganization(db, organizationId, id);
  if (user.builtIn) throw forbidden('Built-in demo accounts cannot be removed');
  if (id === ownerUserId) throw forbidden('The organization owner cannot be removed');
  await db.transaction(async tx => {
    await tx.delete(authSessions).where(eq(authSessions.userId, id));
    await tx.delete(appUsers).where(eq(appUsers.id, id));
  });
}

/** Issues a one-time password and ends the person's sessions. */
export async function resetUserPassword(db: Db, organizationId: string, id: string): Promise<string> {
  await userInOrganization(db, organizationId, id);
  const password = randomPassword();
  await db.transaction(async tx => {
    await tx
      .update(appUsers)
      .set({ passwordHash: hashPassword(password), mustChangePassword: true })
      .where(eq(appUsers.id, id));
    await tx.delete(authSessions).where(eq(authSessions.userId, id));
  });
  return password;
}

/** Changing a password ends every session for that account. */
export async function changePassword(db: Db, userId: string, current: string, next: string): Promise<void> {
  if (next === current) throw badRequest('Choose a password different from the current one');
  const [account] = await db
    .select({ passwordHash: appUsers.passwordHash })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)));
  if (!account || !passwordMatches(current, account.passwordHash)) throw forbidden('Current password is incorrect');
  await db.transaction(async tx => {
    await tx
      .update(appUsers)
      .set({ passwordHash: hashPassword(next), mustChangePassword: false })
      .where(eq(appUsers.id, userId));
    await tx.delete(authSessions).where(eq(authSessions.userId, userId));
  });
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { CreateUserBody, CreatedUser, LoginResult, Role, User } from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { appMeta, appUsers, authSessions, employees } from '../../db/schema.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../../lib/errors.js';

const SESSION_HOURS = 12;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

const userColumns = {
  id: appUsers.id,
  username: appUsers.username,
  role: appUsers.role,
  employeeId: appUsers.employeeId,
  mustChangePassword: appUsers.mustChangePassword,
};
const toUser = (row: {
  id: string;
  username: string;
  role: string;
  employeeId: string | null;
  mustChangePassword: boolean;
}): User => ({ ...row, role: row.role as Role });

export function temporaryPassword(): string {
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
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export async function login(db: Db, username: string, password: string, source: string): Promise<LoginResult> {
  const name = username.trim().toLowerCase();
  const invalid = () => new HttpError(401, 'Invalid username or password');
  if (!/^[a-z0-9._-]{2,64}$/.test(name)) throw invalid();
  const key = `${source}:${name}`;
  const failed = failures.get(key);
  if (failed && failed.count >= LOCKOUT_ATTEMPTS && failed.until > Date.now()) {
    throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  }
  const [account] = await db
    .select({ ...userColumns, passwordHash: appUsers.passwordHash, active: appUsers.active })
    .from(appUsers)
    .where(eq(appUsers.username, name));
  if (!account?.active || !passwordMatches(password, account.passwordHash)) {
    const count = (failed && failed.until > Date.now() ? failed.count : 0) + 1;
    failures.set(key, { count, until: Date.now() + LOCKOUT_MS });
    throw invalid();
  }
  failures.delete(key);
  const token = randomBytes(32).toString('base64url');
  await db.insert(authSessions).values({
    tokenHash: tokenHash(token),
    userId: account.id,
    expiresAt: sql`now() + make_interval(hours => ${SESSION_HOURS})` as unknown as string,
  });
  const { passwordHash: _hash, active: _active, ...user } = account;
  return { token, user: toUser(user) };
}

export async function sessionUser(db: Db, token: string): Promise<User | null> {
  if (!isTokenShape(token)) return null;
  const [row] = await db
    .select(userColumns)
    .from(authSessions)
    .innerJoin(appUsers, eq(appUsers.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash(token)),
        gt(authSessions.expiresAt, sql`now()`),
        eq(appUsers.active, true),
      ),
    );
  return row ? toUser(row) : null;
}

export async function logout(db: Db, token: string): Promise<void> {
  if (isTokenShape(token)) await db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash(token)));
}

export async function listUsers(db: Db): Promise<User[]> {
  const rows = await db
    .select(userColumns)
    .from(appUsers)
    .where(eq(appUsers.active, true))
    .orderBy(asc(appUsers.username));
  return rows.map(toUser);
}

export async function createUser(db: Db, body: CreateUserBody): Promise<CreatedUser> {
  if (body.employeeId) {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.employmentStatus, 'active')));
    if (!employee) throw badRequest('Active employee ID not found');
  }
  const password = temporaryPassword();
  try {
    const [row] = await db
      .insert(appUsers)
      .values({
        id: `USR-${randomBytes(12).toString('hex')}`,
        username: body.username,
        role: body.role,
        employeeId: body.employeeId ?? null,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
      })
      .returning(userColumns);
    return { ...toUser(row), temporaryPassword: password };
  } catch (error) {
    const message = String((error as { cause?: unknown }).cause ?? error);
    if (message.includes('one_active_employee_account')) throw conflict('This employee already has an account');
    if (message.includes('unique')) throw conflict('Username already exists');
    throw error;
  }
}

export async function removeUser(db: Db, id: string): Promise<void> {
  const [user] = await db.select({ builtIn: appUsers.builtIn }).from(appUsers).where(eq(appUsers.id, id));
  if (!user) throw notFound('Account not found');
  if (user.builtIn) throw forbidden('Built-in demo accounts cannot be removed');
  await db.transaction(async tx => {
    await tx.delete(authSessions).where(eq(authSessions.userId, id));
    await tx.delete(appUsers).where(eq(appUsers.id, id));
  });
}

/** Issues a one-time password and ends the person's sessions. */
export async function resetUserPassword(db: Db, id: string): Promise<string> {
  const password = temporaryPassword();
  await db.transaction(async tx => {
    const updated = await tx
      .update(appUsers)
      .set({ passwordHash: hashPassword(password), mustChangePassword: true })
      .where(and(eq(appUsers.id, id), eq(appUsers.active, true)))
      .returning({ id: appUsers.id });
    if (!updated.length) throw notFound('Account not found');
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

export const DEMO_ACCOUNTS: Array<{ username: string; role: Role; employeeId: string | null }> = [
  { username: 'admin', role: 'admin', employeeId: null },
  { username: 'hr', role: 'hr-operator', employeeId: null },
  { username: 'payroll', role: 'payroll-operator', employeeId: null },
  { username: 'finance', role: 'finance-approver', employeeId: null },
  { username: 'auditor', role: 'auditor', employeeId: null },
  { username: 'employee', role: 'employee', employeeId: 'EMP00001' },
];

/**
 * Creates the six built-in demo accounts once, each with its own random password (or a fixed password
 * for automated tests). Credentials are written to a private local file when a path is given.
 */
export async function seedDemoAccounts(db: Db, options: { password?: string; credentialFile?: string }): Promise<void> {
  const [done] = await db.select().from(appMeta).where(eq(appMeta.key, 'demo_accounts'));
  if (done) return;
  const credentials = DEMO_ACCOUNTS.map(account => ({ ...account, password: options.password ?? temporaryPassword() }));
  await db.transaction(async tx => {
    for (const item of credentials) {
      await tx.insert(appUsers).values({
        id: `USR-${item.username}`,
        username: item.username,
        role: item.role,
        employeeId: item.employeeId,
        passwordHash: hashPassword(item.password),
        mustChangePassword: false,
        builtIn: true,
      });
    }
    await tx.insert(appMeta).values({ key: 'demo_accounts', value: new Date().toISOString() });
  });
  if (options.credentialFile) {
    const note = [
      'PAYFLOW - SYNTHETIC DEMO CREDENTIALS',
      'Each built-in account has its own password. Keep this file private. Do not use real payroll data.',
      '',
      ...credentials.map(item => `${item.username}\t${item.password}\t${item.role}`),
      '',
    ].join('\n');
    await writeFile(options.credentialFile, note, { mode: 0o600 });
  }
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import type { LoginResult, OrganizationChoice, Role, User } from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import { appUsers, authSessions, employees, identities, notifications, organizations } from '../../db/schema.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../../lib/errors.js';

const SESSION_HOURS = 12;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

/**
 * The signed-in account as the API sees it: one membership of an identity, always tied to one organization.
 * `id` is the membership; the sign-in name, display name and password belong to the identity.
 */
export interface Principal extends User {
  organizationId: string;
  identityId: string;
  /** Internal key of the linked employee record. */
  employeeKey: string | null;
  builtIn: boolean;
}

const principalColumns = {
  id: appUsers.id,
  organizationId: appUsers.organizationId,
  identityId: appUsers.identityId,
  username: identities.username,
  displayName: identities.displayName,
  role: appUsers.role,
  employeeKey: appUsers.employeeId,
  employeeId: employees.code,
  mustChangePassword: identities.mustChangePassword,
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
export function passwordMatches(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || !/^[0-9a-f]{128}$/.test(expected)) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

function selectPrincipals(db: Db | Tx) {
  return db
    .select(principalColumns)
    .from(appUsers)
    .innerJoin(identities, eq(identities.id, appUsers.identityId))
    .leftJoin(employees, eq(employees.id, appUsers.employeeId));
}

export async function findPrincipal(db: Db | Tx, userId: string): Promise<Principal> {
  const [row] = await selectPrincipals(db).where(eq(appUsers.id, userId));
  if (!row) throw notFound('Account not found');
  return toPrincipal(row);
}

export async function findIdentity(db: Db | Tx, username: string) {
  const [identity] = await db.select().from(identities).where(eq(identities.username, username));
  return identity ?? null;
}

/** Joins an identity to an organization with a role. Returns the membership id. */
export async function addMembership(
  db: Db | Tx,
  membership: { organizationId: string; identityId: string; role: Role; employeeId?: string | null; builtIn?: boolean },
): Promise<string> {
  const [user] = await db
    .insert(appUsers)
    .values({
      organizationId: membership.organizationId,
      identityId: membership.identityId,
      role: membership.role,
      employeeId: membership.employeeId ?? null,
      builtIn: membership.builtIn ?? false,
    })
    .returning({ id: appUsers.id });
  return user.id;
}

/** Creates a sign-in identity and its membership of one organization. Returns the membership id. */
export async function createAccount(
  db: Db | Tx,
  account: {
    organizationId: string;
    username: string;
    displayName: string | null;
    password: string;
    role: Role;
    employeeId?: string | null;
    builtIn?: boolean;
  },
): Promise<string> {
  const [identity] = await db
    .insert(identities)
    .values({
      username: account.username,
      displayName: account.displayName,
      passwordHash: hashPassword(account.password),
    })
    .returning({ id: identities.id });
  return addMembership(db, { ...account, identityId: identity.id });
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

/** Signs in to the organization used most recently, or else the first one joined. */
export async function login(db: Db, username: string, password: string, source: string): Promise<LoginResult> {
  const name = username.trim().toLowerCase();
  const invalid = () => new HttpError(401, 'Invalid email or password');
  if (!/^[a-z0-9._+@-]{2,120}$/.test(name)) throw invalid();
  const key = `${source}:${name}`;
  const failed = failures.get(key);
  if (failed && failed.count >= LOCKOUT_ATTEMPTS && failed.until > Date.now()) {
    throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  }
  const identity = await findIdentity(db, name);
  const [membership] = identity
    ? await db
        .select({ id: appUsers.id })
        .from(appUsers)
        .leftJoin(authSessions, eq(authSessions.userId, appUsers.id))
        .where(and(eq(appUsers.identityId, identity.id), eq(appUsers.active, true)))
        .groupBy(appUsers.id, appUsers.createdAt)
        .orderBy(sql`max(${authSessions.createdAt}) DESC NULLS LAST`, asc(appUsers.createdAt))
        .limit(1)
    : [];
  if (!identity || !membership || !passwordMatches(password, identity.passwordHash)) {
    const count = (failed && failed.until > Date.now() ? failed.count : 0) + 1;
    failures.set(key, { count, until: Date.now() + LOCKOUT_MS });
    throw invalid();
  }
  failures.delete(key);
  return { token: await startSession(db, membership.id), user: toUser(await findPrincipal(db, membership.id)) };
}

export async function sessionPrincipal(db: Db, token: string): Promise<Principal | null> {
  if (!isTokenShape(token)) return null;
  const [row] = await db
    .select(principalColumns)
    .from(authSessions)
    .innerJoin(appUsers, eq(appUsers.id, authSessions.userId))
    .innerJoin(identities, eq(identities.id, appUsers.identityId))
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

/** Organizations this identity belongs to, for the switcher. */
export async function organizationsOf(db: Db, identityId: string): Promise<OrganizationChoice[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, role: appUsers.role, isSample: organizations.isSample })
    .from(appUsers)
    .innerJoin(organizations, eq(organizations.id, appUsers.organizationId))
    .where(and(eq(appUsers.identityId, identityId), eq(appUsers.active, true)))
    .orderBy(asc(organizations.name));
  return rows.map(row => ({ ...row, role: row.role as Role }));
}

/** Moves the session to the same person's membership in another organization. */
export async function switchOrganization(
  db: Db,
  principal: Principal,
  token: string,
  organizationId: string,
): Promise<LoginResult> {
  const [membership] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.identityId, principal.identityId),
        eq(appUsers.organizationId, organizationId),
        eq(appUsers.active, true),
      ),
    );
  if (!membership) throw notFound('Organization not found');
  const next = await startSession(db, membership.id);
  await logout(db, token);
  return { token: next, user: toUser(await findPrincipal(db, membership.id)) };
}

export async function listUsers(db: Db, organizationId: string): Promise<User[]> {
  const rows = await selectPrincipals(db)
    .where(and(eq(appUsers.organizationId, organizationId), eq(appUsers.active, true)))
    .orderBy(asc(identities.username));
  return rows.map(row => toUser(toPrincipal(row)));
}

async function userInOrganization(db: Db | Tx, organizationId: string, id: string) {
  const [user] = await db
    .select({ id: appUsers.id, identityId: appUsers.identityId, builtIn: appUsers.builtIn })
    .from(appUsers)
    .where(and(eq(appUsers.id, id), eq(appUsers.organizationId, organizationId)));
  if (!user) throw notFound('Account not found');
  return user;
}

/**
 * Deletes memberships with their sessions and notifications, then any identity left without a membership.
 * People who still belong to another organization keep their sign-in.
 */
export async function deleteMemberships(tx: Db | Tx, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const members = await tx.select({ identityId: appUsers.identityId }).from(appUsers).where(inArray(appUsers.id, ids));
  await tx.delete(authSessions).where(inArray(authSessions.userId, ids));
  await tx.delete(notifications).where(inArray(notifications.userId, ids));
  await tx.delete(appUsers).where(inArray(appUsers.id, ids));
  const identityIds = [...new Set(members.map(member => member.identityId))];
  const remaining = await tx
    .select({ identityId: appUsers.identityId })
    .from(appUsers)
    .where(inArray(appUsers.identityId, identityIds));
  const orphaned = identityIds.filter(id => !remaining.some(member => member.identityId === id));
  if (orphaned.length) await tx.delete(identities).where(inArray(identities.id, orphaned));
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
  await db.transaction(tx => deleteMemberships(tx, [id]));
}

/** Ends the sessions of every membership of an identity. */
async function endIdentitySessions(tx: Db | Tx, identityId: string) {
  const memberships = await tx.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.identityId, identityId));
  await tx.delete(authSessions).where(
    inArray(
      authSessions.userId,
      memberships.map(membership => membership.id),
    ),
  );
}

/**
 * Issues a one-time password and ends the person's sessions. An admin can only do this for people who use
 * PayFlow in this organization alone; otherwise one organization could take over access to another.
 */
export async function resetUserPassword(db: Db, organizationId: string, id: string): Promise<string> {
  const user = await userInOrganization(db, organizationId, id);
  const [elsewhere] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.identityId, user.identityId), ne(appUsers.organizationId, organizationId)))
    .limit(1);
  if (elsewhere) throw conflict('This person also belongs to another organization, so only they can change it');
  const password = randomPassword();
  await db.transaction(async tx => {
    await tx
      .update(identities)
      .set({ passwordHash: hashPassword(password), mustChangePassword: true })
      .where(eq(identities.id, user.identityId));
    await endIdentitySessions(tx, user.identityId);
  });
  return password;
}

/** Changing a password ends every session of that person, in every organization. */
export async function changePassword(db: Db, principal: Principal, current: string, next: string): Promise<void> {
  if (next === current) throw badRequest('Choose a password different from the current one');
  const [identity] = await db
    .select({ passwordHash: identities.passwordHash })
    .from(identities)
    .where(eq(identities.id, principal.identityId));
  if (!identity || !passwordMatches(current, identity.passwordHash)) {
    throw forbidden('Current password is incorrect');
  }
  await db.transaction(async tx => {
    await tx
      .update(identities)
      .set({ passwordHash: hashPassword(next), mustChangePassword: false })
      .where(eq(identities.id, principal.identityId));
    await endIdentitySessions(tx, principal.identityId);
  });
}

/** Active memberships of the organization with any of the given roles, newest first. */
export async function membersWithRoles(db: Db | Tx, organizationId: string, roles: readonly Role[]) {
  if (!roles.length) return [];
  return db
    .select({ id: appUsers.id, employeeKey: appUsers.employeeId })
    .from(appUsers)
    .where(
      and(eq(appUsers.organizationId, organizationId), eq(appUsers.active, true), inArray(appUsers.role, [...roles])),
    )
    .orderBy(desc(appUsers.createdAt));
}

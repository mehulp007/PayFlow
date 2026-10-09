import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  INVITATION_DAYS,
  passwordSchema,
  type CreatedInvitation,
  type Invitation,
  type InvitationPreview,
  type InviteBody,
  type LoginResult,
  type Role,
} from '@payflow/shared';
import type { Db } from '../../db/client.js';
import { appUsers, employees, identities, invitations, organizations } from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import {
  addMembership,
  createAccount,
  findIdentity,
  findPrincipal,
  passwordMatches,
  startSession,
  tokenHash,
  toUser,
} from './service.js';

const columns = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  employeeId: employees.code,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  createdAt: invitations.createdAt,
};
const toInvitation = (row: Omit<Invitation, 'role'> & { role: string }): Invitation => ({
  ...row,
  role: row.role as Role,
});

export async function listInvitations(db: Db, organizationId: string): Promise<Invitation[]> {
  const rows = await db
    .select(columns)
    .from(invitations)
    .leftJoin(employees, eq(employees.id, invitations.employeeId))
    .where(eq(invitations.organizationId, organizationId))
    .orderBy(desc(invitations.createdAt));
  return rows.map(toInvitation);
}

/** Creates a one-time invitation link. Email delivery is out of scope: the admin shares the link. */
export async function createInvitation(
  db: Db,
  organizationId: string,
  createdBy: string,
  body: InviteBody,
): Promise<CreatedInvitation> {
  const [member] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .innerJoin(identities, eq(identities.id, appUsers.identityId))
    .where(and(eq(identities.username, body.email), eq(appUsers.organizationId, organizationId)));
  if (member) throw conflict('This person is already a member of the organization');
  let employeeKey: string | null = null;
  if (body.employeeId) {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          eq(employees.code, body.employeeId),
          eq(employees.employmentStatus, 'active'),
        ),
      );
    if (!employee) throw badRequest('Active employee ID not found');
    const [linked] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.employeeId, employee.id), eq(appUsers.active, true)));
    if (linked) throw conflict('This employee already has an account');
    employeeKey = employee.id;
  }
  const token = randomBytes(24).toString('base64url');
  const [row] = await db
    .insert(invitations)
    .values({
      organizationId,
      email: body.email,
      role: body.role,
      employeeId: employeeKey,
      tokenHash: tokenHash(token),
      createdBy,
      expiresAt: sql`now() + make_interval(days => ${INVITATION_DAYS})`,
    })
    .returning({ id: invitations.id });
  const [invitation] = await db
    .select(columns)
    .from(invitations)
    .leftJoin(employees, eq(employees.id, invitations.employeeId))
    .where(eq(invitations.id, row.id));
  return { invitation: toInvitation(invitation), token };
}

export async function revokeInvitation(db: Db, organizationId: string, id: string): Promise<void> {
  const removed = await db
    .delete(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });
  if (!removed.length) throw notFound('Invitation not found or already accepted');
}

async function openInvitation(db: Db, token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      email: invitations.email,
      role: invitations.role,
      employeeId: invitations.employeeId,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(
      and(
        eq(invitations.tokenHash, tokenHash(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, sql`now()`),
      ),
    );
  if (!row) throw notFound('This invitation link is invalid, expired or already used');
  return row;
}

export async function previewInvitation(db: Db, token: string): Promise<InvitationPreview> {
  const row = await openInvitation(db, token);
  return {
    organizationName: row.organizationName,
    email: row.email,
    role: row.role as Role,
    existingAccount: Boolean(await findIdentity(db, row.email)),
  };
}

/**
 * New people choose their own name and password, so no temporary password is ever shared. Someone who already
 * uses PayFlow confirms their existing password and gains a membership in the inviting organization.
 */
export async function acceptInvitation(
  db: Db,
  token: string,
  displayName: string | undefined,
  password: string,
): Promise<LoginResult & { organizationId: string }> {
  const invitation = await openInvitation(db, token);
  const identity = await findIdentity(db, invitation.email);
  if (identity && !passwordMatches(password, identity.passwordHash)) {
    throw forbidden('Enter the password of your existing PayFlow account');
  }
  if (!identity) {
    if (!displayName) throw badRequest('Enter your name');
    const strength = passwordSchema.safeParse(password);
    if (!strength.success) throw badRequest(strength.error.issues[0].message);
  }
  const userId = await db.transaction(async tx => {
    const membership = {
      organizationId: invitation.organizationId,
      role: invitation.role as Role,
      employeeId: invitation.employeeId,
    };
    const id = identity
      ? await addMembership(tx, { ...membership, identityId: identity.id })
      : await createAccount(tx, { ...membership, username: invitation.email, displayName: displayName!, password });
    await tx
      .update(invitations)
      .set({ acceptedAt: sql`now()` })
      .where(eq(invitations.id, invitation.id));
    return id;
  });
  return {
    token: await startSession(db, userId),
    user: toUser(await findPrincipal(db, userId)),
    organizationId: invitation.organizationId,
  };
}

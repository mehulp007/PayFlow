import { writeFile } from 'node:fs/promises';
import { and, asc, eq, isNotNull, ne, or } from 'drizzle-orm';
import { RULE_VERSION, REVIEWED_TAX_YEAR, STATE_RULE_SUMMARIES } from '@payflow/core';
import {
  can,
  SAMPLE_COMPANY_SIZE,
  type Bootstrap,
  type ComplianceRules,
  type Organization,
  type Role,
  type SignupBody,
  type SignupResult,
} from '@payflow/shared';
import type { Db, Tx } from '../../db/client.js';
import {
  appMeta,
  appUsers,
  branches,
  employees,
  invitations,
  leaveBalances,
  leaveRequests,
  notifications,
  organizations,
  payGroups,
  payrollInputs,
  payrollLines,
  payrollRuns,
  salaryRevisions,
  taxDeclarations,
} from '../../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import {
  addMembership,
  createAccount,
  deleteMemberships,
  findIdentity,
  findPrincipal,
  organizationsOf,
  passwordMatches,
  randomPassword,
  startSession,
  toUser,
  type Principal,
} from '../auth/service.js';
import { latestRun, summarize, toPeriod } from '../runs/service.js';
import { seedSampleCompany } from './sample.js';

type OrganizationRow = typeof organizations.$inferSelect;
const SAMPLE_ROLES: Role[] = ['hr-operator', 'payroll-operator', 'finance-approver', 'auditor', 'employee'];
const SHORT_ROLE: Record<Role, string> = {
  admin: 'admin',
  'hr-operator': 'hr',
  'payroll-operator': 'payroll',
  'finance-approver': 'finance',
  auditor: 'auditor',
  employee: 'employee',
};

export async function getOrganization(db: Db | Tx, id: string): Promise<Organization & { row: OrganizationRow }> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!row) throw notFound('Organization not found');
  const orgBranches = await db
    .select({ id: branches.id, name: branches.name, state: branches.state })
    .from(branches)
    .where(eq(branches.organizationId, id))
    .orderBy(asc(branches.name));
  const orgPayGroups = await db
    .select({ id: payGroups.id, name: payGroups.name })
    .from(payGroups)
    .where(eq(payGroups.organizationId, id))
    .orderBy(asc(payGroups.name));
  return { id: row.id, name: row.name, isSample: row.isSample, branches: orgBranches, payGroups: orgPayGroups, row };
}
const publicOrganization = ({ row: _row, ...organization }: Organization & { row: OrganizationRow }): Organization =>
  organization;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'org';

/** Creates the organization record with its branches and pay groups. */
async function createOrganization(
  db: Db,
  values: { name: string; isSample: boolean; sampleSize: number | null; sampleHistory: boolean },
  branchList: Array<{ name: string; state: string }>,
  payGroupNames: string[],
) {
  const [organization] = await db.insert(organizations).values(values).returning();
  await db.insert(branches).values(branchList.map(branch => ({ organizationId: organization.id, ...branch })));
  await db.insert(payGroups).values(payGroupNames.map(name => ({ organizationId: organization.id, name })));
  return organization;
}

/**
 * Creates the built-in role accounts of a sample company. Without a password they can only be reached
 * through the audited "View as" switcher; the demo tenant gives them passwords for the README journey.
 */
async function createSampleAccounts(
  db: Db,
  organizationId: string,
  usernameFor: (role: Role) => string,
  roles: Role[],
  passwords?: Map<Role, string>,
  displayName: string | null = null,
) {
  const ids = new Map<Role, string>();
  for (const role of roles) {
    const id = await createAccount(db, {
      organizationId,
      username: usernameFor(role),
      displayName,
      password: passwords?.get(role) ?? randomPassword(),
      role,
      builtIn: true,
    });
    ids.set(role, id);
  }
  return ids;
}

/**
 * Self-service sign-up: an organization, its first admin, and optionally a ready-made sample company. Someone
 * who already uses PayFlow signs up with their existing password and gets one more organization.
 */
export async function signup(db: Db, body: SignupBody & { payGroups: string[] }): Promise<SignupResult> {
  const identity = await findIdentity(db, body.email);
  if (identity && !passwordMatches(body.password, identity.passwordHash)) {
    throw conflict('This email already has a PayFlow account. Use its password to add another organization.');
  }
  const sample = body.start === 'sample';
  const organization = await createOrganization(
    db,
    {
      name: body.organizationName,
      isSample: sample,
      sampleSize: sample ? SAMPLE_COMPANY_SIZE : null,
      sampleHistory: sample,
    },
    body.branches,
    body.payGroups,
  );
  const owner = identity
    ? await addMembership(db, { organizationId: organization.id, identityId: identity.id, role: 'admin' })
    : await createAccount(db, {
        organizationId: organization.id,
        username: body.email,
        displayName: body.adminName,
        password: body.password,
        role: 'admin',
      });
  await db.update(organizations).set({ ownerUserId: owner }).where(eq(organizations.id, organization.id));
  if (sample) await populateSample(db, organization.id, { size: SAMPLE_COMPANY_SIZE, history: true });
  return {
    token: await startSession(db, owner),
    user: toUser(await findPrincipal(db, owner)),
    organization: publicOrganization(await getOrganization(db, organization.id)),
  };
}

/** Generates sample people and runs, creating any missing built-in role accounts and linking EMP00001. */
async function populateSample(db: Db, organizationId: string, options: { size: number; history: boolean }) {
  const organization = await getOrganization(db, organizationId);
  const existing = await db
    .select({ id: appUsers.id, role: appUsers.role })
    .from(appUsers)
    .where(and(eq(appUsers.organizationId, organizationId), eq(appUsers.builtIn, true)));
  const accounts = new Map(existing.map(account => [account.role as Role, account.id]));
  const missing = SAMPLE_ROLES.filter(role => !accounts.has(role));
  if (missing.length) {
    const suffix = organizationId.slice(0, 8);
    const created = await createSampleAccounts(
      db,
      organizationId,
      role => `${SHORT_ROLE[role]}.${suffix}@sample.payflow`,
      missing,
      undefined,
      'Sample account',
    );
    for (const [role, id] of created) accounts.set(role, id);
  }
  const employeeOne = await seedSampleCompany(db, organizationId, {
    ...options,
    branches: organization.branches,
    payGroups: organization.payGroups,
    emailDomain: `${slug(organization.name)}.example`,
    actors: { preparer: accounts.get('payroll-operator')!, approver: accounts.get('finance-approver')! },
  });
  await db
    .update(appUsers)
    .set({ employeeId: employeeOne })
    .where(eq(appUsers.id, accounts.get('employee')!));
}

/** Roles this account may switch to: sample companies only, and only for the owner or built-in accounts. */
async function viewAsRoles(db: Db, principal: Principal, organization: OrganizationRow): Promise<Role[]> {
  if (!organization.isSample || !(principal.builtIn || principal.id === organization.ownerUserId)) return [];
  const accounts = await db
    .select({ role: appUsers.role })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.organizationId, organization.id),
        eq(appUsers.active, true),
        or(
          eq(appUsers.builtIn, true),
          organization.ownerUserId ? eq(appUsers.id, organization.ownerUserId) : undefined,
        ),
      ),
    );
  const roles = new Set(accounts.map(account => account.role as Role));
  return (['admin', ...SAMPLE_ROLES] as Role[]).filter(role => roles.has(role));
}

export async function bootstrap(db: Db, principal: Principal): Promise<Bootstrap> {
  const organization = await getOrganization(db, principal.organizationId);
  const run = await latestRun(db, principal.organizationId);
  return {
    organization: publicOrganization(organization),
    currentRun: run ? (can(principal.role, 'runs.read') ? await summarize(db, run) : await toPeriod(db, run)) : null,
    viewAsRoles: await viewAsRoles(db, principal, organization.row),
    organizations: await organizationsOf(db, principal.identityId),
  };
}

/** Starts a session as the sample company's account for `role` (audited by the caller). */
export async function viewAs(db: Db, principal: Principal, role: Role) {
  const organization = await getOrganization(db, principal.organizationId);
  if (!(await viewAsRoles(db, principal, organization.row)).includes(role)) {
    throw forbidden('Role switching is only available in sample companies');
  }
  const owner = organization.row.ownerUserId;
  const [target] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.organizationId, organization.id),
        eq(appUsers.role, role),
        eq(appUsers.active, true),
        role === 'admin' && owner ? eq(appUsers.id, owner) : eq(appUsers.builtIn, true),
      ),
    )
    .limit(1);
  if (!target) throw notFound('No account for that role');
  return { token: await startSession(db, target.id), user: toUser(await findPrincipal(db, target.id)) };
}

export async function addBranch(db: Db, organizationId: string, branch: { name: string; state: string }) {
  try {
    const [created] = await db
      .insert(branches)
      .values({ organizationId, ...branch })
      .returning({ id: branches.id, name: branches.name, state: branches.state });
    return created;
  } catch {
    throw conflict('A branch with this name already exists');
  }
}

export async function addPayGroup(db: Db, organizationId: string, name: string) {
  try {
    const [created] = await db
      .insert(payGroups)
      .values({ organizationId, name })
      .returning({ id: payGroups.id, name: payGroups.name });
    return created;
  } catch {
    throw conflict('A pay group with this name already exists');
  }
}

/**
 * Regenerates a sample company: people, salaries and runs are rebuilt; the owner and built-in accounts
 * stay; accounts invited into the sample are removed.
 */
export async function resetSample(db: Db, organizationId: string): Promise<void> {
  const organization = await getOrganization(db, organizationId);
  if (!organization.isSample) throw badRequest('Only sample companies can be reset');
  const keep = [organization.row.ownerUserId].filter((id): id is string => Boolean(id));
  await db.transaction(async tx => {
    const removable = await tx
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(
        and(
          eq(appUsers.organizationId, organizationId),
          eq(appUsers.builtIn, false),
          keep.length ? ne(appUsers.id, keep[0]) : undefined,
        ),
      );
    await deleteMemberships(
      tx,
      removable.map(user => user.id),
    );
    await tx.delete(notifications).where(eq(notifications.organizationId, organizationId));
    await tx
      .update(appUsers)
      .set({ employeeId: null })
      .where(and(eq(appUsers.organizationId, organizationId), isNotNull(appUsers.employeeId)));
    await tx.delete(invitations).where(eq(invitations.organizationId, organizationId));
    await tx.delete(payrollLines).where(eq(payrollLines.organizationId, organizationId));
    await tx.delete(payrollInputs).where(eq(payrollInputs.organizationId, organizationId));
    await tx.delete(payrollRuns).where(eq(payrollRuns.organizationId, organizationId));
    await tx.delete(salaryRevisions).where(eq(salaryRevisions.organizationId, organizationId));
    await tx.delete(leaveRequests).where(eq(leaveRequests.organizationId, organizationId));
    await tx.delete(leaveBalances).where(eq(leaveBalances.organizationId, organizationId));
    await tx.delete(taxDeclarations).where(eq(taxDeclarations.organizationId, organizationId));
    await tx.delete(employees).where(eq(employees.organizationId, organizationId));
  });
  await populateSample(db, organizationId, {
    size: organization.row.sampleSize ?? SAMPLE_COMPANY_SIZE,
    history: organization.row.sampleHistory,
  });
}

export async function complianceRules(db: Db, organizationId: string): Promise<ComplianceRules> {
  const { branches: orgBranches } = await getOrganization(db, organizationId);
  const states = [...new Set(orgBranches.map(branch => branch.state))].sort();
  return {
    ruleVersion: RULE_VERSION,
    reviewedTaxYear: REVIEWED_TAX_YEAR.label,
    states: states.map(state => ({ state, ...STATE_RULE_SUMMARIES[state] })),
  };
}

export const DEMO_TENANT = { name: 'Aster Group' };
const DEMO_BRANCHES = [
  { name: 'Bengaluru', state: 'Karnataka' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Gurugram', state: 'Haryana' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Mumbai', state: 'Maharashtra' },
];

/**
 * Creates the built-in "Aster Group" demo tenant once: a large sample company (no history, to stay fast to
 * seed) with six accounts that have their own passwords, written to a private local file.
 */
export async function ensureDemoTenant(
  db: Db,
  options: { size: number; password?: string; credentialFile?: string },
): Promise<boolean> {
  const [done] = await db.select().from(appMeta).where(eq(appMeta.key, 'demo_tenant'));
  if (done) return false;
  const organization = await createOrganization(
    db,
    { name: DEMO_TENANT.name, isSample: true, sampleSize: options.size, sampleHistory: false },
    DEMO_BRANCHES,
    ['General', 'Operations'],
  );
  const roles: Role[] = ['admin', ...SAMPLE_ROLES];
  const passwords = new Map(roles.map(role => [role, options.password ?? randomPassword()]));
  const ids = await createSampleAccounts(db, organization.id, role => SHORT_ROLE[role], roles, passwords);
  await db
    .update(organizations)
    .set({ ownerUserId: ids.get('admin')! })
    .where(eq(organizations.id, organization.id));
  await populateSample(db, organization.id, { size: options.size, history: false });
  await db.insert(appMeta).values({ key: 'demo_tenant', value: organization.id });
  if (options.credentialFile) {
    const note = [
      'PAYFLOW - SYNTHETIC DEMO CREDENTIALS (Aster Group)',
      'Each built-in account has its own password. Keep this file private. Do not use real payroll data.',
      '',
      ...roles.map(role => `${SHORT_ROLE[role]}\t${passwords.get(role)}\t${role}`),
      '',
    ].join('\n');
    await writeFile(options.credentialFile, note, { mode: 0o600 });
  }
  return true;
}

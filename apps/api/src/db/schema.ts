import type { PayrollLine, TaxDeclaration } from '@payflow/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Money columns hold integer paise. */
const money = (name: string) => bigint(name, { mode: 'number' });
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const id = () => uuid('id').primaryKey().defaultRandom();
/** Every business table belongs to exactly one organization; all queries are scoped by it. */
const organizationId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  isSample: boolean('is_sample').notNull().default(false),
  /** How the sample company was generated, so a reset can regenerate it. */
  sampleSize: integer('sample_size'),
  sampleHistory: boolean('sample_history').notNull().default(false),
  /** The account that created the organization; it may use the sample "View as" switcher. */
  ownerUserId: uuid('owner_user_id'),
  createdAt: createdAt(),
});

export const branches = pgTable(
  'branches',
  { id: id(), organizationId: organizationId(), name: text('name').notNull(), state: text('state').notNull() },
  table => [uniqueIndex('branches_name_unique').on(table.organizationId, table.name)],
);

export const payGroups = pgTable(
  'pay_groups',
  { id: id(), organizationId: organizationId(), name: text('name').notNull() },
  table => [uniqueIndex('pay_groups_name_unique').on(table.organizationId, table.name)],
);

export const employees = pgTable(
  'employees',
  {
    id: id(),
    organizationId: organizationId(),
    /** Human-facing employee code, unique within the organization. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    payGroupId: uuid('pay_group_id')
      .notNull()
      .references(() => payGroups.id),
    joinDate: date('join_date', { mode: 'string' }).notNull(),
    exitDate: date('exit_date', { mode: 'string' }),
    exitReason: text('exit_reason'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    gender: text('gender'),
    bankAccountLast4: text('bank_account_last4'),
    bankReady: boolean('bank_ready').notNull().default(false),
    /** Current salary, kept equal to the latest salary revision. */
    monthlyBasic: money('monthly_basic').notNull(),
    monthlyHra: money('monthly_hra').notNull(),
    monthlySpecial: money('monthly_special').notNull(),
    taxRegime: text('tax_regime').notNull().default('new'),
    annualOtherIncome: money('annual_other_income').notNull().default(0),
    annualPriorEmployerTaxableSalary: money('annual_prior_employer_taxable_salary').notNull().default(0),
    pfMember: boolean('pf_member').notNull().default(true),
    pfOnActualWages: boolean('pf_on_actual_wages').notNull().default(false),
    epsMember: boolean('eps_member').notNull().default(false),
    esiMember: boolean('esi_member').notNull().default(false),
    employmentType: text('employment_type').notNull(),
    positionLevel: integer('position_level').notNull(),
    jobTitle: text('job_title').notNull(),
    department: text('department').notNull(),
    managerId: uuid('manager_id'),
    workEmail: text('work_email'),
    phone: text('phone'),
    employmentStatus: text('employment_status').notNull().default('active'),
    payrollScope: boolean('payroll_scope').notNull().default(true),
  },
  table => [
    uniqueIndex('employees_code_unique').on(table.organizationId, table.code),
    index('employees_hierarchy_idx').on(
      table.organizationId,
      table.employmentType,
      table.positionLevel,
      table.department,
    ),
    index('employees_manager_idx').on(table.managerId),
  ],
);

/** Effective-dated salary history. Revisions start on the first day of a month. */
export const salaryRevisions = pgTable(
  'salary_revisions',
  {
    id: id(),
    organizationId: organizationId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    monthlyBasic: money('monthly_basic').notNull(),
    monthlyHra: money('monthly_hra').notNull(),
    monthlySpecial: money('monthly_special').notNull(),
    reason: text('reason'),
    createdBy: text('created_by'),
    createdAt: createdAt(),
  },
  table => [uniqueIndex('salary_revisions_unique').on(table.employeeId, table.effectiveFrom)],
);

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: id(),
    organizationId: organizationId(),
    /** Null when the run covers every pay group. */
    payGroupId: uuid('pay_group_id').references(() => payGroups.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    paymentDate: date('payment_date', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('draft'),
    preparedBy: text('prepared_by'),
    approvedBy: text('approved_by'),
    approvedAt: timestamptz('approved_at'),
    rejectionNote: text('rejection_note'),
    paidAt: timestamptz('paid_at'),
    closedAt: timestamptz('closed_at'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  table => [index('payroll_runs_period_idx').on(table.organizationId, table.year, table.month)],
);

export const payrollInputs = pgTable(
  'payroll_inputs',
  {
    organizationId: organizationId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    variablePay: money('variable_pay').notNull().default(0),
    otherDeduction: money('other_deduction').notNull().default(0),
    unpaidDays: integer('unpaid_days').notNull().default(0),
    workingDays: integer('working_days').notNull().default(30),
    note: text('note'),
  },
  table => [primaryKey({ columns: [table.runId, table.employeeId] })],
);

export const payrollLines = pgTable(
  'payroll_lines',
  {
    organizationId: organizationId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    gross: money('gross').notNull(),
    deductions: money('deductions').notNull(),
    net: money('net').notNull(),
    incomeTax: money('income_tax').notNull().default(0),
    employerCost: money('employer_cost').notNull(),
    blockingFlags: integer('blocking_flags').notNull().default(0),
    warningFlags: integer('warning_flags').notNull().default(0),
    result: jsonb('result').$type<PayrollLine>().notNull(),
  },
  table => [
    primaryKey({ columns: [table.runId, table.employeeId] }),
    index('payroll_lines_employee_idx').on(table.employeeId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    runId: uuid('run_id'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  table => [index('audit_events_org_idx').on(table.organizationId, table.runId)],
);

/** A person who signs in. One identity can belong to several organizations through memberships. */
export const identities = pgTable('identities', {
  id: id(),
  /** Sign-in identifier, unique across the service: an email address or a built-in demo username. */
  username: text('username').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: createdAt(),
});

/** Membership of an identity in one organization, with its role there. Sessions belong to a membership. */
export const appUsers = pgTable(
  'app_users',
  {
    id: id(),
    organizationId: organizationId(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    role: text('role').notNull(),
    employeeId: uuid('employee_id').references(() => employees.id),
    active: boolean('active').notNull().default(true),
    /** Generated with a sample company; cannot be removed and is reachable through "View as". */
    builtIn: boolean('built_in').notNull().default(false),
    createdAt: createdAt(),
  },
  table => [
    uniqueIndex('app_users_membership_unique').on(table.organizationId, table.identityId),
    uniqueIndex('one_active_employee_account')
      .on(table.employeeId)
      .where(sql`${table.role} = 'employee' AND ${table.active} = true AND ${table.employeeId} IS NOT NULL`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: createdAt(),
  },
  table => [index('auth_sessions_user_idx').on(table.userId)],
);

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    organizationId: organizationId(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    employeeId: uuid('employee_id').references(() => employees.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
  },
  table => [index('invitations_org_idx').on(table.organizationId)],
);

/** An employee's tax declaration for one tax year (Form 124), used for old-regime TDS. */
export const taxDeclarations = pgTable(
  'tax_declarations',
  {
    id: id(),
    organizationId: organizationId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    /** Calendar year the tax year starts in: 2026 for April 2026 – March 2027. */
    taxYear: integer('tax_year').notNull(),
    data: jsonb('data').$type<TaxDeclaration & { landlordRelation: string | null }>().notNull(),
    status: text('status').notNull().default('submitted'),
    submittedAt: timestamptz('submitted_at').notNull().defaultNow(),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamptz('verified_at'),
  },
  table => [uniqueIndex('tax_declarations_year_unique').on(table.employeeId, table.taxYear)],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    organizationId: organizationId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    type: text('type').notNull(),
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }).notNull(),
    /** Leave days in the request, not counting Sundays. */
    days: integer('days').notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('pending'),
    decidedBy: text('decided_by'),
    decidedAt: timestamptz('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
  },
  table => [
    index('leave_requests_org_idx').on(table.organizationId, table.status),
    index('leave_requests_employee_idx').on(table.employeeId, table.fromDate),
  ],
);

/** Earned leave carried forward into a calendar year (at most 30 days). */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    organizationId: organizationId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    year: integer('year').notNull(),
    carriedForward: integer('carried_forward').notNull().default(0),
  },
  table => [primaryKey({ columns: [table.employeeId, table.year] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    organizationId: organizationId(),
    /** The membership the notification is for. */
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamptz('read_at'),
    createdAt: createdAt(),
  },
  table => [index('notifications_user_idx').on(table.userId, table.id)],
);

/** Key-value facts about this installation, such as whether the built-in demo tenant was created. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

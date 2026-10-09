import type { PayrollLine } from '@payflow/core';
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
} from 'drizzle-orm/pg-core';

/** Money columns hold integer paise. */
const money = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow();

export const employees = pgTable(
  'employees',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    branch: text('branch').notNull(),
    state: text('state').notNull(),
    payGroup: text('pay_group').notNull().default('General'),
    joinDate: date('join_date', { mode: 'string' }).notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    gender: text('gender'),
    bankAccountLast4: text('bank_account_last4'),
    bankReady: boolean('bank_ready').notNull().default(false),
    monthlyBasic: money('monthly_basic').notNull(),
    monthlyHra: money('monthly_hra').notNull(),
    monthlySpecial: money('monthly_special').notNull(),
    taxRegime: text('tax_regime').notNull().default('new'),
    oldRegimeAnnualDeductions: money('old_regime_annual_deductions').notNull().default(0),
    annualOtherIncome: money('annual_other_income').notNull().default(0),
    annualPriorEmployerTaxableSalary: money('annual_prior_employer_taxable_salary').notNull().default(0),
    taxAlreadyDeducted: money('tax_already_deducted').notNull().default(0),
    pfMember: boolean('pf_member').notNull().default(true),
    pfOnActualWages: boolean('pf_on_actual_wages').notNull().default(false),
    epsMember: boolean('eps_member').notNull().default(false),
    esiMember: boolean('esi_member').notNull().default(false),
    employmentType: text('employment_type').notNull(),
    positionLevel: integer('position_level').notNull(),
    jobTitle: text('job_title').notNull(),
    department: text('department').notNull(),
    managerId: text('manager_id'),
    workEmail: text('work_email'),
    phone: text('phone'),
    employmentStatus: text('employment_status').notNull().default('active'),
    payrollScope: boolean('payroll_scope').notNull().default(true),
    leaveBalanceDays: integer('leave_balance_days').notNull().default(0),
    leaveTakenDays: integer('leave_taken_days').notNull().default(0),
  },
  table => [
    index('employees_hierarchy_idx').on(table.employmentType, table.positionLevel, table.department),
    index('employees_manager_idx').on(table.managerId),
  ],
);

export const payrollRuns = pgTable('payroll_runs', {
  id: text('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  paymentDate: date('payment_date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('draft'),
  preparedBy: text('prepared_by'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const payrollInputs = pgTable(
  'payroll_inputs',
  {
    runId: text('run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: text('employee_id')
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
    runId: text('run_id')
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    gross: money('gross').notNull(),
    deductions: money('deductions').notNull(),
    net: money('net').notNull(),
    employerCost: money('employer_cost').notNull(),
    blockingFlags: integer('blocking_flags').notNull().default(0),
    warningFlags: integer('warning_flags').notNull().default(0),
    result: jsonb('result').$type<PayrollLine>().notNull(),
  },
  table => [primaryKey({ columns: [table.runId, table.employeeId] })],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: text('run_id'),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  table => [index('audit_events_run_idx').on(table.runId)],
);

export const appUsers = pgTable(
  'app_users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    role: text('role').notNull(),
    employeeId: text('employee_id').references(() => employees.id),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    builtIn: boolean('built_in').notNull().default(false),
    createdAt: createdAt(),
  },
  table => [
    uniqueIndex('one_active_employee_account')
      .on(table.employeeId)
      .where(sql`${table.role} = 'employee' AND ${table.active} = true AND ${table.employeeId} IS NOT NULL`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => appUsers.id),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  table => [index('auth_sessions_user_idx').on(table.userId)],
);

/** Key-value facts about this installation, such as the size of the seeded demo company. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

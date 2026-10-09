import { z } from 'zod';
import { EMPLOYMENT_TYPES, GENDERS, REPORT_KINDS, SUPPORTED_WORK_STATES, TAX_REGIMES } from './constants.js';
import { ROLES } from './roles.js';

export const isoDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid date (YYYY-MM-DD)');
const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const id = z.string().uuid('Use a valid identifier');
const optionalText = (max: number) =>
  z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().default(null),
  );
const nullableEmail = z.preprocess(value => (value === '' ? null : value), z.email().max(120).nullable());
const nullablePhone = z.preprocess(
  value => (value === '' ? null : value),
  z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must have 10–15 digits')
    .nullable(),
);
/** Sign-in identifiers are email addresses (or the short built-in demo usernames). */
export const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._+@-]{2,120}$/, 'Use an email address');
export const emailSchema = z.email('Use a valid email address').trim().toLowerCase().max(120);
export const employeeIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^EMP\d{5}$/, 'Use an employee ID like EMP00001');
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(256);
export const stateSchema = z
  .string()
  .refine(state => SUPPORTED_WORK_STATES.includes(state), 'Choose a state with a reviewed rule pack');

// Organizations and onboarding
export const branchBody = z.object({ name: z.string().trim().min(2).max(60), state: stateSchema });
export const payGroupBody = z.object({ name: z.string().trim().min(2).max(60) });
export const signupBody = z
  .object({
    organizationName: z.string().trim().min(2).max(120),
    adminName: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    branches: z.array(branchBody).min(1, 'Add at least one branch').max(20),
    payGroups: z.array(z.string().trim().min(2).max(60)).min(1).max(10).default(['General']),
    start: z.enum(['empty', 'sample']),
  })
  .refine(body => new Set(body.branches.map(branch => branch.name.toLowerCase())).size === body.branches.length, {
    message: 'Branch names must be different',
    path: ['branches'],
  });
export const viewAsBody = z.object({ role: z.enum(ROLES) });

// Auth and accounts
export const loginBody = z.object({ username: z.string().max(120), password: z.string().min(1).max(256) });
export const changePasswordBody = z.object({ currentPassword: z.string().max(256), newPassword: passwordSchema });
export const inviteBody = z
  .object({
    email: emailSchema,
    role: z.enum(ROLES),
    employeeId: employeeIdSchema.optional(),
  })
  .refine(body => (body.role === 'employee') === Boolean(body.employeeId), {
    message: 'Employee access needs a linked employee ID; other roles must not have one',
    path: ['employeeId'],
  });
export const acceptInviteBody = z.object({
  token: z.string().min(20).max(100),
  displayName: z.string().trim().min(2).max(120),
  password: passwordSchema,
});

// Employees
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(''),
};
export const employeeListQuery = z.object({
  ...pageQuery,
  state: z.string().max(60).default(''),
  employmentType: z.union([z.enum(EMPLOYMENT_TYPES), z.literal('')]).default(''),
  level: z.coerce.number().int().min(0).max(8).default(0),
  department: z.string().max(80).default(''),
  payrollScope: z.enum(['', 'true', 'false']).default(''),
  status: z.enum(['active', 'exited', 'all']).default('active'),
});
export const managersQuery = z.object({
  level: z.coerce.number().int().min(1).max(8).default(1),
  search: z.string().trim().max(100).default(''),
});
export const createEmployeeBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    positionLevel: z.number().int().min(1).max(8),
    jobTitle: z.string().trim().min(1).max(100),
    department: z.string().trim().min(1).max(80),
    branchId: id,
    payGroupId: id,
    joinDate: isoDate,
    dateOfBirth: isoDate,
    managerId: employeeIdSchema.nullable().default(null),
    gender: z.enum(GENDERS).nullable().default(null),
    workEmail: nullableEmail.default(null),
    phone: nullablePhone.default(null),
    monthlyBasic: paise,
    monthlyHra: paise,
    monthlySpecial: paise,
    leaveBalanceDays: z.number().int().min(0).max(365).default(0),
    pfMember: z.boolean().default(false),
    esiMember: z.boolean().default(false),
  })
  .refine(body => body.dateOfBirth < body.joinDate, {
    message: 'Date of birth must be before the join date',
    path: ['dateOfBirth'],
  });
/** HR edits work details and bank status; employees may only send `taxRegime` for themselves. */
export const updateEmployeeBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    department: z.string().trim().min(1).max(80).optional(),
    branchId: id.optional(),
    payGroupId: id.optional(),
    managerId: employeeIdSchema.nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    workEmail: nullableEmail.optional(),
    phone: nullablePhone.optional(),
    pfMember: z.boolean().optional(),
    esiMember: z.boolean().optional(),
    bankReady: z.boolean().optional(),
    bankAccountLast4: z
      .string()
      .regex(/^\d{4}$/, 'Enter exactly four bank account ending digits')
      .optional(),
    taxRegime: z.enum(TAX_REGIMES).optional(),
  })
  .strict();
export const salaryRevisionBody = z.object({
  effectiveFrom: isoDate.refine(date => date.endsWith('-01'), 'Revisions take effect on the first day of a month'),
  monthlyBasic: paise.refine(value => value > 0, 'Basic pay is required'),
  monthlyHra: paise,
  monthlySpecial: paise,
  reason: optionalText(200),
});
export const exitBody = z.object({ exitDate: isoDate, reason: optionalText(200) });

// Payroll runs
export const createRunBody = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  paymentDate: isoDate,
  payGroupId: id.nullable().default(null),
});
export const lineListQuery = z.object({ ...pageQuery, exception: z.enum(['true', 'false']).default('false') });
export const csvBody = z.object({ csv: z.string().max(8 * 1024 * 1024) });
export const approveBody = z.object({ note: optionalText(500) });
export const rejectBody = z.object({ note: z.string().trim().min(3, 'Explain what needs to change').max(500) });
export const reportKindParam = z.enum(REPORT_KINDS);

export type SignupBody = z.input<typeof signupBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type InviteBody = z.infer<typeof inviteBody>;
export type EmployeeListQuery = z.infer<typeof employeeListQuery>;
export type CreateEmployeeBody = z.input<typeof createEmployeeBody>;
export type CreateEmployeeInput = z.output<typeof createEmployeeBody>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBody>;
export type SalaryRevisionBody = z.input<typeof salaryRevisionBody>;
export type CreateRunBody = z.input<typeof createRunBody>;
export type LineListQuery = z.infer<typeof lineListQuery>;

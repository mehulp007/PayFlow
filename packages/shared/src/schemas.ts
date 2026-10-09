import { z } from 'zod';
import { EMPLOYMENT_TYPES, GENDERS, REPORT_KINDS, TAX_REGIMES } from './constants.js';
import { ROLES } from './roles.js';

const isoDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid date (YYYY-MM-DD)');
const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalText = (max: number) =>
  z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().default(null),
  );
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,64}$/, 'Username must be 2–64 letters, digits, dots, hyphens or underscores');
export const employeeIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^EMP\d{5}$/, 'Use an employee ID like EMP00001');
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(256);

// Auth and accounts
export const loginBody = z.object({ username: z.string().max(64), password: z.string().min(1).max(256) });
export const changePasswordBody = z.object({ currentPassword: z.string().max(256), newPassword: passwordSchema });
export const createUserBody = z
  .object({
    username: usernameSchema,
    role: z.enum(ROLES),
    employeeId: employeeIdSchema.optional(),
  })
  .refine(body => (body.role === 'employee') === Boolean(body.employeeId), {
    message: 'Employee access needs a linked employee ID; other roles must not have one',
    path: ['employeeId'],
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
    branch: z.string().trim().min(1),
    state: z.string().trim().min(1),
    joinDate: isoDate,
    dateOfBirth: isoDate,
    managerId: employeeIdSchema.nullable().default(null),
    gender: z.enum(GENDERS).nullable().default(null),
    workEmail: z.preprocess(value => (value === '' ? null : value), z.email().max(120).nullable().default(null)),
    phone: z.preprocess(
      value => (value === '' ? null : value),
      z
        .string()
        .regex(/^\+?[0-9]{10,15}$/, 'Phone must have 10–15 digits')
        .nullable()
        .default(null),
    ),
    payGroup: z.string().trim().min(1).max(80).default('General'),
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
export const updateEmployeeBody = z
  .object({
    bankReady: z.boolean().optional(),
    bankAccountLast4: z
      .string()
      .regex(/^\d{4}$/, 'Enter exactly four bank account ending digits')
      .optional(),
    taxRegime: z.enum(TAX_REGIMES).optional(),
  })
  .strict();

// Payroll runs
export const lineListQuery = z.object({ ...pageQuery, exception: z.enum(['true', 'false']).default('false') });
export const csvBody = z.object({ csv: z.string().max(8 * 1024 * 1024) });
export const approveBody = z.object({ note: optionalText(500) });
export const reportKindParam = z.enum(REPORT_KINDS);

export type LoginBody = z.infer<typeof loginBody>;
export type CreateUserBody = z.infer<typeof createUserBody>;
export type EmployeeListQuery = z.infer<typeof employeeListQuery>;
export type CreateEmployeeBody = z.input<typeof createEmployeeBody>;
export type CreateEmployeeInput = z.output<typeof createEmployeeBody>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBody>;
export type LineListQuery = z.infer<typeof lineListQuery>;

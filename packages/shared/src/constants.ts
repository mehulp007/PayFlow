import { HRA_METRO_CITIES, SUPPORTED_STATES } from '@payflow/core';

export const EMPLOYMENT_TYPES = ['contractor', 'casual', 'fixed_term', 'probation', 'permanent'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const POSITION_LEVELS = [
  { level: 1, label: 'Associate' },
  { level: 2, label: 'Senior Associate' },
  { level: 3, label: 'Supervisor' },
  { level: 4, label: 'Manager' },
  { level: 5, label: 'Senior Manager' },
  { level: 6, label: 'Director' },
  { level: 7, label: 'Vice President' },
  { level: 8, label: 'Managing Director' },
] as const;
export const TOP_POSITION_LEVEL = 8;

/** States with a reviewed professional tax and labour welfare rule pack. Branches must be in one of these. */
export const SUPPORTED_WORK_STATES: readonly string[] = SUPPORTED_STATES;
/** Suggested branches for the onboarding wizard and the sample company: one city per supported state. */
export const DEFAULT_BRANCHES = [
  { name: 'Bengaluru', state: 'Karnataka' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Gurugram', state: 'Haryana' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Mumbai', state: 'Maharashtra' },
] as const;

export const GENDERS = ['female', 'male', 'other'] as const;
export const TAX_REGIMES = ['new', 'old'] as const;

/**
 * Run lifecycle. Finance may send a submitted run back to "calculated" with a note. Lines are frozen from
 * approval onwards; a closed run is final.
 */
export const RUN_STATUSES = ['draft', 'calculated', 'approval_pending', 'approved', 'paid', 'closed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** Statuses after Finance approval, when payslips and the bank file become available. */
export const APPROVED_STATUSES: readonly RunStatus[] = ['approved', 'paid', 'closed'];
export const EDITABLE_STATUSES: readonly RunStatus[] = ['draft', 'calculated'];

export const REPORT_KINDS = [
  'salary-register',
  'bank-demo',
  'epf-prep',
  'esi-prep',
  'form138-prep',
  'state-deductions',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const IMPORT_COLUMNS = [
  'employee_id',
  'variable_pay',
  'other_deduction',
  'unpaid_days',
  'working_days',
] as const;

export const SAMPLE_COMPANY_SIZE = 240;
export const INVITATION_DAYS = 7;

/** Cities where the HRA exemption may reach 50% of basic pay (Income-tax Rules, 2026, rule 279). */
export const HRA_CITIES: readonly string[] = HRA_METRO_CITIES;
export const DECLARATION_STATUSES = ['submitted', 'verified'] as const;
export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

export const LEAVE_TYPES = ['earned', 'sick', 'unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
/** Sick and casual leave a year, pro-rated by month for joiners. State shops and establishments rules vary. */
export const SICK_LEAVE_DAYS = 12;
export const LEAVE_TYPE_DETAILS: Record<LeaveType, { label: string; paid: boolean; rule: string }> = {
  earned: {
    label: 'Earned leave',
    paid: true,
    rule: 'OSH Code s. 32: one day for every 20 days worked last year, once 180 days are worked; up to 30 days carry forward',
  },
  sick: {
    label: 'Sick and casual leave',
    paid: true,
    rule: `${SICK_LEAVE_DAYS} days a year, pro-rated for joiners; state shops and establishments rules may differ`,
  },
  unpaid: {
    label: 'Leave without pay',
    paid: false,
    rule: 'Approved days are deducted as loss of pay in that month’s payroll run',
  },
};
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

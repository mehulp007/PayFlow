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

export const BRANCHES = [
  { branch: 'Bengaluru', state: 'Karnataka' },
  { branch: 'Chennai', state: 'Tamil Nadu' },
  { branch: 'Gurugram', state: 'Haryana' },
  { branch: 'Kolkata', state: 'West Bengal' },
  { branch: 'Mumbai', state: 'Maharashtra' },
] as const;

export const GENDERS = ['female', 'male', 'other'] as const;
export const TAX_REGIMES = ['new', 'old'] as const;

export const RUN_STATUSES = ['draft', 'calculated', 'approval_pending', 'approved', 'reconciled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
/** Statuses after Finance approval, when payslips and the bank file become available. */
export const APPROVED_STATUSES: readonly RunStatus[] = ['approved', 'reconciled'];

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

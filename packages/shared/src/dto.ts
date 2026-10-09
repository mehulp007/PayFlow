import type {
  DeductionLine,
  Gender,
  PayrollFlag,
  PayrollLine,
  RegimeComparison,
  RegimeResult,
  TaxDeclaration,
  TaxRegime,
} from '@payflow/core';
import type { DeclarationStatus, EmploymentType, LeaveStatus, LeaveType, RunStatus } from './constants.js';
import type { Role } from './roles.js';

export type {
  DeductionLine,
  Gender,
  PayrollFlag,
  PayrollLine,
  RegimeComparison,
  RegimeResult,
  TaxDeclaration,
  TaxRegime,
};

export interface User {
  id: string;
  /** Sign-in identifier: an email address, or a short built-in demo username. */
  username: string;
  displayName: string | null;
  role: Role;
  /** The linked employee's code (EMP00001) for employee accounts. */
  employeeId: string | null;
  mustChangePassword: boolean;
  /** Generated with a sample company; reachable through "View as" and never removable. */
  builtIn: boolean;
}
export interface LoginResult {
  token: string;
  user: User;
}

export interface Branch {
  id: string;
  name: string;
  state: string;
}
export interface PayGroup {
  id: string;
  name: string;
}
export interface Organization {
  id: string;
  name: string;
  /** Sample companies hold generated people and offer the "View as" role switcher. */
  isSample: boolean;
  branches: Branch[];
  payGroups: PayGroup[];
}

export interface Page<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}

export interface Employee {
  /** Employee code, unique within the organization (EMP00001). */
  id: string;
  name: string;
  branchId: string;
  branch: string;
  state: string;
  payGroupId: string;
  payGroup: string;
  joinDate: string;
  exitDate: string | null;
  dateOfBirth: string;
  gender: Gender | null;
  bankAccountLast4: string | null;
  bankReady: boolean;
  monthlyBasic: number;
  monthlyHra: number;
  monthlySpecial: number;
  taxRegime: TaxRegime;
  pfMember: boolean;
  pfOnActualWages: boolean;
  epsMember: boolean;
  esiMember: boolean;
  employmentType: EmploymentType;
  positionLevel: number;
  jobTitle: string;
  department: string;
  managerId: string | null;
  managerName: string | null;
  workEmail: string | null;
  phone: string | null;
  employmentStatus: 'active' | 'exited';
  payrollScope: boolean;
  /** Earned leave still available this calendar year. */
  leaveBalanceDays: number;
  /** Paid leave (earned, sick and casual) approved this calendar year. */
  leaveTakenDays: number;
  /** Attendance in the organization's latest run, including approved leave without pay. */
  workingDays: number | null;
  unpaidDays: number | null;
}
export interface SalaryRevision {
  id: string;
  effectiveFrom: string;
  monthlyBasic: number;
  monthlyHra: number;
  monthlySpecial: number;
  reason: string | null;
  createdAt: string;
}

export interface RunPeriod {
  id: string;
  year: number;
  month: number;
  paymentDate: string;
  status: RunStatus;
  payGroupId: string | null;
  /** "All pay groups" when the run covers everyone. */
  payGroupName: string;
}
export interface RunSummary extends RunPeriod {
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  paidAt: string | null;
  closedAt: string | null;
  version: number;
  totalEmployees: number;
  calculatedEmployees: number;
  gross: number;
  deductions: number;
  net: number;
  employerCost: number;
  blocking: number;
  warnings: number;
}
/** Employees only see the period and status of a run, never organization totals. */
export type RunView = RunSummary | RunPeriod;

/** An organization the signed-in person belongs to, for the organization switcher. */
export interface OrganizationChoice {
  id: string;
  name: string;
  role: Role;
  isSample: boolean;
}

export interface Bootstrap {
  organization: Organization;
  /** Every organization this person can switch to, including the current one. */
  organizations: OrganizationChoice[];
  /** The most recent pay period, or null for a new organization without runs. */
  currentRun: RunView | null;
  /** Roles this user can switch to with "View as" (sample companies only). */
  viewAsRoles: Role[];
}
export interface SignupResult extends LoginResult {
  organization: Organization;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  employeeId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}
export interface CreatedInvitation {
  invitation: Invitation;
  /** One-time token for the invitation link; shown only to the admin who created it. */
  token: string;
}
export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: Role;
  /** The email already has a PayFlow account: the invitee confirms its password instead of choosing one. */
  existingAccount: boolean;
}

export interface RunException extends PayrollFlag {
  employeeId: string;
  name: string;
}
export interface AuditEvent {
  id: number;
  runId: string | null;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}
export interface ImportPreview {
  valid: Array<{
    employeeId: string;
    variablePay: number;
    otherDeduction: number;
    unpaidDays: number;
    workingDays: number;
    note?: string;
  }>;
  errors: Array<{ row: number; message: string }>;
}
export interface Payslip {
  runId: string;
  period: string;
  status: RunStatus;
  line: PayrollLine;
}

export interface HierarchySummary {
  employmentTypes: EmploymentType[];
  positionLevels: Array<{ level: number; label: string }>;
  branches: Branch[];
  payGroups: PayGroup[];
  states: string[];
  departments: string[];
  total: number;
  counts: Array<{ employmentType: EmploymentType; level: number; count: number }>;
}
export interface ManagerOption {
  id: string;
  name: string;
  jobTitle: string;
  positionLevel: number;
}

export interface StateRuleSummary {
  state: string;
  professionalTax: string[];
  labourWelfareFund: string;
}
export interface ComplianceRules {
  ruleVersion: string;
  reviewedTaxYear: string;
  states: StateRuleSummary[];
}

export interface AuditPage extends Page<AuditEvent> {
  /** Everyone who appears in the organization's audit trail, for the actor filter. */
  actors: string[];
}

// Tax declarations and regimes

export interface Declaration extends TaxDeclaration {
  landlordRelation: string | null;
  /** Calendar year the tax year starts in (2026 for 2026-27). */
  taxYear: number;
  status: DeclarationStatus;
  submittedAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}
export interface TaxSummary {
  employeeId: string;
  taxYearLabel: string;
  /** The pay month the projection is made for. */
  period: { year: number; month: number };
  regime: TaxRegime;
  /** The regime is chosen while the current run is a draft. */
  regimeLocked: boolean;
  declaration: Declaration | null;
  comparison: RegimeComparison;
}

// Leave

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}
export interface LeaveBalance {
  type: LeaveType;
  /** Days granted for the year; null for leave without pay, which has no balance. */
  entitled: number | null;
  carriedForward: number;
  taken: number;
  pending: number;
  available: number | null;
}
export interface LeaveSummary {
  employeeId: string;
  year: number;
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  /** Earned leave accrual facts for the year (OSH Code s. 32). */
  earned: { daysWorkedLastYear: number; qualifies: boolean };
}

// Notifications, search and analytics

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  /** In-app path to open, such as /payroll/<id>. */
  link: string | null;
  read: boolean;
  createdAt: string;
}
export interface NotificationFeed {
  unread: number;
  items: AppNotification[];
}
export interface SearchResults {
  people: Array<{ id: string; name: string; jobTitle: string; branch: string; status: 'active' | 'exited' }>;
  runs: Array<{ id: string; year: number; month: number; status: RunStatus; payGroupName: string }>;
}
export interface Analytics {
  /** One point per month with a calculated run, oldest first. */
  trend: Array<{
    year: number;
    month: number;
    status: RunStatus;
    headcount: number;
    gross: number;
    net: number;
    deductions: number;
    employerCost: number;
  }>;
  /** The run the breakdowns describe: the latest month with calculated lines. */
  latest: { runId: string; year: number; month: number; status: RunStatus } | null;
  departments: Array<{ department: string; headcount: number; gross: number; employerCost: number }>;
  /** Statutory amounts in the latest run, employee and employer shares together. */
  statutory: Array<{ label: string; amount: number }>;
  levels: Array<{ level: number; label: string; count: number }>;
  employmentTypes: Array<{ type: EmploymentType; count: number }>;
  /** Largest month-over-month changes in gross pay against the previous month. */
  changes: Array<{ employeeId: string; name: string; department: string; previous: number; current: number }>;
}

export interface ApiError {
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

import type { Gender, PayrollFlag, PayrollLine, TaxRegime } from '@payflow/core';
import type { EmploymentType, RunStatus } from './constants.js';
import type { Role } from './roles.js';

export type { Gender, PayrollFlag, PayrollLine, TaxRegime };

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
  oldRegimeAnnualDeductions: number;
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
  leaveBalanceDays: number;
  leaveTakenDays: number;
  /** Attendance in the organization's latest run. */
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

export interface Bootstrap {
  organization: Organization;
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

export interface ApiError {
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

import type { Gender, PayrollFlag, PayrollLine, TaxRegime } from '@payflow/core';
import type { EmploymentType, RunStatus } from './constants.js';
import type { Role } from './roles.js';

export type { Gender, PayrollFlag, PayrollLine, TaxRegime };

export interface User {
  id: string;
  username: string;
  role: Role;
  employeeId: string | null;
  mustChangePassword: boolean;
}
export interface LoginResult {
  token: string;
  user: User;
}
export interface CreatedUser extends User {
  temporaryPassword: string;
}

export interface Page<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}

export interface Employee {
  id: string;
  name: string;
  branch: string;
  state: string;
  payGroup: string;
  joinDate: string;
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
  employmentStatus: string;
  payrollScope: boolean;
  leaveBalanceDays: number;
  leaveTakenDays: number;
  workingDays: number | null;
  unpaidDays: number | null;
}

export interface RunPeriod {
  id: string;
  year: number;
  month: number;
  paymentDate: string;
  status: RunStatus;
}
export interface RunSummary extends RunPeriod {
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
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
  organization: { name: string; branches: number; mode: string };
  currentRun: RunView;
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
  period: string;
  status: RunStatus;
  line: PayrollLine;
}

export interface HierarchySummary {
  employmentTypes: EmploymentType[];
  positionLevels: Array<{ level: number; label: string }>;
  branches: Array<{ branch: string; state: string }>;
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

export interface ApiError {
  error: string;
  issues?: Array<{ path: string; message: string }>;
}

export const ROLES = ['admin', 'hr-operator', 'payroll-operator', 'finance-approver', 'auditor', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Organization Admin',
  'hr-operator': 'HR Operator',
  'payroll-operator': 'Payroll Operator',
  'finance-approver': 'Finance Approver',
  auditor: 'Auditor',
  employee: 'Employee',
};

const STAFF: Role[] = ['admin', 'hr-operator', 'payroll-operator', 'finance-approver', 'auditor'];
const PREPARERS: Role[] = ['admin', 'hr-operator', 'payroll-operator'];
const PEOPLE_EDITORS: Role[] = ['admin', 'hr-operator'];
const FINANCE: Role[] = ['finance-approver'];

/** Single source of truth for what each role may do, used by the API and to shape the UI. */
export const PERMISSIONS = {
  'employees.read': STAFF,
  'employees.write': PEOPLE_EDITORS,
  /** Approve or reject anyone's leave and verify tax declarations. Managers decide their own team's leave. */
  'leave.manage': PEOPLE_EDITORS,
  'hierarchy.read': STAFF,
  'runs.read': STAFF,
  'runs.create': PREPARERS,
  'runs.prepare': PREPARERS,
  'runs.approve': FINANCE,
  'runs.reject': FINANCE,
  'runs.reconcile': FINANCE,
  'runs.close': ['admin', 'finance-approver'],
  'reports.export': STAFF,
  'audit.read': STAFF,
  'compliance.read': STAFF,
  'users.manage': ['admin'],
  'organization.manage': ['admin'],
} satisfies Record<string, Role[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role != null && (PERMISSIONS[permission] as Role[]).includes(role);
}

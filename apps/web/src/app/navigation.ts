import {
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  FileBarChart2,
  FileText,
  History,
  LayoutDashboard,
  Network,
  Receipt,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { can, type Permission, type Role } from '@payflow/shared';

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to roles with this permission. */
  permission?: Permission;
  /** Extra words the command palette matches. */
  keywords?: string[];
}

const STAFF_NAVIGATION: NavigationItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, keywords: ['home', 'dashboard'] },
  { to: '/people', label: 'People', icon: Users, keywords: ['employees', 'directory'] },
  { to: '/hierarchy', label: 'Hierarchy', icon: Network, keywords: ['org chart', 'managers'] },
  { to: '/compensation', label: 'Compensation', icon: Wallet, keywords: ['salary', 'revisions'] },
  { to: '/payroll', label: 'Payroll Runs', icon: ClipboardList, keywords: ['pay runs', 'periods'] },
  {
    to: '/leave',
    label: 'Leave',
    icon: CalendarCheck2,
    permission: 'leave.manage',
    keywords: ['approvals', 'absence'],
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    permission: 'runs.read',
    keywords: ['charts', 'cost trend'],
  },
  { to: '/compliance', label: 'Taxes & Compliance', icon: ShieldCheck, keywords: ['state rules', 'pt', 'lwf'] },
  { to: '/reports', label: 'Reports', icon: FileBarChart2, keywords: ['exports', 'csv'] },
  { to: '/audit', label: 'Audit log', icon: History, permission: 'audit.read', keywords: ['activity', 'history'] },
  { to: '/settings', label: 'Settings', icon: Settings2, keywords: ['branches', 'accounts', 'invitations'] },
];

const EMPLOYEE_NAVIGATION: NavigationItem[] = [
  { to: '/me', label: 'My payroll', icon: LayoutDashboard, keywords: ['home'] },
  { to: '/me/payslips', label: 'Payslips', icon: Receipt, keywords: ['history', 'pdf'] },
  { to: '/me/tax', label: 'Tax & declarations', icon: FileText, keywords: ['regime', 'form 124', 'hra'] },
  { to: '/me/leave', label: 'Leave', icon: CalendarCheck2, keywords: ['holiday', 'absence', 'team'] },
];

/** The sidebar and command palette pages for a role. */
export function navigationFor(role: Role): NavigationItem[] {
  if (role === 'employee') return EMPLOYEE_NAVIGATION;
  return STAFF_NAVIGATION.filter(item => !item.permission || can(role, item.permission));
}

import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { can, type Permission } from '@payflow/shared';
import { useAuth, useUser } from './AuthProvider';
import { AppShell } from './layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { FirstPasswordPage } from '../features/auth/FirstPasswordPage';
import { SignupPage } from '../features/auth/SignupPage';
import { AcceptInvitePage } from '../features/auth/AcceptInvitePage';
import { RunsPage } from '../features/payroll/RunsPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { PeoplePage } from '../features/people/PeoplePage';
import { HierarchyPage } from '../features/hierarchy/HierarchyPage';
import { PayrollPage } from '../features/payroll/PayrollPage';
import { CompliancePage } from '../features/compliance/CompliancePage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { EmployeePortal } from '../features/portal/EmployeePortal';
import { PortalLeave, PortalPayslips, PortalTax } from '../features/portal/PortalPages';
import { AuditPage } from '../features/audit/AuditPage';
import { LeavePage } from '../features/leave/LeavePage';

/** Charts are the heaviest dependency, so the analytics page is its own bundle. */
const AnalyticsPage = lazy(() =>
  import('../features/analytics/AnalyticsPage').then(module => ({ default: module.AnalyticsPage })),
);

function RequireAuth() {
  const { user, checking } = useAuth();
  if (checking) return <div className="auth-loading">Opening PayFlow…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <FirstPasswordPage />;
  return <Outlet />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="auth-loading">Opening PayFlow…</div>;
  return user ? <Navigate to="/" replace /> : children;
}

/** Employees have their own portal under /me. */
function StaffOnly() {
  return useUser().role === 'employee' ? <Navigate to="/me" replace /> : <Outlet />;
}

/** Pages that need a permission beyond being staff (the API enforces the same rule). */
function Requires({ permission, children }: { permission: Permission; children: ReactNode }) {
  return can(useUser().role, permission) ? children : <Navigate to="/overview" replace />;
}

function HomeRedirect() {
  return <Navigate to={useUser().role === 'employee' ? '/me' : '/overview'} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/signup',
    element: (
      <GuestOnly>
        <SignupPage />
      </GuestOnly>
    ),
  },
  { path: '/invite', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'me', element: <EmployeePortal /> },
          { path: 'me/payslips', element: <PortalPayslips /> },
          { path: 'me/tax', element: <PortalTax /> },
          { path: 'me/leave', element: <PortalLeave /> },
          {
            element: <StaffOnly />,
            children: [
              { path: 'overview', element: <OverviewPage /> },
              { path: 'people', element: <PeoplePage compensation={false} /> },
              { path: 'compensation', element: <PeoplePage compensation /> },
              { path: 'hierarchy', element: <HierarchyPage /> },
              { path: 'payroll', element: <RunsPage /> },
              { path: 'payroll/:runId', element: <PayrollPage /> },
              {
                path: 'leave',
                element: (
                  <Requires permission="leave.manage">
                    <LeavePage />
                  </Requires>
                ),
              },
              {
                path: 'analytics',
                element: (
                  <Requires permission="runs.read">
                    <Suspense fallback={null}>
                      <AnalyticsPage />
                    </Suspense>
                  </Requires>
                ),
              },
              {
                path: 'audit',
                element: (
                  <Requires permission="audit.read">
                    <AuditPage />
                  </Requires>
                ),
              },
              { path: 'compliance', element: <CompliancePage /> },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
          { path: '*', element: <HomeRedirect /> },
        ],
      },
    ],
  },
]);

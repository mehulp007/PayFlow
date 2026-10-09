import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { useAuth, useUser } from './AuthProvider';
import { AppShell } from './layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { FirstPasswordPage } from '../features/auth/FirstPasswordPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { PeoplePage } from '../features/people/PeoplePage';
import { HierarchyPage } from '../features/hierarchy/HierarchyPage';
import { PayrollPage } from '../features/payroll/PayrollPage';
import { CompliancePage } from '../features/compliance/CompliancePage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { EmployeePortal } from '../features/portal/EmployeePortal';

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

/** Employees have one page: their own record and payslip. */
function StaffOnly() {
  return useUser().role === 'employee' ? <Navigate to="/me" replace /> : <Outlet />;
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
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'me', element: <EmployeePortal /> },
          {
            element: <StaffOnly />,
            children: [
              { path: 'overview', element: <OverviewPage /> },
              { path: 'people', element: <PeoplePage compensation={false} /> },
              { path: 'compensation', element: <PeoplePage compensation /> },
              { path: 'hierarchy', element: <HierarchyPage /> },
              { path: 'payroll', element: <PayrollPage /> },
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

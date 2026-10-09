import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  Menu,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS } from '@payflow/shared';
import { useAuth, useUser } from '../AuthProvider';
import { ErrorBanner, useFeedback } from '../FeedbackProvider';
import { useBootstrap } from '../queries';
import { periodLabel } from '../../lib/period';

export const NAVIGATION: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/people', label: 'People', icon: Users },
  { to: '/hierarchy', label: 'Hierarchy', icon: Network },
  { to: '/compensation', label: 'Compensation', icon: Wallet },
  { to: '/payroll', label: 'Payroll Runs', icon: ClipboardList },
  { to: '/compliance', label: 'Taxes & Compliance', icon: ShieldCheck },
  { to: '/reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];
const EMPLOYEE_NAVIGATION = [{ to: '/me', label: 'My payroll', icon: LayoutDashboard }];

export function AppShell() {
  const user = useUser();
  const { signOut } = useAuth();
  const { clearError } = useFeedback();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const bootstrap = useBootstrap();
  const isEmployee = user.role === 'employee';
  const organization = bootstrap.data?.organization;
  const run = bootstrap.data?.currentRun;

  // Each page starts without a stale error from the previous one.
  useEffect(() => {
    clearError();
  }, [pathname, clearError]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-icon">
            <Wallet size={22} />
          </span>
          <div>
            <strong>PayFlow</strong>
            <small>DEMO WORKSPACE</small>
          </div>
        </div>
        <div className="org-switch">
          <span className="org-mark">AG</span>
          <span>
            <strong>{organization?.name ?? 'Aster Group'}</strong>
            <small>One organization · {organization?.branches ?? 5} branches</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {(isEmployee ? EMPLOYEE_NAVIGATION : NAVIGATION).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="demo-dot" />
            Synthetic demo data
            <br />
            <small>Rules reviewed October 2026</small>
          </div>
          {!isEmployee && (
            <button
              className="help-link"
              onClick={() => {
                setMenuOpen(false);
                navigate('/settings');
              }}
            >
              <CircleHelp size={18} /> Setup and guidance
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {isEmployee ? <div className="global-search">Employee self service</div> : <PayrollSearch />}
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={17} /> {run ? periodLabel(run.year, run.month) : '—'}
            </span>
            <button className="icon-button" title="Notifications">
              <Bell size={19} />
            </button>
            <div className="avatar">{user.username.slice(0, 2).toUpperCase()}</div>
            <span className="signed-in-label">
              {user.username} · {ROLE_LABELS[user.role]}
            </span>
            <button className="signout-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        <main className="content">
          <ErrorBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** The topbar search filters the payroll run's employee lines. */
function PayrollSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const value = pathname === '/payroll' ? (params.get('search') ?? '') : '';
  return (
    <div className="global-search">
      <Search size={18} />
      <input
        placeholder="Search employees, payroll, reports..."
        value={value}
        onChange={event =>
          navigate(`/payroll?search=${encodeURIComponent(event.target.value)}`, { replace: pathname === '/payroll' })
        }
      />
      <kbd>Ctrl K</kbd>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { CalendarDays, CircleHelp, Menu, Moon, Search, Sun, Wallet, X } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@payflow/shared';
import { useAuth, useUser } from '../AuthProvider';
import { ErrorBanner, useFeedback } from '../FeedbackProvider';
import { navigationFor } from '../navigation';
import { useBootstrap, useViewAs } from '../queries';
import { useTheme } from '../ThemeProvider';
import { periodLabel } from '../../lib/period';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { OrganizationSwitcher } from './OrganizationSwitcher';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function AppShell() {
  const user = useUser();
  const { signOut, adopt } = useAuth();
  const { clearError, fail } = useFeedback();
  const { theme, toggle } = useTheme();
  const viewAs = useViewAs();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bootstrap = useBootstrap();
  const isEmployee = user.role === 'employee';
  const run = bootstrap.data?.currentRun;
  const viewAsRoles = bootstrap.data?.viewAsRoles ?? [];

  async function switchRole(role: Role) {
    try {
      adopt(await viewAs.mutateAsync(role));
      navigate(role === 'employee' ? '/me' : '/overview');
    } catch (error) {
      fail(error);
    }
  }

  // Each page starts without a stale error from the previous one.
  useEffect(() => {
    clearError();
  }, [pathname, clearError]);

  // Ctrl K (⌘ K on a Mac) opens the command palette from anywhere.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

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
        <OrganizationSwitcher onSwitched={() => setMenuOpen(false)} />
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {navigationFor(user.role).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/me'}
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
            {viewAsRoles.length > 0 && (
              <label className="view-as">
                View this sample as
                <select
                  aria-label="View as role"
                  value={user.role}
                  disabled={viewAs.isPending}
                  onChange={event => switchRole(event.target.value as Role)}
                >
                  {viewAsRoles.map(role => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
          <button className="global-search" onClick={() => setPaletteOpen(true)} aria-label="Search and commands">
            <Search size={18} />
            <span>{isEmployee ? 'Go to payslips, tax or leave…' : 'Search people, pay runs and pages…'}</span>
            <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={17} /> {run ? periodLabel(run.year, run.month) : '—'}
            </span>
            <button
              className="icon-button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <NotificationBell />
            <div className="avatar">{(user.displayName ?? user.username).slice(0, 2).toUpperCase()}</div>
            <span className="signed-in-label">
              {user.displayName ?? user.username} · {ROLE_LABELS[user.role]}
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
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Building2, ClipboardList, LogOut, Moon, Search, Sun, UserRound } from 'lucide-react';
import { can } from '@payflow/shared';
import { useAuth, useUser } from '../AuthProvider';
import { useFeedback } from '../FeedbackProvider';
import { navigationFor } from '../navigation';
import { useBootstrap, useSearch, useSwitchOrganization } from '../queries';
import { useTheme } from '../ThemeProvider';
import { statusLabel } from '../../lib/format';
import { periodLabel } from '../../lib/period';

/** Waits until typing pauses before searching the server. */
function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

/** Plain substring matching on the item and its keywords: fuzzy matching ranked unrelated pages too high. */
function containsFilter(value: string, search: string, keywords: string[] = []) {
  const needle = search.trim().toLowerCase();
  return [value, ...keywords].some(text => text.toLowerCase().includes(needle)) ? 1 : 0;
}

/**
 * Ctrl K / ⌘ K: jump to pages, people and pay runs, or run an action. People and runs come from the
 * server's search; pages and actions are matched locally.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const user = useUser();
  const { signOut, adopt } = useAuth();
  const { fail } = useFeedback();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const bootstrap = useBootstrap().data;
  const switchOrganization = useSwitchOrganization();
  const [text, setText] = useState('');
  const query = useDebounced(text, 180);
  const canSearch = can(user.role, 'employees.read');
  const results = useSearch(query, canSearch);
  const otherOrganizations = (bootstrap?.organizations ?? []).filter(org => org.id !== bootstrap?.organization.id);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  async function switchTo(id: string) {
    onClose();
    try {
      const result = await switchOrganization.mutateAsync(id);
      adopt(result);
      navigate(result.user.role === 'employee' ? '/me' : '/overview');
    } catch (error) {
      fail(error);
    }
  }

  // Server results always match what was typed, so they carry the query as a keyword for cmdk's filter.
  const typed = [text];
  return (
    <div className="overlay modal-overlay palette-overlay" onClick={onClose}>
      <Command
        className="palette"
        label="Command palette"
        filter={containsFilter}
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
        loop
      >
        <div className="palette-input">
          <Search size={18} />
          <Command.Input
            autoFocus
            value={text}
            onValueChange={setText}
            placeholder={canSearch ? 'Search people, pay runs and pages…' : 'Go to a page or run an action…'}
          />
          <kbd>Esc</kbd>
        </div>
        <Command.List>
          <Command.Empty>{results.isFetching ? 'Searching…' : 'No matches.'}</Command.Empty>
          {canSearch && Boolean(results.data?.people.length) && (
            <Command.Group heading="People">
              {results.data!.people.map(person => (
                <Command.Item
                  key={person.id}
                  value={`person ${person.id} ${person.name}`}
                  keywords={typed}
                  onSelect={() => go(`/people?employee=${person.id}`)}
                >
                  <UserRound size={16} />
                  <span>
                    {person.name}
                    <small>
                      {person.id} · {person.jobTitle} · {person.branch}
                      {person.status === 'exited' ? ' · left' : ''}
                    </small>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {canSearch && Boolean(results.data?.runs.length) && (
            <Command.Group heading="Pay runs">
              {results.data!.runs.map(run => (
                <Command.Item
                  key={run.id}
                  value={`run ${run.id}`}
                  keywords={[...typed, periodLabel(run.year, run.month)]}
                  onSelect={() => go(`/payroll/${run.id}`)}
                >
                  <ClipboardList size={16} />
                  <span>
                    {periodLabel(run.year, run.month)} payroll
                    <small>
                      {run.payGroupName} · {statusLabel(run.status)}
                    </small>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Pages">
            {navigationFor(user.role).map(item => (
              <Command.Item
                key={item.to}
                value={`page ${item.label}`}
                keywords={item.keywords}
                onSelect={() => go(item.to)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Actions">
            <Command.Item
              value="action theme"
              keywords={['dark mode', 'light mode', 'appearance']}
              onSelect={() => {
                toggle();
                onClose();
              }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</span>
            </Command.Item>
            {otherOrganizations.map(org => (
              <Command.Item
                key={org.id}
                value={`organization ${org.name}`}
                keywords={['switch']}
                onSelect={() => switchTo(org.id)}
              >
                <Building2 size={16} />
                <span>Switch to {org.name}</span>
              </Command.Item>
            ))}
            <Command.Item
              value="action sign out"
              keywords={['log out']}
              onSelect={() => {
                onClose();
                void signOut();
              }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '@payflow/shared';
import { useAuth } from '../AuthProvider';
import { useFeedback } from '../FeedbackProvider';
import { useBootstrap, useSwitchOrganization } from '../queries';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** The sidebar organization card; people in several organizations switch between them here. */
export function OrganizationSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const { adopt } = useAuth();
  const { fail } = useFeedback();
  const navigate = useNavigate();
  const bootstrap = useBootstrap().data;
  const switchOrganization = useSwitchOrganization();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const organization = bootstrap?.organization;
  const choices = bootstrap?.organizations ?? [];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function choose(id: string) {
    setOpen(false);
    if (id === organization?.id) return;
    try {
      const result = await switchOrganization.mutateAsync(id);
      adopt(result);
      onSwitched();
      navigate(result.user.role === 'employee' ? '/me' : '/overview');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="org-switch-wrap" ref={container}>
      <button
        className="org-switch"
        aria-expanded={open}
        aria-label="Switch organization"
        onClick={() => setOpen(!open)}
      >
        <span className="org-mark">{initialsOf(organization?.name ?? '') || '—'}</span>
        <span>
          <strong>{organization?.name ?? 'Loading…'}</strong>
          <small>
            {organization?.isSample ? 'Sample company' : 'Organization'} · {organization?.branches.length ?? 0}{' '}
            {organization?.branches.length === 1 ? 'branch' : 'branches'}
          </small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="popover org-menu" role="menu">
          <small className="popover-caption">YOUR ORGANIZATIONS</small>
          {choices.map(choice => (
            <button
              key={choice.id}
              role="menuitem"
              onClick={() => choose(choice.id)}
              disabled={switchOrganization.isPending}
            >
              <span className="org-mark">{initialsOf(choice.name)}</span>
              <span>
                <strong>{choice.name}</strong>
                <small>{ROLE_LABELS[choice.role]}</small>
              </span>
              {choice.id === organization?.id && <Check size={16} />}
            </button>
          ))}
          <p className="popover-note">
            To add an organization, sign up again with the same email and password, or accept an invitation.
          </p>
        </div>
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Link2, LockKeyhole, MailPlus, Users } from 'lucide-react';
import { can, ROLE_LABELS, ROLES, type Role, type User } from '@payflow/shared';
import { useAuth, useUser } from '../../app/AuthProvider';
import { useAccountMutations, useInvitations, useUsers } from '../../app/queries';
import { PanelTitle, Pill } from '../../components';

/** Admins invite people and manage accounts; everyone can change their own password. */
export function AccessPanel() {
  const user = useUser();
  const isAdmin = can(user.role, 'users.manage');
  return (
    <section className="panel">
      <PanelTitle
        title="Roles & access"
        description={
          isAdmin
            ? 'Invite people by email and role. Each person sets their own password.'
            : 'Your role determines your access.'
        }
      />
      {isAdmin ? (
        <AccountAdministration />
      ) : (
        <div className="info-strip">
          <LockKeyhole size={17} /> Signed in as {ROLE_LABELS[user.role]}. Ask an organization admin to invite another
          person.
        </div>
      )}
      <ChangePassword />
      <div className="info-strip">
        <LockKeyhole size={17} /> This demo uses password sessions. Changing your password signs out all your sessions.
        Production requires SSO, MFA, managed recovery and a security review.
      </div>
    </section>
  );
}

function AccountAdministration() {
  const self = useUser();
  const users = useUsers(true);
  const invitations = useInvitations(true);
  const { invite, revoke, resetPassword, remove } = useAccountMutations();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [temporary, setTemporary] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState('');

  async function attempt(task: () => Promise<void>) {
    setError('');
    setLink(null);
    setTemporary(null);
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      const created = await invite.mutateAsync({
        email,
        role,
        employeeId: role === 'employee' ? employeeId : undefined,
      });
      setLink({ email: created.invitation.email, url: `${window.location.origin}/invite?token=${created.token}` });
      setEmail('');
      setEmployeeId('');
    });
  };
  const reset = (account: User) => {
    if (!window.confirm(`Issue a one-time password for ${account.username}? This signs out their current sessions.`))
      return;
    void attempt(async () => {
      const result = await resetPassword.mutateAsync(account.id);
      setTemporary({ username: account.username, password: result.temporaryPassword });
    });
  };
  const removeAccount = (account: User) => {
    if (!window.confirm(`Remove access for ${account.username}?`)) return;
    void attempt(() => remove.mutateAsync(account.id).then(() => undefined));
  };
  const pending = invitations.data?.filter(item => !item.acceptedAt) ?? [];

  return (
    <>
      <div className="access-user-list">
        {users.data?.map(account => (
          <div className="branch-row" key={account.id}>
            <Users size={17} />
            <strong>{account.displayName ?? account.username}</strong>
            <span>{ROLE_LABELS[account.role]}</span>
            {account.employeeId && <small>{account.employeeId}</small>}
            {account.mustChangePassword && <small>Setup pending</small>}
            {account.builtIn && <small>Sample account</small>}
            {account.id !== self.id && !account.builtIn && (
              <>
                <button className="text-button" onClick={() => reset(account)}>
                  Reset password
                </button>
                <button className="text-button" onClick={() => removeAccount(account)}>
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <>
          <h3>Pending invitations</h3>
          {pending.map(item => (
            <div className="branch-row" key={item.id}>
              <MailPlus size={17} />
              <strong>{item.email}</strong>
              <span>{ROLE_LABELS[item.role]}</span>
              {item.employeeId && <small>{item.employeeId}</small>}
              <Pill tone="info">expires {item.expiresAt.slice(0, 10)}</Pill>
              <button
                className="text-button"
                onClick={() => void attempt(() => revoke.mutateAsync(item.id).then(() => undefined))}
              >
                Revoke
              </button>
            </div>
          ))}
        </>
      )}
      <h3>Invite someone</h3>
      <form className="access-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            placeholder="riya@company.com"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={event => setRole(event.target.value as Role)}>
            {ROLES.map(value => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {role === 'employee' && (
          <label>
            Employee ID
            <input
              value={employeeId}
              onChange={event => setEmployeeId(event.target.value.toUpperCase())}
              required
              placeholder="EMP00001"
            />
          </label>
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="button primary" type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Creating link…' : 'Create invitation link'}
        </button>
      </form>
      {link && (
        <div className="info-strip" role="status">
          <Link2 size={17} />
          <span>
            <strong>Invitation for {link.email}.</strong> Share this one-time link privately; it expires in 7 days and
            is not shown again: <code>{link.url}</code>
          </span>
        </div>
      )}
      {temporary && (
        <div className="info-strip" role="status">
          <LockKeyhole size={17} />
          <span>
            <strong>One-time password for {temporary.username}:</strong> <code>{temporary.password}</code>. They must
            choose a new password at next sign-in.
          </span>
        </div>
      )}
    </>
  );
}

function ChangePassword() {
  const { forget } = useAuth();
  const { changePassword } = useAccountMutations();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      forget();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <>
      <h3>Change my password</h3>
      <form className="access-form" onSubmit={submit}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            placeholder="At least 12 characters"
          />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="button primary" disabled={changePassword.isPending} type="submit">
          Update password
        </button>
      </form>
    </>
  );
}

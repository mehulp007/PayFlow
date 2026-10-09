import { useState, type FormEvent } from 'react';
import { LockKeyhole, Users } from 'lucide-react';
import { can, ROLE_LABELS, ROLES, type Role, type User } from '@payflow/shared';
import { useAuth, useUser } from '../../app/AuthProvider';
import { useAccountMutations, useUsers } from '../../app/queries';
import { PanelTitle } from '../../components';

/** Admins create and manage accounts; everyone can change their own password. */
export function AccessPanel() {
  const user = useUser();
  const isAdmin = can(user.role, 'users.manage');
  return (
    <section className="panel">
      <PanelTitle
        title="Roles & access"
        description={
          isAdmin
            ? 'Create sign-in accounts and link employees to their own records.'
            : 'Your role determines your access.'
        }
      />
      {isAdmin ? (
        <AccountAdministration />
      ) : (
        <div className="info-strip">
          <LockKeyhole size={17} /> Signed in as {ROLE_LABELS[user.role]}. Ask an organization admin to provision
          another account.
        </div>
      )}
      <ChangePassword />
      <div className="info-strip">
        <LockKeyhole size={17} /> This local demo uses password sessions. Changing your password signs out all your
        sessions. Production requires SSO, MFA, managed recovery and a security review.
      </div>
    </section>
  );
}

function AccountAdministration() {
  const users = useUsers(true);
  const { create, resetPassword, remove } = useAccountMutations();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = create.isPending || resetPassword.isPending;

  async function run(task: () => Promise<void>) {
    setError('');
    setMessage('');
    setCredential(null);
    try {
      await task();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const created = await create.mutateAsync({
        username,
        role,
        employeeId: role === 'employee' ? employeeId : undefined,
      });
      setUsername('');
      setEmployeeId('');
      setCredential({ username: created.username, password: created.temporaryPassword });
    });
  };
  const reset = (account: User) => {
    if (
      !window.confirm(`Issue a new temporary password for ${account.username}? This signs out their current sessions.`)
    )
      return;
    void run(async () => {
      const result = await resetPassword.mutateAsync(account.id);
      setCredential({ username: account.username, password: result.temporaryPassword });
    });
  };
  const removeAccount = (account: User) => {
    if (!window.confirm(`Remove demo access for ${account.username}?`)) return;
    void run(async () => {
      await remove.mutateAsync(account.id);
      setMessage(`Access removed for ${account.username}.`);
    });
  };

  return (
    <>
      <div className="access-user-list">
        {users.data?.map(account => (
          <div className="branch-row" key={account.id}>
            <Users size={17} />
            <strong>{account.username}</strong>
            <span>{ROLE_LABELS[account.role]}</span>
            {account.employeeId && <small>{account.employeeId}</small>}
            {account.mustChangePassword && <small>Setup pending</small>}
            {account.role !== 'admin' && (
              <button className="text-button" disabled={busy} onClick={() => reset(account)}>
                Reset password
              </button>
            )}
            {!account.id.match(/^USR-(admin|hr|payroll|finance|auditor|employee)$/) && (
              <button className="text-button" onClick={() => removeAccount(account)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <h3>Add account</h3>
      <form className="access-form" onSubmit={submit}>
        <label>
          Username
          <input
            value={username}
            onChange={event => setUsername(event.target.value)}
            required
            placeholder="e.g. riya.sharma"
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
        {message && <div className="info-strip">{message}</div>}
        <button className="button primary" type="submit" disabled={busy}>
          {create.isPending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      {credential && (
        <div className="info-strip" role="status">
          <LockKeyhole size={17} />
          <span>
            <strong>Temporary access for {credential.username}.</strong> Give this one-time password privately:{' '}
            <code>{credential.password}</code>. Copy it now; it will not appear in the account list. The user must
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

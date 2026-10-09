import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth, useUser } from '../../app/AuthProvider';
import { useAccountMutations } from '../../app/queries';
import { AuthLayout } from './AuthLayout';

/** Accounts created by an admin must replace their one-time password before anything else. */
export function FirstPasswordPage() {
  const user = useUser();
  const { signOut, forget } = useAuth();
  const { changePassword } = useAccountMutations();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) return setError('The new passwords do not match');
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      forget();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <AuthLayout
      kicker="ACCOUNT SETUP"
      title="Create your password"
      intro={`${user.username}, enter the temporary password given to you, then choose a private password. You will sign in again afterward.`}
      aside={
        <>
          <span>PAYFLOW · ACCOUNT SETUP</span>
          <h2>Your personal payroll access.</h2>
          <p>Only you should know the password you choose.</p>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label>
          Temporary password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            required
            placeholder="At least 12 characters"
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="button primary" disabled={changePassword.isPending}>
          {changePassword.isPending ? 'Saving…' : 'Save password'} <ArrowRight size={17} />
        </button>
      </form>
      <button type="button" className="signout-button" onClick={signOut}>
        Sign out
      </button>
    </AuthLayout>
  );
}

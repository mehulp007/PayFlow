import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(username, password);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="SECURE WORKSPACE"
      title="Welcome back"
      intro="Sign in to your payroll workspace. Your account determines which records and actions you can access."
      aside={
        <>
          <span>PAYFLOW · INDIA PAYROLL 2026</span>
          <h2>One clear place for people, payroll and compliance.</h2>
          <p>
            Review pay runs, resolve exceptions, approve results, and give employees access to their own information.
          </p>
          <div>
            <span>01&nbsp; Role based access</span>
            <span>02&nbsp; Separate finance approval</span>
            <span>03&nbsp; Employee self service</span>
          </div>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            required
            placeholder="Your username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            placeholder="Your password"
          />
        </label>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} />
        </button>
      </form>
      <div className="auth-demo">
        <strong>Individual accounts</strong>
        <p>Each demo role has its own password. Find setup instructions in the project README.</p>
        <small>Synthetic data only · local evaluation</small>
      </div>
    </AuthLayout>
  );
}

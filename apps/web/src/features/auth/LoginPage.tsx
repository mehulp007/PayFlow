import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
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
      intro="Sign in with your email. Your account determines which records and actions you can access."
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
          Email
          <input
            autoComplete="username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            required
            placeholder="you@company.com"
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
        <strong>New to PayFlow?</strong>
        <p>Create your own organization, or explore a generated company with six months of approved payroll.</p>
        <div className="auth-links">
          <Link className="button outline" to="/signup?start=sample">
            Explore a sample company
          </Link>
          <Link className="button outline" to="/signup?start=empty">
            Create an organization
          </Link>
        </div>
        <small>Synthetic data only · the built-in Aster Group accounts are listed in the README</small>
      </div>
    </AuthLayout>
  );
}

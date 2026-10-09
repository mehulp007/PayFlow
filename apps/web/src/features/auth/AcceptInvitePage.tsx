import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { ROLE_LABELS, type InvitationPreview, type LoginResult } from '@payflow/shared';
import { useAuth } from '../../app/AuthProvider';
import { api } from '../../lib/api';
import { AuthLayout } from './AuthLayout';

/** The invitation link: the invitee chooses their own password, so none is ever shared. */
export function AcceptInvitePage() {
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const token = useSearchParams()[0].get('token') ?? '';
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<InvitationPreview>(`/invitations/preview?token=${encodeURIComponent(token)}`)
      .then(setInvitation)
      .catch(reason => setError((reason as Error).message));
  }, [token]);

  async function accept(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirm) return setError('The passwords do not match');
    setBusy(true);
    try {
      adopt(await api.post<LoginResult>('/invitations/accept', { token, displayName, password }));
      navigate('/', { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="INVITATION"
      title={invitation ? `Join ${invitation.organizationName}` : 'Accept your invitation'}
      intro={
        invitation
          ? `You are invited as ${ROLE_LABELS[invitation.role]} with ${invitation.email}. Choose a private password.`
          : 'Checking your invitation link…'
      }
      aside={
        <>
          <span>PAYFLOW · ACCOUNT SETUP</span>
          <h2>Your personal payroll access.</h2>
          <p>Only you should know the password you choose.</p>
        </>
      }
    >
      {invitation ? (
        <form onSubmit={accept} className="auth-form">
          <label>
            Your name
            <input value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              placeholder="At least 12 characters"
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Joining…' : 'Join organization'} <ArrowRight size={17} />
          </button>
        </form>
      ) : (
        error && <div className="auth-error">{error}</div>
      )}
      <div className="auth-demo">
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

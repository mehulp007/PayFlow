import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Building2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { DEFAULT_BRANCHES, SAMPLE_COMPANY_SIZE, SUPPORTED_WORK_STATES, type SignupResult } from '@payflow/shared';
import { useAuth } from '../../app/AuthProvider';
import { api } from '../../lib/api';
import { AuthLayout } from './AuthLayout';

const STEPS = ['Organization', 'Your account', 'Get started'];

/** Self-service sign-up: an organization, its first admin, and an empty or sample start. */
export function SignupPage() {
  const { adopt } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [organizationName, setOrganizationName] = useState('');
  const [branches, setBranches] = useState<Array<{ name: string; state: string }>>([{ ...DEFAULT_BRANCHES[0] }]);
  const [payGroups, setPayGroups] = useState('General');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [start, setStart] = useState<'sample' | 'empty'>(params.get('start') === 'empty' ? 'empty' : 'sample');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const updateBranch = (index: number, patch: Partial<{ name: string; state: string }>) =>
    setBranches(current => current.map((branch, position) => (position === index ? { ...branch, ...patch } : branch)));

  function next(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (step === 1 && password !== confirm) return setError('The passwords do not match');
    setStep(step + 1);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<SignupResult>('/organizations', {
        organizationName,
        adminName,
        email,
        password,
        branches,
        payGroups: payGroups
          .split(',')
          .map(name => name.trim())
          .filter(Boolean),
        start,
      });
      adopt(result);
      navigate('/overview', { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker={`CREATE AN ORGANIZATION · STEP ${step + 1} OF ${STEPS.length}`}
      title={['Set up your organization', 'Create your admin account', 'How would you like to start?'][step]}
      intro={
        [
          'Branches decide which state’s professional tax and labour welfare rules apply to each person.',
          'You will be the organization admin. Invite HR, payroll, finance and employees afterwards.',
          'Start with an empty workspace, or explore a generated company with six months of approved payroll.',
        ][step]
      }
      aside={
        <>
          <span>PAYFLOW · YOUR OWN WORKSPACE</span>
          <h2>Payroll for your organization, isolated from everyone else’s.</h2>
          <p>Each organization has its own people, pay periods, accounts and audit trail.</p>
          <div>
            {STEPS.map((label, index) => (
              <span key={label}>
                0{index + 1}&nbsp; {label}
              </span>
            ))}
          </div>
        </>
      }
    >
      {step === 0 && (
        <form onSubmit={next} className="auth-form">
          <label>
            Organization name
            <input
              value={organizationName}
              onChange={event => setOrganizationName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Neem Foods Pvt Ltd"
            />
          </label>
          <div className="signup-branches">
            <span>Branches</span>
            {branches.map((branch, index) => (
              <div className="signup-branch" key={index}>
                <input
                  aria-label="Branch name"
                  value={branch.name}
                  onChange={event => updateBranch(index, { name: event.target.value })}
                  required
                  minLength={2}
                  placeholder="City"
                />
                <select
                  aria-label="Branch state"
                  value={branch.state}
                  onChange={event => updateBranch(index, { state: event.target.value })}
                >
                  {SUPPORTED_WORK_STATES.map(state => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove branch"
                  disabled={branches.length === 1}
                  onClick={() => setBranches(current => current.filter((_, position) => position !== index))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setBranches(current => [...current, { ...DEFAULT_BRANCHES[current.length % DEFAULT_BRANCHES.length] }])
              }
            >
              <Plus size={14} /> Add branch
            </button>
            <small>States with a reviewed rule pack: {SUPPORTED_WORK_STATES.join(', ')}.</small>
          </div>
          <label>
            Pay groups
            <input
              value={payGroups}
              onChange={event => setPayGroups(event.target.value)}
              placeholder="General, Plant"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="button primary">
            Continue <ArrowRight size={17} />
          </button>
        </form>
      )}
      {step === 1 && (
        <form onSubmit={next} className="auth-form">
          <label>
            Your name
            <input value={adminName} onChange={event => setAdminName(event.target.value)} required minLength={2} />
          </label>
          <label>
            Work email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
            />
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
          <div className="signup-actions">
            <button type="button" className="button outline" onClick={() => setStep(0)}>
              <ArrowLeft size={17} /> Back
            </button>
            <button type="submit" className="button primary">
              Continue <ArrowRight size={17} />
            </button>
          </div>
        </form>
      )}
      {step === 2 && (
        <form onSubmit={create} className="auth-form">
          <div className="start-choices" role="radiogroup" aria-label="How to start">
            <button
              type="button"
              role="radio"
              aria-checked={start === 'sample'}
              className={`start-choice ${start === 'sample' ? 'selected' : ''}`}
              onClick={() => setStart('sample')}
            >
              <Sparkles size={20} />
              <strong>Load a sample company</strong>
              <span>
                {SAMPLE_COMPANY_SIZE} fictional people, April–September 2026 approved, October open. Switch roles to try
                maker-checker on your own.
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={start === 'empty'}
              className={`start-choice ${start === 'empty' ? 'selected' : ''}`}
              onClick={() => setStart('empty')}
            >
              <Building2 size={20} />
              <strong>Start empty</strong>
              <span>Add your own people and open your first pay period.</span>
            </button>
          </div>
          {error && <div className="auth-error">{error}</div>}
          <div className="signup-actions">
            <button type="button" className="button outline" disabled={busy} onClick={() => setStep(1)}>
              <ArrowLeft size={17} /> Back
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (start === 'sample' ? 'Generating six months of payroll…' : 'Creating…') : 'Create organization'}{' '}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      )}
      <div className="auth-demo">
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        <small>Synthetic data only · do not enter real employee information</small>
      </div>
    </AuthLayout>
  );
}

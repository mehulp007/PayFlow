import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { BadgeCheck, Building2, Layers, MapPinned, Plus } from 'lucide-react';
import { can, SUPPORTED_WORK_STATES } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useBootstrap, useOrganizationMutations } from '../../app/queries';
import { DetailRow, Heading, PanelTitle } from '../../components';
import { AccessPanel } from './AccessPanel';

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'access' ? 'access' : 'organization';
  return (
    <>
      <Heading
        eyebrow="SETTINGS"
        title="Organization setup"
        description="Branches, pay groups and the people who can sign in."
      />
      <div className="tab-bar">
        <button className={tab === 'organization' ? 'selected' : ''} onClick={() => setParams({})}>
          Organization
        </button>
        <button className={tab === 'access' ? 'selected' : ''} onClick={() => setParams({ tab: 'access' })}>
          Roles & access
        </button>
      </div>
      {tab === 'organization' ? <OrganizationPanel /> : <AccessPanel />}
    </>
  );
}

function OrganizationPanel() {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const organization = useBootstrap().data?.organization;
  const { addBranch, addPayGroup, resetSample } = useOrganizationMutations();
  const isAdmin = can(user.role, 'organization.manage');
  const [branchName, setBranchName] = useState('');
  const [branchState, setBranchState] = useState(SUPPORTED_WORK_STATES[0]);
  const [payGroup, setPayGroup] = useState('');

  async function run(task: () => Promise<unknown>, success: string) {
    try {
      await task();
      notify(success);
    } catch (error) {
      fail(error);
    }
  }
  const submitBranch = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await addBranch.mutateAsync({ name: branchName, state: branchState });
      setBranchName('');
    }, `${branchName} added.`);
  };
  const submitPayGroup = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await addPayGroup.mutateAsync(payGroup);
      setPayGroup('');
    }, `${payGroup} pay group added.`);
  };
  const reset = () => {
    if (
      !window.confirm(
        'Regenerate the sample company? People, salaries and runs are rebuilt and invited accounts removed.',
      )
    )
      return;
    void run(() => resetSample.mutateAsync(), 'Sample company regenerated.');
  };

  return (
    <div className="two-column">
      <section className="panel setup-card">
        <Building2 size={29} />
        <h2>{organization?.name}</h2>
        <p>
          {organization?.isSample ? 'Sample company with generated people' : 'Your organization'} · INR monthly payroll
        </p>
        <DetailRow label="Tax year" value="2026–27" />
        <DetailRow label="Pay period" value="Monthly, paid before the 7th of the next month" />
        <DetailRow label="Branches" value={organization?.branches.length ?? 0} />
        <DetailRow label="Pay groups" value={organization?.payGroups.map(group => group.name).join(', ') ?? '—'} />
        <DetailRow label="Data region" value="Local sample environment" />
        {isAdmin && organization?.isSample && (
          <button className="button outline" disabled={resetSample.isPending} onClick={reset}>
            {resetSample.isPending ? 'Regenerating…' : 'Reset sample company'}
          </button>
        )}
      </section>
      <section className="panel">
        <PanelTitle
          title="Branches"
          description="Each branch's state decides professional tax and labour welfare rules"
        />
        {organization?.branches.map(branch => (
          <div className="branch-row" key={branch.id}>
            <MapPinned size={17} />
            {branch.name} · {branch.state}
            <BadgeCheck size={17} />
          </div>
        ))}
        {isAdmin && (
          <form className="access-form inline-add" onSubmit={submitBranch}>
            <label>
              New branch
              <input
                value={branchName}
                onChange={event => setBranchName(event.target.value)}
                required
                minLength={2}
                placeholder="City"
              />
            </label>
            <label>
              State
              <select value={branchState} onChange={event => setBranchState(event.target.value)}>
                {SUPPORTED_WORK_STATES.map(state => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <button className="button outline" type="submit" disabled={addBranch.isPending}>
              <Plus size={15} /> Add branch
            </button>
          </form>
        )}
        <PanelTitle title="Pay groups" description="A run can cover every pay group or just one" />
        {organization?.payGroups.map(group => (
          <div className="branch-row" key={group.id}>
            <Layers size={17} />
            {group.name}
            <BadgeCheck size={17} />
          </div>
        ))}
        {isAdmin && (
          <form className="access-form inline-add single" onSubmit={submitPayGroup}>
            <label>
              New pay group
              <input
                value={payGroup}
                onChange={event => setPayGroup(event.target.value)}
                required
                minLength={2}
                placeholder="e.g. Plant"
              />
            </label>
            <button className="button outline" type="submit" disabled={addPayGroup.isPending}>
              <Plus size={15} /> Add pay group
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

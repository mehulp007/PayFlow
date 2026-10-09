import { useSearchParams } from 'react-router';
import { BadgeCheck, Building2, MapPinned } from 'lucide-react';
import { BRANCHES, can } from '@payflow/shared';
import { useUser } from '../../app/AuthProvider';
import { useFeedback } from '../../app/FeedbackProvider';
import { useBootstrap, useDemoReset } from '../../app/queries';
import { DetailRow, Heading, PanelTitle } from '../../components';
import { AccessPanel } from './AccessPanel';

export function SettingsPage() {
  const user = useUser();
  const { notify, fail } = useFeedback();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'access' ? 'access' : 'organization';
  const organization = useBootstrap().data?.organization;
  const reset = useDemoReset();

  async function resetDemo() {
    if (!window.confirm('Reset the synthetic payroll? This clears demo calculations, approvals and added people.'))
      return;
    try {
      await reset.mutateAsync();
      notify('Demo data restored. The payroll run is back in draft.');
    } catch (error) {
      fail(error);
    }
  }

  return (
    <>
      <Heading
        eyebrow="SETTINGS"
        title="Organization setup"
        description="The structure used across employee records and payroll runs."
      />
      <div className="tab-bar">
        <button className={tab === 'organization' ? 'selected' : ''} onClick={() => setParams({})}>
          Organization
        </button>
        <button className={tab === 'access' ? 'selected' : ''} onClick={() => setParams({ tab: 'access' })}>
          Roles & access
        </button>
      </div>
      {tab === 'organization' ? (
        <div className="two-column">
          <section className="panel setup-card">
            <Building2 size={29} />
            <h2>{organization?.name ?? 'Aster Group'}</h2>
            <p>One legal entity · five branches · INR monthly payroll</p>
            <DetailRow label="Tax year" value="2026–27" />
            <DetailRow label="Pay period" value="Monthly" />
            <DetailRow label="Directory" value="Synthetic people and sample records" />
            <DetailRow label="Data region" value="Local sample environment" />
            {can(user.role, 'demo.reset') && (
              <button className="button outline" disabled={reset.isPending} onClick={resetDemo}>
                {reset.isPending ? 'Resetting…' : 'Reset demo data'}
              </button>
            )}
          </section>
          <section className="panel">
            <PanelTitle title="Branches" description="Demonstration locations" />
            {BRANCHES.map(item => (
              <div className="branch-row" key={item.branch}>
                <MapPinned size={17} />
                {item.branch} · {item.state}
                <BadgeCheck size={17} />
              </div>
            ))}
          </section>
        </div>
      ) : (
        <AccessPanel />
      )}
    </>
  );
}

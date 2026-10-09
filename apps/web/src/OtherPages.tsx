import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, BadgeCheck, Banknote, BookOpenCheck, Building2,
  CalendarClock, CheckCircle2, ClipboardCheck, Download, FileCheck2, FileSpreadsheet,
  Landmark, LockKeyhole, MapPinned, ShieldCheck, Users, Wallet } from 'lucide-react';
import { api, download, money, setToken, type Role, type Run, type User } from './api';
import type { PageName } from './App';
import { Heading, PanelTitle, Pill, StatCard } from './ui';

export function DashboardPage({run,role,onNavigate,onCalculate,busy}:{run:Run|null;role:Role;onNavigate:(name:PageName)=>void;onCalculate:()=>void;busy:boolean}){
  const hasCalculation=Boolean(run?.calculatedEmployees);
  return <>
    <Heading eyebrow="OVERVIEW / TAX YEAR 2026–27" title="Good morning, payroll team" description="Here is what needs your attention before the September payroll closes."
      action={<button className="button primary" onClick={()=>onNavigate('Payroll Runs')}>Open payroll run <ArrowRight size={17}/></button>}/>
    <div className="overview-banner"><div><span className="banner-kicker">SEPTEMBER 2026 PAYROLL</span><h2>{hasCalculation?'Review the run before approval':'Ready to prepare your payroll'}</h2><p>{hasCalculation?`${run?.blocking} blocking exceptions and ${run?.warnings} warnings need a closer look.`:'Import any variable inputs, calculate pay, and review every exception before approval.'}</p><div className="banner-actions"><button className="button white" onClick={()=>onNavigate('Payroll Runs')}>Review pay run <ArrowRight size={16}/></button>{!hasCalculation&&['admin','hr-operator','payroll-operator'].includes(role)&&<button className="button ghost-white" disabled={busy} onClick={onCalculate}>{busy?'Calculating…':'Calculate demo payroll'}</button>}</div></div><div className="banner-graphic"><div className="graphic-ring"><Wallet size={54}/></div><div className="graphic-pill">{run?.totalEmployees?.toLocaleString('en-IN')??'—'} <span>in payroll</span></div></div></div>
    <div className="stats-grid"><StatCard label="Employees in scope" value={run?.totalEmployees?.toLocaleString('en-IN') ?? '—'} icon={Users} foot="Across 5 branches"/><StatCard label="Gross pay" value={run?.gross ?? 0} icon={Wallet} tone="mint" foot={hasCalculation?'Current pay run':'After calculation'}/><StatCard label="Total deductions" value={run?.deductions ?? 0} icon={ShieldCheck} tone="rose" foot="Tax and statutory"/><StatCard label="Net pay" value={run?.net ?? 0} icon={Landmark} tone="violet" foot="Before bank export"/></div>
    <div className="two-column">
      <section className="panel"><PanelTitle title="Payroll checklist" description="One clear path from inputs to reconciliation"/>
        <div className="checklist">
          {[
            ['Inputs accepted for calculation','Attendance, variable pay and deductions',hasCalculation],
            ['Calculate and review','Inspect pay, tax and statutory lines',hasCalculation],
            ['Clear blocking exceptions','Fix employee records, then recalculate',hasCalculation&&run?.blocking===0],
            ['Finance approval','A separate approver confirms final totals',['approved','reconciled'].includes(run?.status ?? '')],
            ['Export and reconcile','Prepare demo bank file and mark settlement',run?.status==='reconciled'],
          ].map(([title,description,done],index)=><button className="checklist-row" key={String(title)} onClick={()=>onNavigate('Payroll Runs')}><span className={`check-step ${done?'done':''}`}>{done?<CheckCircle2 size={19}/>:index+1}</span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={17}/></button>)}
        </div>
      </section>
      <section className="panel"><PanelTitle title="Compliance watch" description="Statutory work stays visible alongside pay" action={<button className="text-button" onClick={()=>onNavigate('Taxes & Compliance')}>View all <ArrowRight size={15}/></button>}/>
        <div className="watch-list"><div><span className="watch-icon amber"><CalendarClock size={19}/></span><span><strong>September contributions</strong><small>EPF and ESI preparation after payroll approval</small></span><Pill tone="warning">Upcoming</Pill></div><div><span className="watch-icon blue"><FileCheck2 size={19}/></span><span><strong>Form 138 · Q2</strong><small>Quarterly salary TDS preparation</small></span><Pill tone="info">Prepare</Pill></div><div><span className="watch-icon mint"><MapPinned size={19}/></span><span><strong>State deductions</strong><small>Professional tax and welfare schedules</small></span><Pill tone="neutral">Review</Pill></div></div>
        <div className="info-strip"><AlertCircle size={18}/> State rules cover Karnataka, Maharashtra, Tamil Nadu, West Bengal and Haryana (reviewed October 2026). Verify against state notifications before live use.</div>
      </section>
    </div>
  </>;
}

export function CompliancePage({run}:{run:Run|null}){
  return <>
    <Heading eyebrow="TAXES & COMPLIANCE" title="Statutory workspace" description="Rule versions, filing preparation, and due dates in one place."/>
    <div className="compliance-hero"><ShieldCheck size={31}/><div><strong>Tax Year 2026–27</strong><span>Income-tax Act, 2025 · salary TDS section 392 · new regime default · Labour Codes in force from 21 Nov 2025</span></div><Pill tone="info">Rule pack v2 · Oct 2026</Pill></div>
    <div className="compliance-grid">
      {[
        {icon:BookOpenCheck,title:'Income tax',text:'Old/new regime slabs, ₹75,000 standard deduction, ₹60,000 rebate with marginal relief, surcharge, cess and monthly TDS from a year-to-date projection.',tag:'Form 138 preparation'},
        {icon:Users,title:'EPF, EPS & EDLI',text:'Wages per the Code on Wages (50% rule). Ceiling ₹25,000 from 17 Sep 2026 (S.O. 5109(E)); September split by days. EPS stops at 58.',tag:'ECR preparation'},
        {icon:ShieldCheck,title:'ESI',text:'0.75% + 3.25% under the ₹21,000 ceiling; coverage continues to the end of the contribution period; ₹176/day exemption.',tag:'Contribution preparation'},
        {icon:MapPinned,title:'State rules',text:'Professional tax and labour welfare fund slabs, deduction months and caps for each supported state.',tag:'Reviewed Oct 2026'},
      ].map(item=><section className="panel compliance-card" key={item.title}><div className="compliance-icon"><item.icon size={22}/></div><h2>{item.title}</h2><p>{item.text}</p><Pill tone="neutral">{item.tag}</Pill></section>)}
    </div>
    <div className="two-column"><section className="panel"><PanelTitle title="Filing calendar" description="Dates are reminders; confirm each current portal deadline before filing"/><div className="calendar-row"><span>OCT <strong>15</strong></span><div><strong>September EPF ECR and ESI contribution</strong><small>One ECR covers both September ceiling periods; record challan references</small></div><Pill tone="warning">Review date</Pill></div><div className="calendar-row"><span>OCT <strong>31</strong></span><div><strong>Q2 salary TDS · Form 138</strong><small>Reconcile deductions with challans</small></div><Pill tone="warning">Review date</Pill></div></section>
      <section className="panel"><PanelTitle title="Run control" description="Current status and outstanding work"/><div className="control-metric"><span>Current run</span><Pill tone={run?.status==='approved'?'success':'info'}>{run?.status?.replaceAll('_',' ') ?? 'Loading'}</Pill></div><div className="control-metric"><span>Blocking exceptions</span><strong>{run?.blocking ?? 0}</strong></div><div className="control-metric"><span>Rule version</span><strong>IN-TY2026-27-v2</strong></div><div className="info-strip"><LockKeyhole size={17}/> Production filing formats and state rates require payroll-specialist sign-off.</div></section></div>
  </>;
}

export function ReportsPage({run,role,setError,setToast}:{run:Run|null;role:Role;setError:(x:string)=>void;setToast:(x:string)=>void}){
  const reports=[
    {kind:'salary-register',title:'Salary register',description:'Gross, deductions and net pay by employee',icon:FileSpreadsheet},
    {kind:'bank-demo',title:'Demo bank file',description:'Fictional account references; approval required',icon:Banknote},
    {kind:'epf-prep',title:'EPF preparation',description:'Contribution components for review',icon:Users},
    {kind:'esi-prep',title:'ESI preparation',description:'Employee and employer contributions',icon:ShieldCheck},
    {kind:'form138-prep',title:'Form 138 preparation',description:'Salary and TDS source data',icon:FileCheck2},
    {kind:'state-deductions',title:'State deductions',description:'Professional tax and welfare by state',icon:MapPinned},
  ];
  async function exportReport(kind:string){try{await download(`/runs/RUN-2026-09/export/${kind}`,role);setToast('Report downloaded.');}catch(err){setError((err as Error).message);}}
  return <><Heading eyebrow="REPORTS & EXPORTS" title="Payroll reports" description="Download calculation outputs for review and reconciliation."/>
    <div className="notice"><AlertCircle size={19}/><span>These are demonstration preparation reports. They are not government-portal upload files or a bank-ready payment instruction.</span></div>
    <div className="report-grid">{reports.map(report=><section className="panel report-card" key={report.kind}><div className="report-icon"><report.icon size={23}/></div><h2>{report.title}</h2><p>{report.description}</p><button className="button outline" disabled={!run?.calculatedEmployees} onClick={()=>exportReport(report.kind)}><Download size={16}/> Download CSV</button></section>)}</div>
  </>;
}

export function SettingsPage({role}:{role:Role}){
  const [tab,setTab]=useState<'organization'|'access'>('organization');
  const [resetting,setResetting]=useState(false);
  const canReset=role==='admin';
  async function resetDemo(){
    if(!window.confirm('Reset the synthetic payroll? This clears demo calculations, approvals and added people.'))return;
    setResetting(true);
    try{await api('/demo/reset',role,{method:'POST',body:'{}'});window.location.reload();}
    catch(err){window.alert((err as Error).message);setResetting(false);}
  }
  return <><Heading eyebrow="SETTINGS" title="Organization setup" description="The structure used across employee records and payroll runs."/>
    <div className="tab-bar"><button className={tab==='organization'?'selected':''} onClick={()=>setTab('organization')}>Organization</button><button className={tab==='access'?'selected':''} onClick={()=>setTab('access')}>Roles & access</button></div>
    {tab==='organization'?<div className="two-column"><section className="panel setup-card"><Building2 size={29}/><h2>Aster Group</h2><p>One legal entity · five branches · INR monthly payroll</p><div className="detail-row"><span>Tax year</span><strong>2026–27</strong></div><div className="detail-row"><span>Pay period</span><strong>Monthly</strong></div><div className="detail-row"><span>Directory</span><strong>Synthetic people and sample records</strong></div><div className="detail-row"><span>Data region</span><strong>Sample environment</strong></div>{canReset&&<button className="button outline" disabled={resetting} onClick={resetDemo}>{resetting?'Resetting…':'Reset demo data'}</button>}</section><section className="panel"><PanelTitle title="Branches" description="Demonstration locations"/>{['Bengaluru · Karnataka','Chennai · Tamil Nadu','Gurugram · Haryana','Kolkata · West Bengal','Mumbai · Maharashtra'].map(branch=><div className="branch-row" key={branch}><MapPinned size={17}/>{branch}<BadgeCheck size={17}/></div>)}</section></div>:
      <AccessPanel role={role}/>}
  </>;
}

const accessRoles:Record<Role,string>={admin:'Organization Admin','hr-operator':'HR Operator',
  'payroll-operator':'Payroll Operator','finance-approver':'Finance Approver',auditor:'Auditor',employee:'Employee'};
function AccessPanel({role}:{role:Role}){
  const [users,setUsers]=useState<User[]>([]);
  const [username,setUsername]=useState('');
  const [newCredential,setNewCredential]=useState<{username:string;password:string}|null>(null);
  const [newRole,setNewRole]=useState<Role>('employee');
  const [employeeId,setEmployeeId]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [currentPassword,setCurrentPassword]=useState('');
  const [nextPassword,setNextPassword]=useState('');
  useEffect(()=>{if(role==='admin')api<User[]>('/auth/users',role).then(setUsers).catch(err=>setError(err.message));},[role]);
  async function create(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');setMessage('');setNewCredential(null);
    try{
      const result=await api<User & {temporaryPassword:string}>('/auth/users',role,{method:'POST',body:JSON.stringify({username,role:newRole,employeeId:newRole==='employee'?employeeId:undefined})});
      setUsers(current=>[...current,result].sort((a,b)=>a.username.localeCompare(b.username)));
      setUsername('');setEmployeeId('');setNewCredential({username:result.username,password:result.temporaryPassword});
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function remove(user:User){
    if(!window.confirm(`Remove demo access for ${user.username}?`))return;
    setError('');setMessage('');
    try{await api(`/auth/users/${user.id}`,role,{method:'DELETE'});setUsers(current=>current.filter(item=>item.id!==user.id));setMessage(`Access removed for ${user.username}.`);setNewCredential(null);}
    catch(err){setError((err as Error).message);}
  }
  async function resetPassword(user:User){
    if(!window.confirm(`Issue a new temporary password for ${user.username}? This signs out their current sessions.`))return;
    setBusy(true);setError('');setNewCredential(null);
    try{
      const result=await api<{temporaryPassword:string}>(`/auth/users/${user.id}/reset-password`,role,{method:'POST'});
      setUsers(current=>current.map(item=>item.id===user.id?{...item,mustChangePassword:true}:item));
      setNewCredential({username:user.username,password:result.temporaryPassword});
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function updatePassword(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      await api('/auth/change-password',role,{method:'POST',body:JSON.stringify({currentPassword,newPassword:nextPassword})});
      setToken(null);window.location.reload();
    }catch(err){setError((err as Error).message);setBusy(false);}
  }
  return <section className="panel"><PanelTitle title="Roles & access" description={role==='admin'?'Create sign-in accounts and link employees to their own records.':'Your role determines your access.'}/>
    {role==='admin'?<><div className="access-user-list">{users.map(user=><div className="branch-row" key={user.id}><Users size={17}/><strong>{user.username}</strong><span>{accessRoles[user.role]}</span>{user.employeeId&&<small>{user.employeeId}</small>}{user.mustChangePassword&&<small>Setup pending</small>}{user.role!=='admin'&&<button className="text-button" disabled={busy} onClick={()=>resetPassword(user)}>Reset password</button>}{/^USR-[0-9a-f]{24}$/.test(user.id)&&<button className="text-button" onClick={()=>remove(user)}>Remove</button>}</div>)}</div>
      <h3>Add account</h3><form className="access-form" onSubmit={create}><label>Username<input value={username} onChange={event=>setUsername(event.target.value)} required placeholder="e.g. riya.sharma"/></label><label>Role<select value={newRole} onChange={event=>setNewRole(event.target.value as Role)}>{Object.entries(accessRoles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {newRole==='employee'&&<label>Employee ID<input value={employeeId} onChange={event=>setEmployeeId(event.target.value.toUpperCase())} required placeholder="EMP00001"/></label>}
        {error&&<div className="auth-error">{error}</div>}{message&&<div className="info-strip">{message}</div>}
        <button className="button primary" type="submit" disabled={busy}>{busy?'Creating…':'Create account'}</button></form>
      {newCredential&&<div className="info-strip" role="status"><LockKeyhole size={17}/><span><strong>Temporary access for {newCredential.username}.</strong> Give this one-time password privately: <code>{newCredential.password}</code>. Copy it now; it will not appear in the account list. The user must choose a new password at next sign-in.</span></div>}</>:
      <div className="info-strip"><LockKeyhole size={17}/> Signed in as {accessRoles[role]}. Ask an organization admin to provision another account.</div>}
    <h3>Change my password</h3><form className="access-form" onSubmit={updatePassword}><label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label><label>New password<input type="password" autoComplete="new-password" required minLength={12} value={nextPassword} onChange={event=>setNextPassword(event.target.value)} placeholder="At least 12 characters"/></label>{error&&<div className="auth-error">{error}</div>}<button className="button primary" disabled={busy} type="submit">Update password</button></form>
    <div className="info-strip"><LockKeyhole size={17}/> This local demo uses password sessions. Changing your password signs out all your sessions. Production requires SSO, MFA, managed recovery and a security review.</div>
  </section>;
}

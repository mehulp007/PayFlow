import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Bell, CalendarDays, ChevronDown, CircleHelp, ClipboardList, FileBarChart2,
  LayoutDashboard, Menu, Network, Search, Settings2, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { api, getToken, money, setToken, type Employee, type Exception, type Line, type LoginResult, type Page, type Role, type Run, type User } from './api';
import PayrollPage from './PayrollPage';
import PeoplePage from './PeoplePage';
import HierarchyPage from './HierarchyPage';
import { CompliancePage, DashboardPage, ReportsPage, SettingsPage } from './OtherPages';

export type PageName = 'Overview'|'People'|'Hierarchy'|'Compensation'|'Payroll Runs'|'Taxes & Compliance'|'Reports'|'Settings';

const navigation: Array<{name:PageName;icon:typeof LayoutDashboard}> = [
  {name:'Overview',icon:LayoutDashboard},{name:'People',icon:Users},{name:'Hierarchy',icon:Network},{name:'Compensation',icon:Wallet},
  {name:'Payroll Runs',icon:ClipboardList},{name:'Taxes & Compliance',icon:ShieldCheck},
  {name:'Reports',icon:FileBarChart2},{name:'Settings',icon:Settings2},
];
const roleLabels:Record<Role,string>={
  admin:'Organization Admin','hr-operator':'HR Operator','payroll-operator':'Payroll Operator',
  'finance-approver':'Finance Approver',auditor:'Auditor',employee:'Employee',
};
const publicDemo=import.meta.env.VITE_PUBLIC_DEMO==='1';

export default function App(){
  const [page,setPage]=useState<PageName>('Overview');
  const [session,setSession]=useState<User|null>(null);
  const [checking,setChecking]=useState(true);
  const role=session?.role??'employee';
  const employeeId=session?.employeeId??'';
  const [run,setRun]=useState<Run|null>(null);
  const [lines,setLines]=useState<Page<Line>>({items:[],total:0,page:1,size:20});
  const [exceptions,setExceptions]=useState<Exception[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [linePage,setLinePage]=useState(1);
  const [exceptionOnly,setExceptionOnly]=useState(false);

  const refresh=useCallback(async()=>{
    if(!session)return;
    const detail=await api<Run>('/runs/RUN-2026-09',role);
    setRun(detail);
    if(role!=='employee'&&detail.calculatedEmployees){
      const [lineData,exceptionData]=await Promise.all([
        api<Page<Line>>(`/runs/${detail.id}/lines?page=${linePage}&size=20&search=${encodeURIComponent(search)}&exception=${exceptionOnly}`,role),
        api<Exception[]>(`/runs/${detail.id}/exceptions`,role),
      ]);
      setLines(lineData);setExceptions(exceptionData);
    } else {setLines({items:[],total:0,page:1,size:20});setExceptions([]);}
  },[session,role,linePage,search,exceptionOnly]);

  useEffect(()=>{
    if(!getToken()){setChecking(false);return;}
    api<{user:User}>('/auth/me','employee').then(result=>setSession(result.user))
      .catch(()=>setToken(null)).finally(()=>setChecking(false));
  },[]);
  useEffect(()=>{const expired=()=>{setSession(null);setRun(null);};window.addEventListener('auth:expired',expired);return()=>window.removeEventListener('auth:expired',expired);},[]);
  useEffect(()=>{refresh().catch(err=>setError(err.message));},[refresh]);
  useEffect(()=>{if(toast){const timeout=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(timeout);}},[toast]);

  async function runAction(path:string,success:string,body:unknown={}){
    setBusy(true);setError('');
    try{await api(`/runs/RUN-2026-09/${path}`,role,{method:'POST',body:JSON.stringify(body)});
      await refresh();setToast(success);
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }

  function navigate(name:PageName){setPage(name);setMenuOpen(false);setError('');}
  async function signIn(username:string,password:string){
    const result=await api<LoginResult>('/auth/login','employee',{method:'POST',body:JSON.stringify({username,password})});
    setToken(result.token);setSession(result.user);setPage('Overview');setError('');
  }
  async function signOut(){
    try{await api('/auth/logout',role,{method:'POST'});}catch{}finally{setToken(null);setSession(null);setRun(null);setPage('Overview');}
  }

  if(checking)return <div className="auth-loading">Opening Payroll Studio…</div>;
  if(!session)return <LoginPage onSignIn={signIn}/>;
  if(session.mustChangePassword)return <FirstPasswordPage username={session.username} onComplete={()=>{setToken(null);setSession(null);}} onSignOut={signOut}/>;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <div className="brand"><span className="brand-icon"><Wallet size={22}/></span><div><strong>Payroll Studio</strong><small>DEMO WORKSPACE</small></div></div>
      <div className="org-switch"><span className="org-mark">AG</span><span><strong>Aster Group</strong><small>One organization · 5 branches</small></span><ChevronDown size={15}/></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav>{(role==='employee'?navigation.filter(item=>item.name==='Overview'):navigation).map(item=><button key={item.name} className={`nav-item ${page===item.name?'active':''}`} onClick={()=>navigate(item.name)}><item.icon size={19}/><span>{role==='employee'?'My payroll':item.name}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="demo-note"><span className="demo-dot"/>Synthetic demo data<br/><small>Calculations require rule sign-off</small></div>
        {role!=='employee'&&<button className="help-link" onClick={()=>navigate('Settings')}><CircleHelp size={18}/> Setup and guidance</button>}</div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open menu" onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
        {role==='employee'?<div className="global-search">Employee self service</div>:<div className="global-search"><Search size={18}/><input placeholder="Search employees, payroll, reports..." value={search} onChange={event=>{setSearch(event.target.value);setLinePage(1);}}/><kbd>Ctrl K</kbd></div>}
        <div className="top-actions"><span className="today"><CalendarDays size={17}/> September 2026</span><button className="icon-button" title="Notifications"><Bell size={19}/></button><div className="avatar">{session.username.slice(0,2).toUpperCase()}</div><span className="signed-in-label">{session.username} · {roleLabels[role]}</span><button className="signout-button" onClick={signOut}>Sign out</button></div>
      </header>
      <main className="content">
        {error&&<div className="message error"><strong>Action needs attention</strong><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {toast&&<div className="toast">{toast}</div>}
        {role==='employee'?<EmployeePortal key={employeeId} employeeId={employeeId} status={run?.status??'draft'}/> : <>
          {page==='Overview'&&<DashboardPage run={run} role={role} onNavigate={navigate} onCalculate={()=>runAction('calculate','Payroll calculated. Review the exceptions.')} busy={busy}/>}
          {page==='Payroll Runs'&&<PayrollPage run={run} lines={lines} exceptions={exceptions} role={role} busy={busy} onAction={runAction} onRefresh={refresh} setError={setError} setToast={setToast} search={search} onSearch={value=>{setSearch(value);setLinePage(1);}} page={linePage} onPage={setLinePage} exceptionOnly={exceptionOnly} onExceptionOnly={setExceptionOnly} onNavigate={navigate}/>}
          {(page==='People'||page==='Compensation')&&<PeoplePage role={role} compensation={page==='Compensation'} onRefresh={refresh} setError={setError} setToast={setToast}/>}
          {page==='Hierarchy'&&<HierarchyPage role={role} runStatus={run?.status??'draft'} onRefresh={refresh} setError={setError} setToast={setToast}/>}
          {page==='Taxes & Compliance'&&<CompliancePage run={run}/>}
          {page==='Reports'&&<ReportsPage run={run} role={role} setError={setError} setToast={setToast}/>}
          {page==='Settings'&&<SettingsPage role={role}/>}
        </>}
      </main>
    </div>
  </div>;
}

function LoginPage({onSignIn}:{onSignIn:(username:string,password:string)=>Promise<void>}){
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [demoAccounts,setDemoAccounts]=useState<Array<{username:string;password:string;role:Role}>>([]);
  useEffect(()=>{if(publicDemo)api<{accounts:typeof demoAccounts}>('/demo/access','employee')
    .then(result=>setDemoAccounts(result.accounts)).catch(err=>setError(err.message));},[]);
  async function enterDemo(account:{username:string;password:string}){
    setBusy(true);setError('');
    try{await onSignIn(account.username,account.password);}catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{await onSignIn(username,password);}catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="auth-page"><div className="auth-panel">
    <div className="auth-brand"><span className="brand-icon"><Wallet size={23}/></span><div><strong>Payroll Studio</strong><small>DEMO WORKSPACE</small></div></div>
    <div className="auth-intro"><span>SECURE WORKSPACE</span><h1>Welcome back</h1><p>Sign in to your payroll workspace. Your account determines which records and actions you can access.</p></div>
    <form onSubmit={submit} className="auth-form"><label>Username<input autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} required placeholder="Your username"/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required placeholder="Your password"/></label>
      {error&&<div className="auth-error" role="alert">{error}</div>}
      <button type="submit" className="button primary" disabled={busy}>{busy?'Signing in…':'Sign in'} <ArrowRight size={17}/></button></form>
    <div className="auth-demo"><strong>{publicDemo?'Explore the public demo':'Individual accounts'}</strong>
      <p>{publicDemo?'Shared fictional records can be reset by HR in Settings. Changes affect every visitor. Do not enter real employee, salary or bank information.':'Each demo role has its own password. Find setup instructions in the project README.'}</p>
      {publicDemo&&<div className="demo-role-list">{demoAccounts.map(account=><button type="button" className="button outline" disabled={busy} key={account.username} onClick={()=>enterDemo(account)}>{roleLabels[account.role]}</button>)}</div>}
      <small>{publicDemo?'Public demo · sample data only':'Synthetic data only · local evaluation'}</small></div>
  </div><aside className="auth-aside"><span>ASTER GROUP · PAYROLL 2026</span><h2>One clear place for people, payroll and compliance.</h2><p>Review pay runs, resolve exceptions, approve results, and give employees access to their own information.</p><div><span>01&nbsp; Role based access</span><span>02&nbsp; Separate finance approval</span><span>03&nbsp; Employee self service</span></div></aside></div>;
}

function FirstPasswordPage({username,onComplete,onSignOut}:{username:string;onComplete:()=>void;onSignOut:()=>void}){
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    if(newPassword!==confirmPassword){setError('The new passwords do not match');setBusy(false);return;}
    try{await api('/auth/change-password','employee',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});onComplete();}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="auth-page"><div className="auth-panel">
    <div className="auth-brand"><span className="brand-icon"><Wallet size={23}/></span><div><strong>Payroll Studio</strong><small>DEMO WORKSPACE</small></div></div>
    <div className="auth-intro"><span>ACCOUNT SETUP</span><h1>Create your password</h1><p>{username}, enter the temporary password given to you, then choose a private password. You will sign in again afterward.</p></div>
    <form onSubmit={submit} className="auth-form"><label>Temporary password<input type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} required/></label>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event=>setNewPassword(event.target.value)} required placeholder="At least 12 characters"/></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} required/></label>
      {error&&<div className="auth-error" role="alert">{error}</div>}
      <button type="submit" className="button primary" disabled={busy}>{busy?'Saving…':'Save password'} <ArrowRight size={17}/></button></form>
    <button type="button" className="signout-button" onClick={onSignOut}>Sign out</button>
  </div><aside className="auth-aside"><span>ASTER GROUP · ACCOUNT SETUP</span><h2>Your personal payroll access.</h2><p>Only you should know the password you choose.</p></aside></div>;
}

function EmployeePortal({status,employeeId}:{status:string;employeeId:string}){
  const [employee,setEmployee]=useState<Employee|null>(null);
  const [slip,setSlip]=useState<Line|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{api<Employee>(`/employees/${employeeId}`,'employee').then(setEmployee).catch(err=>setError(err.message));},[employeeId]);
  async function viewPayslip(){
    setError('');
    try{const result=await api<{line:Line}>(`/runs/RUN-2026-09/payslip/${employeeId}`,'employee');setSlip(result.line);}
    catch(err){setError((err as Error).message);}
  }
  async function chooseTaxRegime(regime:'new'|'old'){
    setError('');
    try{await api(`/employees/${employeeId}`,'employee',{method:'PATCH',body:JSON.stringify({taxRegime:regime})});
      setEmployee(current=>current?{...current,taxRegime:regime}:current);}
    catch(err){setError((err as Error).message);}
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">EMPLOYEE SELF SERVICE · SEPTEMBER 2026</div><h1>Hello, {employee?.name.split(' ')[0]??'there'}</h1><p>Your pay, tax choice and employment details.</p></div></div>
    {error&&<div className="message error">{error}</div>}
    <div className="overview-banner"><div><span className="banner-kicker">{employee?.payrollScope===false?'MY RECORD':'MY PAYSLIP'}</span><h2>{employee?.payrollScope===false?'Directory and attendance':slip?'September pay':'September payslip'}</h2><p>{employee?.payrollScope===false?'This contractor record is outside employee payroll.':slip?`Net pay ${money(slip.net)}`:['approved','reconciled','closed'].includes(status)?'Your approved payslip is ready.':'Available after Finance approval.'}</p>{employee?.payrollScope!==false&&<button className="button white" onClick={viewPayslip}>View my payslip</button>}</div></div>
    <div className="two-column"><section className="panel"><div className="panel-title"><h2>My record</h2></div><div className="detail-row"><span>Employee ID</span><strong>{employee?.id??'—'}</strong></div><div className="detail-row"><span>Position</span><strong>{employee?.jobTitle??'—'}</strong></div><div className="detail-row"><span>Branch</span><strong>{employee?.branch??'—'}</strong></div><div className="detail-row"><span>Work state</span><strong>{employee?.state??'—'}</strong></div><div className="detail-row"><span>Working days</span><strong>{employee?.workingDays??'—'}</strong></div><div className="detail-row"><span>Unpaid days</span><strong>{employee?.unpaidDays??'—'}</strong></div><div className="detail-row"><span>Leave balance</span><strong>{employee?.leaveBalanceDays??'—'} days</strong></div>{employee?.payrollScope!==false&&<><div className="detail-row"><span>Tax regime</span><strong>{employee?.taxRegime??'—'}</strong></div><div className="detail-row"><span>Bank account</span><strong>{employee?.bankAccountLast4?`•••• ${employee.bankAccountLast4}`:'Needs verification'}</strong></div><p>Tax regime selection for this demonstration pay run:</p><div className="header-buttons"><button className="button outline" disabled={status!=='draft'} onClick={()=>chooseTaxRegime('new')}>New regime</button><button className="button outline" disabled={status!=='draft'} onClick={()=>chooseTaxRegime('old')}>Old regime</button></div>{status!=='draft'&&<div className="info-strip">Tax choice is locked after calculation.</div>}</>}</section>
      <section className="panel"><div className="panel-title"><h2>{slip?'Payslip breakdown':'Pay status'}</h2></div>{slip?<><div className="detail-row"><span>Basic</span><strong>{money(slip.basic)}</strong></div><div className="detail-row"><span>HRA</span><strong>{money(slip.hra)}</strong></div><div className="detail-row"><span>Special allowance</span><strong>{money(slip.special)}</strong></div><div className="detail-row"><span>Variable pay</span><strong>{money(slip.variablePay)}</strong></div><div className="detail-row"><span>Gross</span><strong>{money(slip.gross)}</strong></div><div className="detail-row"><span>Deductions</span><strong>{money(slip.deductions)}</strong></div><div className="detail-row"><span>Net pay</span><strong>{money(slip.net)}</strong></div></>:<div className="info-strip">The payslip appears here after the run is approved.</div>}</section></div>
  </>;
}

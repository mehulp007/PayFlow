import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, Share, StyleSheet,
  Text, TextInput, View } from 'react-native';
import HierarchyView from './HierarchyView';
import { authHeaders, baseUrl, getToken, setToken } from './auth';

type Role='admin'|'hr-operator'|'payroll-operator'|'finance-approver'|'auditor'|'employee';
type User={id:string;username:string;role:Role;employeeId:string|null;mustChangePassword:boolean};
type Tab='Home'|'Payroll'|'Hierarchy'|'People'|'Reports'|'Access';
const accessRoles:Record<Role,string>={admin:'Admin','hr-operator':'HR','payroll-operator':'Payroll',
  'finance-approver':'Finance','auditor':'Auditor',employee:'Employee'};
type Run={id:string;status:string;totalEmployees:number;calculatedEmployees:number;gross:number;
  deductions:number;net:number;blocking:number;warnings:number};
type Employee={id:string;name:string;branch:string;state:string;bankReady:boolean;
  bankAccountLast4:string|null;monthlyBasic:number;monthlyHra:number;monthlySpecial:number;taxRegime:string;payrollScope:boolean;
  jobTitle:string;workingDays:number|null;unpaidDays:number|null;leaveBalanceDays:number};
type Line={employeeId:string;employeeName:string;gross:number;deductions:number;net:number;
  basic:number;hra:number;special:number;variablePay:number;pfEmployee:number;professionalTax:number;
  incomeTax:number;flags:Array<{code:string;severity:string;message:string}>};
type Exception={employeeId:string;name:string;code:string;severity:string;message:string};
const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100);

async function api<T>(path:string,_role:Role,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${baseUrl}/api${path}`,{...options,
    headers:{...(options.body===undefined?{}:{'content-type':'application/json'}),...authHeaders(),...options.headers}});
  if(response.status===401&&path!=='/auth/login')setToken(null);
  if(!response.ok){const body=await response.json().catch(()=>({error:'Request failed'}));throw new Error(body.error);}
  return response.json() as Promise<T>;
}
function Card({children,tone}:{children:ReactNode;tone?:'hero'|'danger'|'success'}){
  return <View style={[s.card,tone==='hero'&&s.hero,tone==='danger'&&s.danger,tone==='success'&&s.success]}>{children}</View>;
}
function Button({label,onPress,secondary,disabled}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
  return <Pressable disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.buttonSecondary,disabled&&s.disabled]}><Text style={[s.buttonText,secondary&&s.buttonSecondaryText]}>{label}</Text></Pressable>;
}
function Row({label,value}:{label:string;value:string}){
  return <View style={s.row}><Text style={s.muted}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}

export default function App(){
  const [session,setSession]=useState<User|null>(null);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [loginError,setLoginError]=useState('');
  const [loginBusy,setLoginBusy]=useState(false);
  const [passwordOpen,setPasswordOpen]=useState(false);
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const role=session?.role??'employee';
  const employeeId=session?.employeeId??'';
  const [tab,setTab]=useState<Tab>('Home');
  const [run,setRun]=useState<Run|null>(null);
  const [exceptions,setExceptions]=useState<Exception[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState<Employee|null>(null);
  const [payslip,setPayslip]=useState<Line|null>(null);
  const [importOpen,setImportOpen]=useState(false);
  const [importCsv,setImportCsv]=useState('employee_id,variable_pay,other_deduction,unpaid_days,working_days,note\nEMP00001,2500,0,0,30,September bonus');
  const [importPreview,setImportPreview]=useState<{valid:unknown[];errors:Array<{row:number;message:string}>}|null>(null);
  const [error,setError]=useState('');
  const [working,setWorking]=useState(false);
  const [accessUsers,setAccessUsers]=useState<User[]>([]);
  const [accountUsername,setAccountUsername]=useState('');
  const [accountRole,setAccountRole]=useState<Role>('employee');
  const [accountEmployeeId,setAccountEmployeeId]=useState('');
  const [createdCredential,setCreatedCredential]=useState<{username:string;password:string}|null>(null);
  const refresh=useCallback(async()=>{
    if(!session||session.mustChangePassword)return;
    try{
      const next=await api<Run>('/runs/RUN-2026-09',role);setRun(next);setError('');
      if(role==='employee')setEmployees([await api<Employee>(`/employees/${employeeId}`,role)]);
      else{
        const list=await api<{items:Employee[]}>(`/employees?size=30&search=${encodeURIComponent(search)}`,role);
        setEmployees(list.items);
        setExceptions(next.calculatedEmployees?await api<Exception[]>('/runs/RUN-2026-09/exceptions',role):[]);
      }
    }catch(err){if(!getToken())setSession(null);else setError((err as Error).message);}
  },[session,role,employeeId,search]);
  useEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{
    if(tab==='Access'&&role==='admin'&&!session?.mustChangePassword)
      api<User[]>('/auth/users',role).then(setAccessUsers).catch(err=>Alert.alert('Accounts unavailable',(err as Error).message));
  },[tab,role,session?.mustChangePassword]);

  async function signIn(){
    setLoginBusy(true);setLoginError('');
    try{
      if(!baseUrl)throw new Error('This app build has no hosted API address. Ask the administrator for an updated build.');
      const response=await fetch(`${baseUrl}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
      const result=await response.json() as {token?:string;user?:User;error?:string};
      if(!response.ok||!result.token||!result.user)throw new Error(result.error??'Sign in failed');
      setToken(result.token);setSession(result.user);setPassword('');setTab('Home');
    }catch(err){setLoginError((err as Error).message);}finally{setLoginBusy(false);}
  }
  async function signOut(){
    try{if(getToken())await api('/auth/logout',role,{method:'POST'});}catch{}
    setToken(null);setSession(null);setRun(null);setEmployees([]);setExceptions([]);setTab('Home');
  }
  async function updatePassword(){
    try{
      if(newPassword!==confirmPassword)throw new Error('The new passwords do not match');
      await api('/auth/change-password',role,{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
      setToken(null);setSession(null);setPasswordOpen(false);setCurrentPassword('');setNewPassword('');setConfirmPassword('');
      Alert.alert('Password changed','Sign in with your new password.');
    }catch(err){Alert.alert('Password not changed',(err as Error).message);}
  }
  async function createAccount(){
    setWorking(true);setCreatedCredential(null);
    try{
      const created=await api<User&{temporaryPassword:string}>('/auth/users',role,{method:'POST',body:JSON.stringify({
        username:accountUsername,role:accountRole,employeeId:accountRole==='employee'?accountEmployeeId:undefined,
      })});
      setAccessUsers(current=>[...current,created].sort((a,b)=>a.username.localeCompare(b.username)));
      setCreatedCredential({username:created.username,password:created.temporaryPassword});
      setAccountUsername('');setAccountEmployeeId('');
    }catch(err){Alert.alert('Account not created',(err as Error).message);}finally{setWorking(false);}
  }
  async function resetAccountPassword(user:User){
    setWorking(true);setCreatedCredential(null);
    try{
      const result=await api<{temporaryPassword:string}>(`/auth/users/${user.id}/reset-password`,role,{method:'POST'});
      setAccessUsers(current=>current.map(item=>item.id===user.id?{...item,mustChangePassword:true}:item));
      setCreatedCredential({username:user.username,password:result.temporaryPassword});
    }catch(err){Alert.alert('Password not reset',(err as Error).message);}finally{setWorking(false);}
  }

  async function doAction(path:string,success:string,body:unknown={}){
    setWorking(true);
    try{await api(`/runs/RUN-2026-09/${path}`,role,{method:'POST',body:JSON.stringify(body)});
      await refresh();Alert.alert('Done',success);
    }catch(err){Alert.alert('Action needs attention',(err as Error).message);}finally{setWorking(false);}
  }
  async function fixBank(id:string){
    setWorking(true);
    try{await api(`/employees/${id}`,role,{method:'PATCH',body:JSON.stringify({bankReady:true,bankAccountLast4:'1234'})});
      await refresh();Alert.alert('Demo record updated','Recalculate to clear the exception.');
    }catch(err){Alert.alert('Error',(err as Error).message);}finally{setWorking(false);}
  }
  async function openPayslip(id:string){
    try{const result=await api<{line:Line}>(`/runs/RUN-2026-09/payslip/${id}`,role);setPayslip(result.line);}
    catch(err){Alert.alert('Payslip unavailable',(err as Error).message);}
  }
  async function shareReport(kind:string){
    try{const response=await fetch(`${baseUrl}/api/runs/RUN-2026-09/export/${kind}`,{headers:authHeaders()});
      if(!response.ok){const body=await response.json();throw new Error(body.error);}
      await Share.share({title:`${kind} demonstration`,message:await response.text()});
    }catch(err){Alert.alert('Export unavailable',(err as Error).message);}
  }
  async function previewImport(){
    setWorking(true);
    try{setImportPreview(await api('/runs/RUN-2026-09/import/preview',role,{method:'POST',body:JSON.stringify({csv:importCsv})}));}
    catch(err){Alert.alert('Import preview failed',(err as Error).message);}finally{setWorking(false);}
  }
  async function commitImport(){
    setWorking(true);
    try{await api('/runs/RUN-2026-09/import/commit',role,{method:'POST',body:JSON.stringify({csv:importCsv})});
      setImportOpen(false);setImportPreview(null);Alert.alert('Inputs imported','The rows are ready for calculation.');}
    catch(err){Alert.alert('Import failed',(err as Error).message);}finally{setWorking(false);}
  }
  async function chooseTaxRegime(regime:'new'|'old'){
    try{await api(`/employees/${employeeId}`,role,{method:'PATCH',body:JSON.stringify({taxRegime:regime})});
      setSelected(current=>current?{...current,taxRegime:regime}:current);
      await refresh();Alert.alert('Tax choice saved',`${regime==='new'?'New':'Old'} regime selected for this demonstration run.`);}
    catch(err){Alert.alert('Tax choice unavailable',(err as Error).message);}
  }

  if(!session)return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.loginContent} keyboardShouldPersistTaps="handled"><View style={s.loginMark}><Text style={s.brand}>Aster Payroll</Text><Text style={s.brandSub}>INDIA WORKSPACE · SYNTHETIC DEMO</Text></View><Text style={s.title}>Welcome back</Text><Text style={s.subtitle}>Sign in with your assigned account to open your payroll workspace.</Text><Card><Text style={s.cardTitle}>Username</Text><TextInput style={s.search} autoCapitalize="none" autoComplete="username" value={username} onChangeText={setUsername} placeholder="Your username"/><Text style={s.cardTitle}>Password</Text><TextInput style={s.search} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Password"/>{loginError?<Text style={s.errorTitle}>{loginError}</Text>:null}<Button label={loginBusy?'Signing in…':'Sign in'} disabled={loginBusy||!username||!password} onPress={signIn}/></Card><Text style={s.muted}>Each demo role has its own password. See the project README for setup. This app uses fictional data.</Text></ScrollView></SafeAreaView>;

  if(session.mustChangePassword)return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.loginContent} keyboardShouldPersistTaps="handled"><View style={s.loginMark}><Text style={s.brand}>Aster Payroll</Text><Text style={s.brandSub}>ACCOUNT SETUP</Text></View><Text style={s.title}>Create your password</Text><Text style={s.subtitle}>Enter your temporary password, then choose a private password. Sign in again when saved.</Text><Card><Text style={s.cardTitle}>Temporary password</Text><TextInput style={s.search} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword}/><Text style={s.cardTitle}>New password</Text><TextInput style={s.search} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="At least 12 characters"/><Text style={s.cardTitle}>Confirm new password</Text><TextInput style={s.search} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword}/><Button label="Save password" disabled={!currentPassword||newPassword.length<12||!confirmPassword} onPress={updatePassword}/><Button label="Sign out" secondary onPress={signOut}/></Card></ScrollView></SafeAreaView>;

  const employeeMode=role==='employee';
  const canPrepare=['admin','hr-operator','payroll-operator'].includes(role);
  const canEditRecord=['admin','hr-operator'].includes(role);
  const tabs:Tab[]=employeeMode?['Home','People','Reports']:
    role==='admin'?['Home','Payroll','Hierarchy','People','Reports','Access']:['Home','Payroll','Hierarchy','People','Reports'];
  return <SafeAreaView style={s.safe}><StatusBar style="dark"/>
    <View style={s.header}><View><Text style={s.brand}>Aster Payroll</Text><Text style={s.brandSub}>INDIA · SYNTHETIC DEMO</Text></View><Text style={s.avatar}>{session.username.slice(0,2).toUpperCase()}</Text></View>
    <View style={s.roleBar}><Text style={s.roleLabel}>{session.username} · {role.replaceAll('-',' ')}</Text><Pressable onPress={()=>setPasswordOpen(true)}><Text style={s.roleTextSelected}>Password</Text></Pressable><Pressable onPress={signOut}><Text style={s.roleTextSelected}>Sign out</Text></Pressable></View>
    {error?<View style={s.error}><Text style={s.errorTitle}>Cannot reach the payroll API</Text><Text style={s.muted}>{error}. For a phone, set EXPO_PUBLIC_API_URL to the computer's LAN address.</Text><Button label="Try again" secondary onPress={refresh}/></View>:
    <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
      {tab==='Home'&&<><Text style={s.eyebrow}>SEPTEMBER 2026 · TAX YEAR 2026–27</Text><Text style={s.title}>{employeeMode?`Hello, ${employees[0]?.name.split(' ')[0]??'there'}`:'Payroll overview'}</Text><Text style={s.subtitle}>{employeeMode?'Your pay and employment details.':'Review the run and resolve anything blocking approval.'}</Text>
        {employeeMode?<><Card tone="hero"><Text style={s.heroKicker}>{employees[0]?.payrollScope===false?'MY RECORD':'MY PAYSLIP'}</Text><Text style={s.heroTitle}>{employees[0]?.payrollScope===false?'Directory and attendance':'September pay'}</Text><Text style={s.heroDetail}>{employees[0]?.payrollScope===false?'Contractor record outside employee payroll.':run?.status==='approved'||run?.status==='reconciled'?'Your payslip is ready.':'Available after Finance approval.'}</Text>{employees[0]?.payrollScope!==false&&<Button label="View my payslip →" onPress={()=>openPayslip(employeeId)}/>}</Card><Card><Text style={s.cardTitle}>Your information</Text><Row label="Employee ID" value={employeeId}/><Row label="Position" value={employees[0]?.jobTitle??'—'}/><Row label="Working days" value={String(employees[0]?.workingDays??'—')}/><Row label="Unpaid days" value={String(employees[0]?.unpaidDays??'—')}/><Row label="Leave balance" value={`${employees[0]?.leaveBalanceDays??'—'} days`}/>{employees[0]?.payrollScope!==false&&<><Row label="Tax year" value="2026–27"/><Row label="Payroll status" value={run?.status.replaceAll('_',' ')??'—'}/></>}</Card></>:
        <><Card tone="hero"><Text style={s.heroKicker}>CURRENT PAY RUN</Text><Text style={s.heroTitle}>September 2026</Text><Text style={s.heroDetail}>{run?.status.replaceAll('_',' ')} · {run?.totalEmployees?.toLocaleString('en-IN')} employees</Text><Button label="Open payroll run →" onPress={()=>setTab('Payroll')}/></Card><View style={s.metrics}><View style={s.metric}><Card><Text style={s.muted}>Gross pay</Text><Text style={s.metricValue}>{money(run?.gross??0)}</Text></Card></View><View style={s.metric}><Card><Text style={s.muted}>Net pay</Text><Text style={s.metricValue}>{money(run?.net??0)}</Text></Card></View></View><Card><Text style={s.cardTitle}>Needs attention</Text><Row label="Blocking" value={String(run?.blocking??0)}/><Row label="Warnings" value={String(run?.warnings??0)}/><Button label="Review exceptions" secondary onPress={()=>setTab('Payroll')}/></Card></>}
      </>}
      {tab==='Payroll'&&!employeeMode&&<><Text style={s.eyebrow}>PAYROLL RUN / SEPTEMBER 2026</Text><Text style={s.title}>Review & approve</Text><Text style={s.subtitle}>Inputs → Review → Approval → Disbursement</Text><Card><Text style={s.cardTitle}>Run totals</Text><Row label="Employees" value={run?.totalEmployees?.toLocaleString('en-IN')??'—'}/><Row label="Calculated" value={run?.calculatedEmployees?.toLocaleString('en-IN')??'—'}/><Row label="Gross pay" value={money(run?.gross??0)}/><Row label="Deductions" value={money(run?.deductions??0)}/><Row label="Net pay" value={money(run?.net??0)}/></Card>
        {run?.status==='draft'&&<><Button label="Import attendance and variable pay" secondary disabled={working||!canPrepare} onPress={()=>setImportOpen(true)}/><Button label={working?'Calculating…':'Calculate payroll'} disabled={working||!canPrepare} onPress={()=>doAction('calculate','Payroll calculated.')}/></>}
        {run?.status==='calculated'&&<><Button label="Recalculate" secondary disabled={working||!canPrepare} onPress={()=>doAction('calculate','Results refreshed.')}/><Button label="Send for Finance approval" disabled={working||!canPrepare||run.blocking>0} onPress={()=>doAction('submit','Sent for Finance approval.')}/></>}
        {run?.status==='approval_pending'&&<Button label="Approve payroll" disabled={working||role!=='finance-approver'} onPress={()=>Alert.alert('Approve payroll',`Confirm ${money(run.net)} net pay?`,[{text:'Cancel'},{text:'Approve',onPress:()=>doAction('approve','Payroll approved.',{note:'Approved in mobile demo'})}])}/>}
        {run?.status==='approved'&&<><Button label="Share demo bank export" onPress={()=>shareReport('bank-demo')}/><Button label="Simulate reconciliation" secondary disabled={role!=='finance-approver'} onPress={()=>doAction('reconcile-demo','Demo reconciliation recorded.')}/></>}
        {run?.status==='reconciled'&&<Card tone="success"><Text style={s.successText}>✓ Synthetic reconciliation recorded</Text></Card>}
        <Text style={s.sectionTitle}>Exceptions ({exceptions.length})</Text>{exceptions.slice(0,30).map((item,index)=><Card key={`${item.employeeId}-${item.code}-${index}`} tone={item.severity==='blocking'?'danger':undefined}><Text style={s.personName}>{item.name} · {item.employeeId}</Text><Text style={s.muted}>{item.message}</Text><Text style={s.exceptionCode}>{item.code}</Text>{item.code==='BANK_MISSING'&&canEditRecord&&<Button label="Verify synthetic bank details" secondary disabled={working} onPress={()=>fixBank(item.employeeId)}/>}</Card>)}{!exceptions.length&&<Card><Text style={s.muted}>{run?.calculatedEmployees?'No exceptions.':'Calculate to see exception checks.'}</Text></Card>}
      </>}
      {tab==='Hierarchy'&&!employeeMode&&<HierarchyView role={role} runStatus={run?.status??'draft'} onCreated={refresh}/>}
      {tab==='People'&&<><Text style={s.eyebrow}>PEOPLE / COMPENSATION</Text><Text style={s.title}>{employeeMode?'My record':'Employee directory'}</Text><Text style={s.subtitle}>{employeeMode?'Your payroll profile.':'Search employee salary and statutory setup.'}</Text>{!employeeMode&&<TextInput style={s.search} placeholder="Search employee name or ID" value={search} onChangeText={setSearch}/>}<View>{employees.map(item=><Pressable key={item.id} onPress={()=>setSelected(item)}><Card><Text style={s.personName}>{item.name}</Text><Text style={s.muted}>{item.id} · {item.branch}, {item.state}  ›</Text></Card></Pressable>)}</View></>}
      {tab==='Reports'&&<><Text style={s.eyebrow}>REPORTS / EXPORTS</Text><Text style={s.title}>{employeeMode?'My documents':'Payroll reports'}</Text><Text style={s.subtitle}>{employeeMode?'Payslips become available after approval.':'Preparation data using synthetic employee records.'}</Text>{employeeMode?(employees[0]?.payrollScope===false?<Card><Text style={s.muted}>This contractor record is outside employee payroll.</Text></Card>:<Button label="View my payslip" onPress={()=>openPayslip(employeeId)}/>):[['salary-register','Salary register'],['bank-demo','Demo bank file'],['epf-prep','EPF preparation'],['esi-prep','ESI preparation'],['form138-prep','Form 138 preparation'],['state-deductions','State deductions']].map(([kind,label])=><Card key={kind}><Text style={s.personName}>{label}</Text><Text style={s.muted}>CSV · demonstration data</Text><Button label="Share report" secondary onPress={()=>shareReport(kind)}/></Card>)}</>}
      {tab==='Access'&&role==='admin'&&<><Text style={s.eyebrow}>SETTINGS / ACCESS</Text><Text style={s.title}>Individual accounts</Text><Text style={s.subtitle}>Create a username for each person. They choose a private password at first sign-in.</Text><Card><Text style={s.cardTitle}>Add account</Text><TextInput style={s.search} autoCapitalize="none" value={accountUsername} onChangeText={setAccountUsername} placeholder="Username"/><ScrollView horizontal showsHorizontalScrollIndicator={false}>{(Object.keys(accessRoles) as Role[]).map(item=><Pressable key={item} onPress={()=>setAccountRole(item)} style={[s.roleChip,accountRole===item&&s.roleSelected]}><Text style={s.roleText}>{accessRoles[item]}</Text></Pressable>)}</ScrollView>{accountRole==='employee'&&<TextInput style={[s.search,{marginTop:12}]} autoCapitalize="characters" value={accountEmployeeId} onChangeText={value=>setAccountEmployeeId(value.toUpperCase())} placeholder="Employee ID"/>}<Button label={working?'Creating…':'Create account'} disabled={working||accountUsername.trim().length<2||(accountRole==='employee'&&!accountEmployeeId)} onPress={createAccount}/></Card>{createdCredential&&<Card tone="success"><Text style={s.cardTitle}>Give this password privately to {createdCredential.username}</Text><Text selectable style={s.personName}>{createdCredential.password}</Text><Text style={s.muted}>Shown once. This person must change it before using the app.</Text><Button label="Share credential" secondary onPress={()=>Share.share({message:`Aster Payroll preview\nUsername: ${createdCredential.username}\nTemporary password: ${createdCredential.password}\nPlease change it at first sign-in.`})}/></Card>}{accessUsers.map(user=><Card key={user.id}><Text style={s.personName}>{user.username}</Text><Text style={s.muted}>{accessRoles[user.role]}{user.employeeId?` · ${user.employeeId}`:''}{user.mustChangePassword?' · Setup pending':''}</Text>{user.role!=='admin'&&<Button label="Reset password" secondary disabled={working} onPress={()=>Alert.alert('Reset password',`Issue new temporary access for ${user.username}? Their current sessions will end.`,[{text:'Cancel'},{text:'Reset',onPress:()=>resetAccountPassword(user)}])}/>}</Card>)}</>}
    </ScrollView>}
    <View style={s.tabs}>{tabs.map(item=><Pressable key={item} onPress={()=>setTab(item)} style={[s.tab,tab===item&&s.tabSelected]}><Text style={[s.tabText,tab===item&&s.tabTextSelected]}>{item}</Text></Pressable>)}</View>
    <Modal visible={passwordOpen} animationType="slide" onRequestClose={()=>setPasswordOpen(false)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.modalContent}><Pressable onPress={()=>setPasswordOpen(false)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>ACCOUNT</Text><Text style={s.title}>Change password</Text><Text style={s.subtitle}>Changing your password signs out all your sessions.</Text><Text style={s.cardTitle}>Current password</Text><TextInput style={s.search} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword}/><Text style={s.cardTitle}>New password</Text><TextInput style={s.search} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="At least 12 characters"/><Text style={s.cardTitle}>Confirm new password</Text><TextInput style={s.search} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword}/><Button label="Update password" disabled={!currentPassword||newPassword.length<12||!confirmPassword} onPress={updatePassword}/></ScrollView></SafeAreaView></Modal>
    <Modal visible={selected!==null} animationType="slide" onRequestClose={()=>setSelected(null)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.modalContent}><Pressable onPress={()=>setSelected(null)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>EMPLOYEE RECORD</Text><Text style={s.title}>{selected?.name}</Text><Text style={s.subtitle}>{selected?.id} · {selected?.branch}, {selected?.state}</Text><Card><Text style={s.cardTitle}>Monthly salary</Text><Row label="Basic" value={money(selected?.monthlyBasic??0)}/><Row label="HRA" value={money(selected?.monthlyHra??0)}/><Row label="Special" value={money(selected?.monthlySpecial??0)}/><Row label="Regular gross" value={money((selected?.monthlyBasic??0)+(selected?.monthlyHra??0)+(selected?.monthlySpecial??0))}/></Card><Card><Text style={s.cardTitle}>Tax & payment</Text><Row label="Tax regime" value={selected?.taxRegime??'—'}/><Row label="Bank status" value={selected?.bankReady?'Verified':'Missing'}/><Row label="Account ending" value={selected?.bankAccountLast4??'—'}/>{employeeMode&&selected?.payrollScope!==false&&run?.status==='draft'&&<><Button label="Choose new tax regime" secondary onPress={()=>chooseTaxRegime('new')}/><Button label="Choose old tax regime" secondary onPress={()=>chooseTaxRegime('old')}/></>}</Card>{selected?.payrollScope!==false&&selected&&<Button label="View payslip" onPress={()=>openPayslip(selected.id)}/>}</ScrollView></SafeAreaView></Modal>
    <Modal visible={importOpen} animationType="slide" onRequestClose={()=>setImportOpen(false)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.modalContent}><Pressable onPress={()=>setImportOpen(false)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>PAYROLL INPUTS</Text><Text style={s.title}>Import inputs</Text><Text style={s.subtitle}>Paste validated CSV rows for attendance, variable pay and other deductions.</Text><TextInput multiline value={importCsv} onChangeText={value=>{setImportCsv(value);setImportPreview(null);}} style={[s.search,{minHeight:180,textAlignVertical:'top'}]}/>{importPreview&&<Card tone={importPreview.errors.length?'danger':'success'}><Text style={s.personName}>{importPreview.valid.length} valid rows · {importPreview.errors.length} errors</Text>{importPreview.errors.slice(0,5).map((item,index)=><Text style={s.muted} key={index}>{item.row?`Row ${item.row}`:'File'}: {item.message}</Text>)}</Card>}<Button label="Preview import" secondary disabled={working} onPress={previewImport}/><Button label="Import rows" disabled={working||!importPreview||importPreview.errors.length>0} onPress={commitImport}/></ScrollView></SafeAreaView></Modal>
    <Modal visible={payslip!==null} animationType="slide" onRequestClose={()=>setPayslip(null)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.modalContent}><Pressable onPress={()=>setPayslip(null)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>PAYSLIP / SEPTEMBER 2026</Text><Text style={s.title}>{payslip?.employeeName}</Text><Card><Text style={s.muted}>NET PAY</Text><Text style={s.payslipNet}>{money(payslip?.net??0)}</Text><Text style={s.muted}>Synthetic demonstration payslip</Text></Card><Card><Text style={s.cardTitle}>Earnings</Text><Row label="Basic" value={money(payslip?.basic??0)}/><Row label="HRA" value={money(payslip?.hra??0)}/><Row label="Special" value={money(payslip?.special??0)}/><Row label="Variable" value={money(payslip?.variablePay??0)}/><Row label="Gross" value={money(payslip?.gross??0)}/></Card><Card><Text style={s.cardTitle}>Deductions</Text><Row label="Provident fund" value={money(payslip?.pfEmployee??0)}/><Row label="Professional tax" value={money(payslip?.professionalTax??0)}/><Row label="Income tax" value={money(payslip?.incomeTax??0)}/><Row label="Total" value={money(payslip?.deductions??0)}/></Card></ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}

const navy='#142449',blue='#2455bb',muted='#8190a8';
const s=StyleSheet.create({loginContent:{flexGrow:1,justifyContent:'center',padding:24},loginMark:{marginBottom:55},safe:{flex:1,backgroundColor:'#f5f7fb'},header:{backgroundColor:'#fff',borderBottomWidth:1,borderColor:'#e4eaf3',paddingHorizontal:18,paddingVertical:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{fontSize:17,fontWeight:'800',color:navy},brandSub:{fontSize:9,letterSpacing:2,color:'#7290bf',fontWeight:'800'},avatar:{width:33,height:33,borderRadius:17,overflow:'hidden',backgroundColor:blue,color:'#fff',textAlign:'center',textAlignVertical:'center',fontSize:10,fontWeight:'800'},roleBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,paddingHorizontal:16,paddingVertical:9,backgroundColor:'#fff'},roleLabel:{fontSize:9,fontWeight:'800',color:'#a0aab9',marginRight:3},roleChip:{borderRadius:16,borderWidth:1,borderColor:'#dfe5ef',paddingHorizontal:10,paddingVertical:6},roleSelected:{backgroundColor:'#eaf1ff',borderColor:'#a9c3f1'},roleText:{fontSize:10,fontWeight:'700',color:'#71809a'},roleTextSelected:{color:blue},scroll:{flex:1},scrollContent:{padding:16,paddingBottom:35},eyebrow:{fontSize:9,color:'#5b7fbb',letterSpacing:1.5,fontWeight:'800',marginBottom:7},title:{fontSize:25,color:navy,fontWeight:'800',marginBottom:4},subtitle:{fontSize:12,color:muted,lineHeight:18,marginBottom:17},card:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#e5eaf3',padding:16,marginBottom:11},hero:{backgroundColor:'#214b9d',borderColor:'#214b9d',padding:21},heroKicker:{fontSize:9,fontWeight:'800',letterSpacing:2,color:'#bad2fc'},heroTitle:{fontSize:21,fontWeight:'800',color:'#fff',marginTop:8},heroDetail:{fontSize:11,color:'#deebff',marginTop:5,marginBottom:13},button:{backgroundColor:blue,borderRadius:8,alignItems:'center',padding:12,marginTop:7},buttonSecondary:{backgroundColor:'#eaf1ff',borderWidth:1,borderColor:'#c8d9f8'},buttonText:{color:'#fff',fontSize:11,fontWeight:'800'},buttonSecondaryText:{color:blue},disabled:{opacity:.5},metrics:{flexDirection:'row',gap:9},metric:{flex:1},metricValue:{fontSize:16,color:navy,fontWeight:'800',marginTop:7},muted:{fontSize:11,color:muted,lineHeight:17},cardTitle:{fontSize:14,color:navy,fontWeight:'800',marginBottom:9},row:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderColor:'#edf1f6',paddingVertical:10},rowValue:{color:navy,fontSize:11,fontWeight:'800'},sectionTitle:{fontSize:14,color:navy,fontWeight:'800',marginTop:20,marginBottom:10},danger:{backgroundColor:'#fff4f4',borderColor:'#f6dddd'},success:{backgroundColor:'#e9f8f0',borderColor:'#d1ecdd'},successText:{color:'#168b68',fontWeight:'800',fontSize:11},personName:{color:navy,fontSize:12,fontWeight:'800',marginBottom:3},exceptionCode:{color:'#a0abbc',fontSize:9,marginTop:5},search:{backgroundColor:'#fff',borderColor:'#dfe6f1',borderWidth:1,borderRadius:8,padding:11,marginBottom:13,fontSize:12},tabs:{backgroundColor:'#fff',borderTopWidth:1,borderColor:'#e5eaf3',flexDirection:'row',padding:6},tab:{flex:1,alignItems:'center',padding:11,borderRadius:7},tabSelected:{backgroundColor:'#eaf1ff'},tabText:{fontSize:10,fontWeight:'800',color:'#8895a9'},tabTextSelected:{color:blue},error:{padding:20,margin:15,backgroundColor:'#fff1f1',borderRadius:10},errorTitle:{fontSize:13,color:'#bb4953',fontWeight:'800',marginBottom:7},modalContent:{padding:20,paddingBottom:40},close:{fontSize:12,fontWeight:'800',color:blue,marginBottom:24},payslipNet:{fontSize:28,color:navy,fontWeight:'800',marginVertical:5}});

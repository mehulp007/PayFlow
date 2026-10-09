import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, FilterX, Network, Plus, Search, X } from 'lucide-react';
import { api, money, type Employee, type HierarchySummary, type ManagerOption, type Page, type Role } from './api';
import { Heading, Pill } from './ui';

type Filters={search:string;employmentType:string;level:string;department:string;state:string};
const emptyFilters:Filters={search:'',employmentType:'',level:'',department:'',state:''};
const typeLabel=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());

export default function HierarchyPage({role,runStatus,onRefresh,setError,setToast}:{role:Role;runStatus:string;
  onRefresh:()=>Promise<void>;setError:(message:string)=>void;setToast:(message:string)=>void}){
  const [summary,setSummary]=useState<HierarchySummary|null>(null);
  const [records,setRecords]=useState<Page<Employee>>({items:[],total:0,page:1,size:25});
  const [filters,setFilters]=useState<Filters>(emptyFilters);
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<Employee|null>(null);
  const [addOpen,setAddOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const updateFilter=(patch:Partial<Filters>)=>{setFilters(current=>({...current,...patch}));setPage(1);};
  const load=useCallback(async()=>{
    const params=new URLSearchParams({page:String(page),size:'25',search:filters.search,
      employmentType:filters.employmentType,level:filters.level,department:filters.department,state:filters.state});
    const [nextSummary,nextRecords]=await Promise.all([
      api<HierarchySummary>('/hierarchy/summary',role),
      api<Page<Employee>>(`/employees?${params}`,role),
    ]);
    setSummary(nextSummary);setRecords(nextRecords);
  },[role,page,filters]);
  useEffect(()=>{setLoading(true);load().catch(error=>setError((error as Error).message)).finally(()=>setLoading(false));},[load,setError]);
  async function created(employee:Employee){
    setAddOpen(false);setToast(`${employee.name} added as an active ${typeLabel(employee.employmentType)} record.`);
    await Promise.all([load(),onRefresh()]);
    setSelected(employee);
  }
  const levels=[...(summary?.positionLevels??[])].reverse();
  const countFor=(level:number,type?:string)=>summary?.counts
    .filter(item=>item.level===level&&(!type||item.employmentType===type))
    .reduce((total,item)=>total+item.count,0)??0;
  const payrollCount=summary?.counts.filter(item=>item.employmentType!=='contractor')
    .reduce((total,item)=>total+item.count,0)??0;
  const canAdd=['admin','hr-operator'].includes(role)&&runStatus==='draft';
  return <>
    <Heading eyebrow="PEOPLE / ORGANIZATION HIERARCHY" title="Employee hierarchy"
      description="Explore employment types and reporting levels, then open any person for their full record."
      action={<button className="button primary" disabled={!canAdd} onClick={()=>setAddOpen(true)}><Plus size={17}/> Add employee</button>}/>
    {runStatus!=='draft'&&['admin','hr-operator'].includes(role)&&<div className="notice">New records can be added before this demo payroll is calculated. Reset the demo run to start a new intake.</div>}
    <div className="hierarchy-metrics">
      <div className="panel"><span>People in directory</span><strong>{(summary?.total??0).toLocaleString('en-IN')}</strong><small>All employment types</small></div>
      <div className="panel"><span>In employee payroll</span><strong>{payrollCount.toLocaleString('en-IN')}</strong><small>Excludes contractors</small></div>
      <div className="panel"><span>Contractor records</span><strong>{(summary?.counts.filter(item=>item.employmentType==='contractor').reduce((total,item)=>total+item.count,0)??0).toLocaleString('en-IN')}</strong><small>Directory and attendance only</small></div>
    </div>
    <section className="panel hierarchy-map"><div className="panel-title"><div><h2>Position levels</h2><p>Click a level or a category count to filter the people below.</p></div><Network size={21}/></div>
      <div className="hierarchy-legend">{summary?.employmentTypes.map(type=><button key={type} className={`hierarchy-legend-chip ${filters.employmentType===type?'selected':''}`} onClick={()=>updateFilter({employmentType:filters.employmentType===type?'':type})}>{typeLabel(type)}</button>)}</div>
      <div className="hierarchy-levels">{levels.map(item=><div className="hierarchy-level" key={item.level}>
        <button className={`hierarchy-level-name ${filters.level===String(item.level)?'selected':''}`} onClick={()=>updateFilter({level:filters.level===String(item.level)?'':String(item.level)})}><span>L{item.level}</span><strong>{item.label}</strong><small>{countFor(item.level).toLocaleString('en-IN')} people</small></button>
        <div className="hierarchy-level-types">{summary?.employmentTypes.map(type=>{const count=countFor(item.level,type);return <button key={type} disabled={!count} className={filters.level===String(item.level)&&filters.employmentType===type?'selected':''} onClick={()=>updateFilter({level:String(item.level),employmentType:type})}><strong>{count}</strong><span>{typeLabel(type)}</span></button>;})}</div>
      </div>)}</div>
    </section>
    <section className="panel hierarchy-directory"><div className="panel-title"><div><h2>People matching your filters</h2><p>{records.total.toLocaleString('en-IN')} records · select a row for all work, pay, attendance and leave details</p></div>{Object.values(filters).some(Boolean)&&<button className="button outline" onClick={()=>{setFilters(emptyFilters);setPage(1);}}><FilterX size={15}/> Clear filters</button>}</div>
      <div className="hierarchy-filters"><label className="table-search"><Search size={16}/><input aria-label="Search people" placeholder="Search name, ID or job title" value={filters.search} onChange={event=>updateFilter({search:event.target.value})}/></label>
        <select aria-label="Employment type" value={filters.employmentType} onChange={event=>updateFilter({employmentType:event.target.value})}><option value="">All types</option>{summary?.employmentTypes.map(type=><option key={type} value={type}>{typeLabel(type)}</option>)}</select>
        <select aria-label="Position level" value={filters.level} onChange={event=>updateFilter({level:event.target.value})}><option value="">All levels</option>{summary?.positionLevels.map(item=><option key={item.level} value={item.level}>L{item.level} · {item.label}</option>)}</select>
        <select aria-label="Department" value={filters.department} onChange={event=>updateFilter({department:event.target.value})}><option value="">All departments</option>{summary?.departments.map(item=><option key={item}>{item}</option>)}</select>
        <select aria-label="Work state" value={filters.state} onChange={event=>updateFilter({state:event.target.value})}><option value="">All states</option>{summary?.branches.map(item=><option key={item.state}>{item.state}</option>)}</select>
      </div>
      <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Type</th><th>Position</th><th>Department</th><th>Location</th><th>Reports to</th><th>Attendance</th><th>Leave</th><th>Pay</th><th>Details</th></tr></thead><tbody>{records.items.map(person=><tr key={person.id} onClick={()=>setSelected(person)}>
        <td><strong>{person.name}</strong><small>{person.id} · {person.employmentStatus}</small></td>
        <td><Pill tone={person.employmentType==='contractor'?'warning':'info'}>{typeLabel(person.employmentType)}</Pill></td>
        <td><strong>L{person.positionLevel} · {person.jobTitle}</strong></td><td>{person.department}</td>
        <td>{person.branch}<small>{person.state}</small></td><td>{person.managerName??'—'}</td>
        <td>{person.workingDays===null?'—':`${person.workingDays-(person.unpaidDays??0)}/${person.workingDays} paid`}</td>
        <td>{person.leaveBalanceDays} days</td><td>{person.payrollScope?money(person.monthlyBasic+person.monthlyHra+person.monthlySpecial):'Outside payroll'}</td>
        <td><button className="icon-button" aria-label={`View full record for ${person.name}`} onClick={()=>setSelected(person)}><ArrowRight size={16}/></button></td>
      </tr>)}</tbody></table>{!records.items.length&&<div className="hierarchy-empty">{loading?'Loading people…':'No employees match these filters.'}</div>}</div>
      {records.total>0&&<div className="pagination"><span>Showing {(page-1)*records.size+1}–{Math.min(page*records.size,records.total)} of {records.total.toLocaleString('en-IN')}</span><div><button aria-label="Previous page" disabled={page<=1} onClick={()=>setPage(page-1)}><ChevronLeft size={16}/></button><span>Page {page} / {Math.ceil(records.total/records.size)}</span><button aria-label="Next page" disabled={page*records.size>=records.total} onClick={()=>setPage(page+1)}><ChevronRight size={16}/></button></div></div>}
    </section>
    {selected&&<EmployeeDetail person={selected} onClose={()=>setSelected(null)}/>}
    {addOpen&&summary&&<AddEmployee role={role} summary={summary} onClose={()=>setAddOpen(false)} onCreated={created}/>}
  </>;
}

function EmployeeDetail({person,onClose}:{person:Employee;onClose:()=>void}){
  const pair=(label:string,value:string)=><div className="detail-row" key={label}><span>{label}</span><strong>{value}</strong></div>;
  return <div className="overlay" onClick={onClose}><aside className="drawer" onClick={event=>event.stopPropagation()}><div className="drawer-header"><div><small>FULL EMPLOYEE RECORD</small><h2>{person.name}</h2><span>{person.id} · {person.employmentStatus}</span></div><button className="icon-button" aria-label="Close employee details" onClick={onClose}><X size={20}/></button></div><div className="drawer-body">
    <div className="hierarchy-detail-banner"><span>L{person.positionLevel}</span><div><strong>{person.jobTitle}</strong><small>{typeLabel(person.employmentType)} · {person.department}</small></div></div>
    <h3>Work and reporting</h3>{[
      pair('Employment type',typeLabel(person.employmentType)),pair('Position level',`L${person.positionLevel}`),
      pair('Job title',person.jobTitle),pair('Department',person.department),
      pair('Branch',person.branch),pair('Work state',person.state),
      pair('Reports to',person.managerName?`${person.managerName} · ${person.managerId}`:'Top position'),
      pair('Join date',person.joinDate),pair('Date of birth',person.dateOfBirth),
      pair('Gender',person.gender?typeLabel(person.gender):'Not recorded'),
      pair('Work email',person.workEmail??'Not recorded'),pair('Phone',person.phone??'Not recorded'),
      pair('Pay group',person.payGroup),
    ]}
    <h3>Pay and statutory setup</h3>{person.payrollScope?<>
      {pair('Basic pay',money(person.monthlyBasic))}{pair('House rent allowance',money(person.monthlyHra))}
      {pair('Special allowance',money(person.monthlySpecial))}
      {pair('Regular monthly gross',money(person.monthlyBasic+person.monthlyHra+person.monthlySpecial))}
      {pair('Tax regime',typeLabel(person.taxRegime))}{pair('EPF member',person.pfMember?'Yes':'No')}
      {pair('EPS member',person.epsMember?'Yes':'No')}{pair('ESI member',person.esiMember?'Yes':'No')}
      {pair('Professional tax & LWF',`${person.state} rules`)}
      {pair('Bank verified',person.bankReady?'Yes':'No')}{pair('Account ending',person.bankAccountLast4??'Not recorded')}
    </>:<div className="info-strip">Contractor-based people are in the directory and attendance view only. Their payments are outside this employee payroll run.</div>}
    <h3>Attendance and leave</h3>{pair('Working days',person.workingDays===null?'Not recorded':String(person.workingDays))}
    {pair('Unpaid days',person.unpaidDays===null?'Not recorded':String(person.unpaidDays))}
    {pair('Paid days',person.workingDays===null?'Not recorded':String(person.workingDays-(person.unpaidDays??0)))}
    {pair('Leave taken',`${person.leaveTakenDays} days`)}{pair('Leave balance',`${person.leaveBalanceDays} days`)}
    <div className="info-strip">Attendance and leave are synthetic monthly summaries in this prototype.</div>
  </div></aside></div>;
}

type NewEmployee={name:string;employmentType:Employee['employmentType'];positionLevel:number;jobTitle:string;
  department:string;branch:string;state:string;managerId:string;joinDate:string;dateOfBirth:string;gender:string;
  workEmail:string;phone:string;payGroup:string;monthlyBasic:string;monthlyHra:string;
  monthlySpecial:string;leaveBalanceDays:string;pfMember:boolean;esiMember:boolean};

function AddEmployee({role,summary,onClose,onCreated}:{role:Role;summary:HierarchySummary;onClose:()=>void;
  onCreated:(employee:Employee)=>Promise<void>}){
  const [form,setForm]=useState<NewEmployee>({name:'',employmentType:'permanent',positionLevel:1,
    jobTitle:'Associate',department:'Operations',branch:'Bengaluru',state:'Karnataka',managerId:'',
    joinDate:'2026-09-01',dateOfBirth:'1995-01-01',gender:'',workEmail:'',phone:'',payGroup:'General',
    monthlyBasic:'18000',monthlyHra:'9000',monthlySpecial:'7000',leaveBalanceDays:'12',pfMember:true,esiMember:false});
  const [managerSearch,setManagerSearch]=useState('');
  const [managers,setManagers]=useState<ManagerOption[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{if(form.positionLevel===8){setManagers([]);return;}
    api<ManagerOption[]>(`/hierarchy/managers?level=${form.positionLevel}&search=${encodeURIComponent(managerSearch)}`,role)
      .then(setManagers).catch(err=>setError((err as Error).message));
  },[form.positionLevel,managerSearch,role]);
  const change=(patch:Partial<NewEmployee>)=>setForm(current=>({...current,...patch}));
  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError('');
    try{
      const employee=await api<Employee>('/employees',role,{method:'POST',body:JSON.stringify({
        ...form,managerId:form.positionLevel===8?null:form.managerId||null,gender:form.gender||null,
        monthlyBasic:Math.round(Number(form.monthlyBasic)*100),
        monthlyHra:Math.round(Number(form.monthlyHra)*100),
        monthlySpecial:Math.round(Number(form.monthlySpecial)*100),
        leaveBalanceDays:Number(form.leaveBalanceDays),
      })});
      await onCreated(employee);
    }catch(err){setError((err as Error).message);}finally{setSaving(false);}
  }
  const contractor=form.employmentType==='contractor';
  return <div className="overlay" onClick={onClose}><aside className="drawer hierarchy-add-drawer" onClick={event=>event.stopPropagation()}><div className="drawer-header"><div><small>NEW PERSON / HIERARCHY</small><h2>Add employee</h2><span>HR activates the record directly in this demo.</span></div><button className="icon-button" aria-label="Close add employee form" onClick={onClose}><X size={20}/></button></div>
    <form className="drawer-body hierarchy-form" onSubmit={save}>
      {error&&<div className="message error">{error}</div>}
      <h3>Identity and place in hierarchy</h3>
      <label>Full name<input required minLength={2} maxLength={120} value={form.name} onChange={event=>change({name:event.target.value})} placeholder="e.g. Kavya Rao"/></label>
      <div className="hierarchy-form-grid"><label>Employment type<select value={form.employmentType} onChange={event=>{const next=event.target.value as Employee['employmentType'];change({employmentType:next,
        monthlyBasic:next==='contractor'?'0':'18000',monthlyHra:next==='contractor'?'0':'9000',monthlySpecial:next==='contractor'?'0':'7000',
        leaveBalanceDays:next==='permanent'?'12':'0',pfMember:next!=='contractor'});}}>{summary.employmentTypes.map(type=><option key={type} value={type}>{typeLabel(type)}</option>)}</select></label>
      <label>Position level<select value={form.positionLevel} onChange={event=>{const level=Number(event.target.value);
        change({positionLevel:level,jobTitle:summary.positionLevels.find(item=>item.level===level)?.label??'',managerId:''});}}>{summary.positionLevels.map(item=><option key={item.level} value={item.level}>L{item.level} · {item.label}</option>)}</select></label></div>
      <div className="hierarchy-form-grid"><label>Job title<input required value={form.jobTitle} onChange={event=>change({jobTitle:event.target.value})}/></label>
      <label>Department<input required value={form.department} onChange={event=>change({department:event.target.value})} list="departments"/><datalist id="departments">{summary.departments.map(item=><option key={item} value={item}/>)}</datalist></label></div>
      {form.positionLevel<8&&<><label>Find reporting manager<input value={managerSearch} onChange={event=>setManagerSearch(event.target.value)} placeholder="Search name or employee ID"/></label>
        <label>Reporting manager<select required value={form.managerId} onChange={event=>change({managerId:event.target.value})}><option value="">Choose a higher level manager</option>{managers.map(item=><option key={item.id} value={item.id}>L{item.positionLevel} · {item.name} · {item.jobTitle}</option>)}</select></label></>}
      <h3>Work details</h3>
      <div className="hierarchy-form-grid"><label>Branch<select value={form.branch} onChange={event=>{const found=summary.branches.find(item=>item.branch===event.target.value);if(found)change({branch:found.branch,state:found.state});}}>{summary.branches.map(item=><option key={item.branch}>{item.branch}</option>)}</select></label>
      <label>Work state<input value={form.state} readOnly/></label></div>
      <div className="hierarchy-form-grid"><label>Join date<input required type="date" value={form.joinDate} onChange={event=>change({joinDate:event.target.value})}/></label>
      <label>Date of birth<input required type="date" value={form.dateOfBirth} onChange={event=>change({dateOfBirth:event.target.value})}/></label></div>
      <label>Gender<select value={form.gender} onChange={event=>change({gender:event.target.value})}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
      <div className="hierarchy-form-grid"><label>Work email<input type="email" value={form.workEmail} onChange={event=>change({workEmail:event.target.value})} placeholder="optional@example.invalid"/></label>
      <label>Phone<input value={form.phone} onChange={event=>change({phone:event.target.value})} placeholder="Optional, 10–15 digits"/></label></div>
      <h3>{contractor?'Attendance setup':'Pay and statutory setup'}</h3>
      {contractor?<div className="info-strip">Contractors are added to the directory and attendance only. No salary or tax is calculated for them in this payroll run.</div>:<>
        <div className="hierarchy-form-grid"><label>Basic pay · INR/month<input required type="number" min="1" step="0.01" value={form.monthlyBasic} onChange={event=>change({monthlyBasic:event.target.value})}/></label>
        <label>HRA · INR/month<input required type="number" min="0" step="0.01" value={form.monthlyHra} onChange={event=>change({monthlyHra:event.target.value})}/></label></div>
        <div className="hierarchy-form-grid"><label>Special allowance · INR/month<input required type="number" min="0" step="0.01" value={form.monthlySpecial} onChange={event=>change({monthlySpecial:event.target.value})}/></label>
        <label>Pay group<select value={form.payGroup} onChange={event=>change({payGroup:event.target.value})}><option>General</option><option>Operations</option></select></label></div>
        <div className="hierarchy-checks"><label><input type="checkbox" checked={form.pfMember} onChange={event=>change({pfMember:event.target.checked})}/> EPF member</label><label><input type="checkbox" checked={form.esiMember} onChange={event=>change({esiMember:event.target.checked})}/> ESI member</label></div>
      </>}
      <label>Opening leave balance · days<input type="number" min="0" max="365" step="1" value={form.leaveBalanceDays} onChange={event=>change({leaveBalanceDays:event.target.value})}/></label>
      <div className="info-strip">New records start with 30 working days in the synthetic September run. Attendance can be adjusted by importing inputs before calculation.</div>
      <div className="drawer-actions"><button className="button primary" type="submit" disabled={saving}>{saving?'Adding…':'Add and activate'} <ArrowRight size={16}/></button><button className="button outline" type="button" onClick={onClose}>Cancel</button></div>
    </form></aside></div>;
}

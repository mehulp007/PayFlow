import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { authHeaders, baseUrl } from './auth';

type Role='admin'|'hr-operator'|'payroll-operator'|'finance-approver'|'auditor'|'employee';
type Person={id:string;name:string;employmentType:string;positionLevel:number;jobTitle:string;
  department:string;branch:string;state:string;managerId:string|null;managerName:string|null;
  employmentStatus:string;joinDate:string;dateOfBirth:string;workEmail:string|null;phone:string|null;
  payGroup:string;monthlyBasic:number;monthlyHra:number;monthlySpecial:number;taxRegime:string;
  pfMember:boolean;esiMember:boolean;bankReady:boolean;bankAccountLast4:string|null;
  payrollScope:boolean;workingDays:number|null;unpaidDays:number|null;
  leaveBalanceDays:number;leaveTakenDays:number};
type Summary={employmentTypes:string[];positionLevels:Array<{level:number;label:string}>;
  branches:Array<{branch:string;state:string}>;departments:string[];total:number;
  counts:Array<{employmentType:string;level:number;count:number}>};
type Manager={id:string;name:string;jobTitle:string;positionLevel:number};
type Page={items:Person[];total:number;page:number;size:number};
type Form={name:string;employmentType:string;positionLevel:number;jobTitle:string;department:string;
  branch:string;state:string;managerId:string;joinDate:string;dateOfBirth:string;
  workEmail:string;phone:string;monthlyBasic:string;monthlyHra:string;monthlySpecial:string;
  leaveBalanceDays:string;pfMember:boolean;esiMember:boolean;payGroup:string};
const titleCase=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100);
const initial:Form={name:'',employmentType:'permanent',positionLevel:1,jobTitle:'Associate',department:'Operations',
  branch:'Bengaluru',state:'Karnataka',managerId:'',joinDate:'2026-09-01',dateOfBirth:'1995-01-01',
  workEmail:'',phone:'',monthlyBasic:'18000',monthlyHra:'9000',monthlySpecial:'7000',
  leaveBalanceDays:'12',pfMember:true,esiMember:false,payGroup:'General'};
async function api<T>(path:string,_role:Role,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${baseUrl}/api${path}`,{...options,
    headers:{...(options.body===undefined?{}:{'content-type':'application/json'}),...authHeaders(),...options.headers}});
  const result=await response.json().catch(()=>({error:'Request failed'}));
  if(!response.ok)throw new Error(result.error??'Request failed');
  return result as T;
}
function Chip({label,selected,onPress}:{label:string;selected?:boolean;onPress:()=>void}){
  return <Pressable onPress={onPress} style={[s.chip,selected&&s.chipOn]}><Text style={[s.chipText,selected&&s.chipTextOn]}>{label}</Text></Pressable>;
}
function Row({label,value}:{label:string;value:string}){
  return <View style={s.row}><Text style={s.muted}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}
function Field({label,value,onChange,keyboardType}:{label:string;value:string;onChange:(value:string)=>void;
  keyboardType?:'default'|'numeric'|'email-address'|'phone-pad'}){
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType={keyboardType??'default'} style={s.input}/></View>;
}

export default function HierarchyView({role,runStatus,onCreated}:{role:Role;runStatus:string;onCreated:()=>void}){
  const [summary,setSummary]=useState<Summary|null>(null);
  const [people,setPeople]=useState<Page>({items:[],total:0,page:1,size:20});
  const [type,setType]=useState('');
  const [level,setLevel]=useState(0);
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<Person|null>(null);
  const [addOpen,setAddOpen]=useState(false);
  const [form,setForm]=useState<Form>(initial);
  const [managerSearch,setManagerSearch]=useState('');
  const [managers,setManagers]=useState<Manager[]>([]);
  const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{
    const query=`page=${page}&size=20&employmentType=${encodeURIComponent(type)}&level=${level||''}&search=${encodeURIComponent(search)}`;
    const [nextSummary,nextPeople]=await Promise.all([
      api<Summary>('/hierarchy/summary',role),api<Page>(`/employees?${query}`,role),
    ]);
    setSummary(nextSummary);setPeople(nextPeople);
  },[role,page,type,level,search]);
  useEffect(()=>{load().catch(error=>Alert.alert('Hierarchy unavailable',(error as Error).message));},[load]);
  useEffect(()=>{if(!addOpen||form.positionLevel===8){setManagers([]);return;}
    api<Manager[]>(`/hierarchy/managers?level=${form.positionLevel}&search=${encodeURIComponent(managerSearch)}`,role)
      .then(setManagers).catch(error=>Alert.alert('Managers unavailable',(error as Error).message));
  },[addOpen,form.positionLevel,managerSearch,role]);
  const change=(patch:Partial<Form>)=>setForm(current=>({...current,...patch}));
  const filterType=(next:string)=>{setType(next);setPage(1);};
  const filterLevel=(next:number)=>{setLevel(next);setPage(1);};
  const contractor=form.employmentType==='contractor';
  async function add(){
    setSaving(true);
    try{
      const created=await api<Person>('/employees',role,{method:'POST',body:JSON.stringify({
        ...form,managerId:form.positionLevel===8?null:form.managerId||null,
        monthlyBasic:Math.round(Number(form.monthlyBasic)*100),
        monthlyHra:Math.round(Number(form.monthlyHra)*100),
        monthlySpecial:Math.round(Number(form.monthlySpecial)*100),
        leaveBalanceDays:Number(form.leaveBalanceDays),
      })});
      setAddOpen(false);setForm(initial);setManagerSearch('');await load();onCreated();setSelected(created);
      Alert.alert('Employee added',`${created.name} is active in the ${titleCase(created.employmentType)} category.`);
    }catch(error){Alert.alert('Check employee details',(error as Error).message);}finally{setSaving(false);}
  }
  return <>
    <Text style={s.eyebrow}>PEOPLE / ORGANIZATION HIERARCHY</Text>
    <Text style={s.title}>Employee hierarchy</Text>
    <Text style={s.subtitle}>Filter every employment type and open a complete person record.</Text>
    <View style={s.hero}><Text style={s.heroTitle}>{summary?.total.toLocaleString('en-IN')??'—'} people</Text>
      <Text style={s.heroSub}>Contractors are in directory and attendance only.</Text>
      {['admin','hr-operator'].includes(role)&&<Pressable disabled={runStatus!=='draft'} onPress={()=>setAddOpen(true)} style={[s.addButton,runStatus!=='draft'&&s.disabled]}><Text style={s.addText}>+ Add employee</Text></Pressable>}</View>
    <Text style={s.section}>Employment type</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip label="All" selected={!type} onPress={()=>filterType('')}/>{summary?.employmentTypes.map(item=><Chip key={item} label={titleCase(item)} selected={type===item} onPress={()=>filterType(item)}/>)}</ScrollView>
    <Text style={s.section}>Position level</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip label="All" selected={!level} onPress={()=>filterLevel(0)}/>{summary?.positionLevels.map(item=><Chip key={item.level} label={`L${item.level} ${item.label}`} selected={level===item.level} onPress={()=>filterLevel(item.level)}/>)}</ScrollView>
    <TextInput value={search} onChangeText={value=>{setSearch(value);setPage(1);}} placeholder="Search name, ID or title" style={s.search}/>
    <Text style={s.section}>{people.total.toLocaleString('en-IN')} matching people</Text>
    {people.items.map(person=><Pressable key={person.id} onPress={()=>setSelected(person)} style={s.card}><View style={s.cardHead}><Text style={s.personName}>{person.name}</Text><Text style={s.type}>{titleCase(person.employmentType)}</Text></View>
      <Text style={s.muted}>{person.id} · L{person.positionLevel} {person.jobTitle} · {person.department}</Text>
      <Text style={s.muted}>{person.branch}, {person.state} · reports to {person.managerName??'top position'}</Text>
      <View style={s.cardBottom}><Text style={s.muted}>Attendance {person.workingDays===null?'—':`${person.workingDays-(person.unpaidDays??0)}/${person.workingDays}`}</Text><Text style={s.muted}>Leave {person.leaveBalanceDays} days</Text><Text style={s.pay}>{person.payrollScope?money(person.monthlyBasic+person.monthlyHra+person.monthlySpecial):'Outside payroll'}</Text></View>
    </Pressable>)}
    {!people.items.length&&<Text style={s.empty}>No people match these filters.</Text>}
    <View style={s.pagination}><Pressable disabled={page<=1} onPress={()=>setPage(page-1)}><Text style={[s.pageLink,page<=1&&s.disabled]}>← Previous</Text></Pressable><Text style={s.muted}>Page {page} / {Math.max(1,Math.ceil(people.total/people.size))}</Text><Pressable disabled={page*people.size>=people.total} onPress={()=>setPage(page+1)}><Text style={[s.pageLink,page*people.size>=people.total&&s.disabled]}>Next →</Text></Pressable></View>
    <Modal visible={selected!==null} animationType="slide" onRequestClose={()=>setSelected(null)}><ScrollView contentContainerStyle={s.modal}><Pressable onPress={()=>setSelected(null)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>FULL EMPLOYEE RECORD</Text><Text style={s.title}>{selected?.name}</Text><Text style={s.subtitle}>{selected?.id} · {titleCase(selected?.employmentType??'')}</Text>
      {selected&&<><Text style={s.section}>Work and reporting</Text><View style={s.card}>
        <Row label="Position" value={`L${selected.positionLevel} · ${selected.jobTitle}`}/><Row label="Department" value={selected.department}/><Row label="Branch" value={selected.branch}/><Row label="State" value={selected.state}/><Row label="Manager" value={selected.managerName??'Top position'}/><Row label="Join date" value={selected.joinDate}/><Row label="Birth date" value={selected.dateOfBirth}/><Row label="Work email" value={selected.workEmail??'—'}/><Row label="Phone" value={selected.phone??'—'}/><Row label="Status" value={selected.employmentStatus}/></View>
        <Text style={s.section}>Pay and tax</Text><View style={s.card}>{selected.payrollScope?<><Row label="Basic" value={money(selected.monthlyBasic)}/><Row label="HRA" value={money(selected.monthlyHra)}/><Row label="Special" value={money(selected.monthlySpecial)}/><Row label="Tax regime" value={selected.taxRegime}/><Row label="EPF member" value={selected.pfMember?'Yes':'No'}/><Row label="ESI member" value={selected.esiMember?'Yes':'No'}/><Row label="Bank verified" value={selected.bankReady?'Yes':'No'}/><Row label="Account ending" value={selected.bankAccountLast4??'—'}/></>:<Text style={s.muted}>Contractor payments are outside this payroll run.</Text>}</View>
        <Text style={s.section}>Attendance and leave</Text><View style={s.card}><Row label="Working days" value={selected.workingDays===null?'—':String(selected.workingDays)}/><Row label="Unpaid days" value={selected.unpaidDays===null?'—':String(selected.unpaidDays)}/><Row label="Leave taken" value={`${selected.leaveTakenDays} days`}/><Row label="Leave balance" value={`${selected.leaveBalanceDays} days`}/></View></>}
    </ScrollView></Modal>
    <Modal visible={addOpen} animationType="slide" onRequestClose={()=>setAddOpen(false)}><ScrollView contentContainerStyle={s.modal} keyboardShouldPersistTaps="handled"><Pressable onPress={()=>setAddOpen(false)}><Text style={s.close}>Close</Text></Pressable><Text style={s.eyebrow}>NEW PERSON / HIERARCHY</Text><Text style={s.title}>Add employee</Text><Text style={s.subtitle}>HR activates this record directly. Choose a reporting level and manager.</Text>
      <Field label="Full name" value={form.name} onChange={value=>change({name:value})}/>
      <Text style={s.section}>Employment type</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{summary?.employmentTypes.map(item=><Chip key={item} label={titleCase(item)} selected={form.employmentType===item} onPress={()=>change({employmentType:item,monthlyBasic:item==='contractor'?'0':'18000',monthlyHra:item==='contractor'?'0':'9000',monthlySpecial:item==='contractor'?'0':'7000',leaveBalanceDays:item==='permanent'?'12':'0',pfMember:item!=='contractor'})}/>)}</ScrollView>
      <Text style={s.section}>Position level</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{summary?.positionLevels.map(item=><Chip key={item.level} label={`L${item.level} ${item.label}`} selected={form.positionLevel===item.level} onPress={()=>change({positionLevel:item.level,jobTitle:item.label,managerId:''})}/>)}</ScrollView>
      <Field label="Job title" value={form.jobTitle} onChange={value=>change({jobTitle:value})}/><Field label="Department" value={form.department} onChange={value=>change({department:value})}/>
      {form.positionLevel<8&&<><Field label="Find manager" value={managerSearch} onChange={setManagerSearch}/><Text style={s.label}>Reporting manager · higher level required</Text><View style={s.managerList}>{managers.slice(0,12).map(item=><Chip key={item.id} label={`L${item.positionLevel} ${item.name}`} selected={form.managerId===item.id} onPress={()=>change({managerId:item.id})}/>)}</View></>}
      <Text style={s.section}>Branch</Text><View style={s.managerList}>{summary?.branches.map(item=><Chip key={item.branch} label={item.branch} selected={form.branch===item.branch} onPress={()=>change({branch:item.branch,state:item.state})}/>)}</View>
      <Field label="Join date · YYYY-MM-DD" value={form.joinDate} onChange={value=>change({joinDate:value})}/><Field label="Birth date · YYYY-MM-DD" value={form.dateOfBirth} onChange={value=>change({dateOfBirth:value})}/><Field label="Work email · optional" value={form.workEmail} onChange={value=>change({workEmail:value})} keyboardType="email-address"/><Field label="Phone · optional" value={form.phone} onChange={value=>change({phone:value})} keyboardType="phone-pad"/>
      {contractor?<View style={s.notice}><Text style={s.muted}>Contractor record: directory and attendance only.</Text></View>:<><Text style={s.section}>Monthly pay · INR</Text><Field label="Basic" value={form.monthlyBasic} onChange={value=>change({monthlyBasic:value})} keyboardType="numeric"/><Field label="HRA" value={form.monthlyHra} onChange={value=>change({monthlyHra:value})} keyboardType="numeric"/><Field label="Special allowance" value={form.monthlySpecial} onChange={value=>change({monthlySpecial:value})} keyboardType="numeric"/><View style={s.managerList}><Chip label="EPF member" selected={form.pfMember} onPress={()=>change({pfMember:!form.pfMember})}/><Chip label="ESI member" selected={form.esiMember} onPress={()=>change({esiMember:!form.esiMember})}/></View></>}
      <Field label="Opening leave balance · days" value={form.leaveBalanceDays} onChange={value=>change({leaveBalanceDays:value})} keyboardType="numeric"/>
      <Pressable disabled={saving} onPress={add} style={[s.submit,saving&&s.disabled]}><Text style={s.submitText}>{saving?'Adding…':'Add and activate'}</Text></Pressable>
    </ScrollView></Modal>
  </>;
}

const navy='#142449';
const s=StyleSheet.create({eyebrow:{fontSize:9,color:'#5b7fbb',letterSpacing:1.4,fontWeight:'800',marginBottom:7},title:{fontSize:25,color:navy,fontWeight:'800',marginBottom:4},subtitle:{fontSize:12,color:'#8491a5',lineHeight:18,marginBottom:16},hero:{backgroundColor:'#214b9d',borderRadius:12,padding:19,marginBottom:12},heroTitle:{fontSize:21,color:'#fff',fontWeight:'800'},heroSub:{fontSize:11,color:'#d9e8ff',marginTop:5},addButton:{alignSelf:'flex-start',backgroundColor:'#fff',borderRadius:7,paddingHorizontal:14,paddingVertical:10,marginTop:14},addText:{color:'#2455bb',fontSize:11,fontWeight:'800'},section:{fontSize:14,color:navy,fontWeight:'800',marginTop:16,marginBottom:9},chips:{gap:7,paddingBottom:3},chip:{borderWidth:1,borderColor:'#dce5f2',backgroundColor:'#fff',borderRadius:16,paddingHorizontal:10,paddingVertical:8,marginRight:5},chipOn:{backgroundColor:'#e8f0ff',borderColor:'#89adea'},chipText:{fontSize:10,color:'#677891',fontWeight:'800'},chipTextOn:{color:'#2456b4'},search:{borderWidth:1,borderColor:'#dce5f2',backgroundColor:'#fff',borderRadius:8,padding:11,fontSize:12,marginTop:14},card:{borderWidth:1,borderColor:'#e3eaf4',backgroundColor:'#fff',borderRadius:10,padding:14,marginBottom:9},cardHead:{flexDirection:'row',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:6},personName:{fontSize:12,color:navy,fontWeight:'800'},type:{fontSize:9,color:'#2456b4',fontWeight:'800',backgroundColor:'#e8f0ff',padding:5,borderRadius:8},muted:{fontSize:10,color:'#8795aa',lineHeight:16},cardBottom:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:9,borderTopWidth:1,borderTopColor:'#edf1f6',paddingTop:9},pay:{fontSize:10,color:'#1d4d9f',fontWeight:'800'},empty:{color:'#8291a6',fontSize:11,marginVertical:20},pagination:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:12,marginBottom:20},pageLink:{color:'#2455bb',fontSize:10,fontWeight:'800'},disabled:{opacity:.45},modal:{padding:20,paddingBottom:45,backgroundColor:'#f5f7fb',minHeight:'100%'},close:{color:'#2455bb',fontSize:12,fontWeight:'800',marginBottom:22},row:{flexDirection:'row',justifyContent:'space-between',gap:10,borderTopWidth:1,borderTopColor:'#edf1f6',paddingVertical:9},rowValue:{fontSize:10,color:navy,fontWeight:'800',textAlign:'right',flexShrink:1},field:{marginBottom:11},label:{fontSize:10,color:'#5d708d',fontWeight:'800',marginBottom:6},input:{borderWidth:1,borderColor:'#dce5f2',backgroundColor:'#fff',borderRadius:7,padding:10,fontSize:11,color:navy},managerList:{flexDirection:'row',flexWrap:'wrap',gap:3,marginBottom:10},notice:{padding:14,backgroundColor:'#eaf1ff',borderRadius:8,marginTop:12},submit:{backgroundColor:'#2455bb',padding:14,borderRadius:8,alignItems:'center',marginTop:18},submitText:{color:'#fff',fontSize:12,fontWeight:'800'}});

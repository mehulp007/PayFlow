import Fastify from 'fastify';
import cors from '@fastify/cors';
import { parse } from 'csv-parse/sync';
import { calculatePayroll, type EmployeePayrollProfile, type PayrollInput, type PayrollLine } from '@payroll/core';
import { db, demoSeedLastEmployeeId, initializeDatabase } from './db.js';
import { changePassword, createUser, initializeAuth, listUsers, login, logout, publicDemoAccounts, removeDemoUser, resetUserPassword, sessionUser, type Principal, type Role as Actor } from './auth.js';
import { registerPreviewWeb } from './preview-web.js';
import type { FastifyRequest } from 'fastify';

if (process.env.NODE_ENV === 'production') {
  throw new Error('This build contains demo authentication and sample statutory rules. Production mode is disabled.');
}

type Run = { id: string; year: number; month: number; payment_date: string; status: string;
  prepared_by: string | null; approved_by: string | null; approved_at: string | null; version: number };
type DbEmployee = Record<string, unknown>;
type EmploymentType = 'contractor'|'casual'|'fixed_term'|'probation'|'permanent';
type EmployeeRecord = EmployeePayrollProfile & {employmentType:EmploymentType;positionLevel:number;
  jobTitle:string;department:string;managerId:string|null;managerName:string|null;
  workEmail:string|null;phone:string|null;employmentStatus:string;payrollScope:boolean;
  leaveBalanceDays:number;leaveTakenDays:number;workingDays:number|null;unpaidDays:number|null};
const employmentTypes:EmploymentType[]=['contractor','casual','fixed_term','probation','permanent'];
const positionLevels=[
  {level:1,label:'Associate'},{level:2,label:'Senior Associate'},{level:3,label:'Supervisor'},
  {level:4,label:'Manager'},{level:5,label:'Senior Manager'},{level:6,label:'Director'},
  {level:7,label:'Vice President'},{level:8,label:'Managing Director'},
];
const branches=[
  {branch:'Bengaluru',state:'Karnataka'},{branch:'Chennai',state:'Tamil Nadu'},
  {branch:'Gurugram',state:'Haryana'},{branch:'Kolkata',state:'West Bengal'},
  {branch:'Mumbai',state:'Maharashtra'},
];

const app = Fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 });
await app.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] });
await initializeDatabase();
await initializeAuth();

declare module 'fastify' {
  interface FastifyRequest { principal?: Principal }
}
app.addHook('preHandler',async request=>{
  if (!request.url.startsWith('/api/')) return;
  if (request.url.startsWith('/api/health') || request.url.startsWith('/api/auth/login') || request.url==='/api/demo/access') return;
  const header=request.headers.authorization??'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  const principal=await sessionUser(token);
  if (!principal) throw Object.assign(new Error('Please sign in'),{statusCode:401});
  request.principal=principal;
  if (principal.mustChangePassword && !['/api/auth/me','/api/auth/logout','/api/auth/change-password'].includes(request.url))
    throw Object.assign(new Error('Change your temporary password before continuing'),{statusCode:403});
});
function actor(request: FastifyRequest): Actor {
  if (!request.principal) throw Object.assign(new Error('Please sign in'),{statusCode:401});
  return request.principal.role;
}
function actorId(request: FastifyRequest): string {
  if (!request.principal) throw Object.assign(new Error('Please sign in'),{statusCode:401});
  return request.principal.id;
}
function mustBe(request: FastifyRequest, allowed: Actor[]): void {
  if (!allowed.includes(actor(request))) throw Object.assign(new Error('This role cannot perform that action'), { statusCode: 403 });
}

function asMoney(value: unknown): number { return Number(value ?? 0); }
function employeeFromDb(row: DbEmployee): EmployeeRecord {
  return {
    id: String(row.id), name: String(row.name), branch: String(row.branch), state: String(row.state),
    payGroup: String(row.pay_group), joinDate: String(row.join_date), dateOfBirth: String(row.date_of_birth),
    bankAccountLast4: row.bank_account_last4 ? String(row.bank_account_last4) : null,
    bankReady: Boolean(row.bank_ready), monthlyBasic: asMoney(row.monthly_basic),
    monthlyHra: asMoney(row.monthly_hra), monthlySpecial: asMoney(row.monthly_special),
    taxRegime: row.tax_regime === 'old' ? 'old' : 'new',
    oldRegimeAnnualDeductions: asMoney(row.old_regime_annual_deductions),
    annualOtherIncome: asMoney(row.annual_other_income),
    annualPriorEmployerTaxableSalary: asMoney(row.annual_prior_employer_taxable_salary),
    taxAlreadyDeducted: asMoney(row.tax_already_deducted), pfMember: Boolean(row.pf_member),
    pfOnFullBasic: Boolean(row.pf_on_full_basic), esiMember: Boolean(row.esi_member),
    professionalTax: row.professional_tax === null ? null : asMoney(row.professional_tax),
    labourWelfareFund: row.labour_welfare_fund === null ? null : asMoney(row.labour_welfare_fund),
    employmentType:employmentTypes.includes(row.employment_type as EmploymentType) ? row.employment_type as EmploymentType : 'permanent',
    positionLevel:Number(row.position_level ?? 1),jobTitle:String(row.job_title ?? 'Associate'),
    department:String(row.department ?? 'Operations'),managerId:row.manager_id ? String(row.manager_id) : null,
    managerName:row.manager_name ? String(row.manager_name) : null,
    workEmail:row.work_email ? String(row.work_email) : null,phone:row.phone ? String(row.phone) : null,
    employmentStatus:String(row.employment_status ?? 'active'),
    payrollScope:Boolean(row.payroll_scope),leaveBalanceDays:Number(row.leave_balance_days ?? 0),
    leaveTakenDays:Number(row.leave_taken_days ?? 0),workingDays:row.working_days===null||row.working_days===undefined ? null : Number(row.working_days),
    unpaidDays:row.unpaid_days===null||row.unpaid_days===undefined ? null : Number(row.unpaid_days),
  };
}

async function runById(id: string): Promise<Run> {
  const result = await db.query<Run>('SELECT * FROM payroll_runs WHERE id=$1', [id]);
  if (!result.rows[0]) throw Object.assign(new Error('Payroll run not found'), { statusCode: 404 });
  return result.rows[0];
}

async function audit(runId: string | null, who: string, action: string, details: unknown = {}): Promise<void> {
  await db.query('INSERT INTO audit_events(run_id,actor,action,details) VALUES ($1,$2,$3,$4::jsonb)',
    [runId, who, action, JSON.stringify(details)]);
}

async function summary(run: Run) {
  const totals = await db.query<{ employees: string; gross: string; deductions: string; net: string }>(`
    SELECT count(*)::text AS employees,
      coalesce(sum((result->>'gross')::bigint),0)::text AS gross,
      coalesce(sum((result->>'deductions')::bigint),0)::text AS deductions,
      coalesce(sum((result->>'net')::bigint),0)::text AS net
    FROM payroll_lines WHERE run_id=$1`, [run.id]);
  const exceptions = await db.query<{ severity: string; count: string }>(`
    SELECT flag->>'severity' AS severity, count(*)::text AS count
    FROM payroll_lines, jsonb_array_elements(result->'flags') AS flag
    WHERE run_id=$1 GROUP BY 1`, [run.id]);
  const employeeCount = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM employees WHERE payroll_scope=true AND employment_status='active'");
  return {
    ...run,
    totalEmployees: Number(employeeCount.rows[0]?.count ?? 0),
    calculatedEmployees: Number(totals.rows[0]?.employees ?? 0),
    gross: Number(totals.rows[0]?.gross ?? 0), deductions: Number(totals.rows[0]?.deductions ?? 0),
    net: Number(totals.rows[0]?.net ?? 0),
    blocking: Number(exceptions.rows.find(x => x.severity === 'blocking')?.count ?? 0),
    warnings: Number(exceptions.rows.find(x => x.severity === 'warning')?.count ?? 0),
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
function csv(rows: unknown[][]): string { return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

app.get('/api/health', async () => ({ ok: true, mode: 'demo', ruleVersion: 'IN-TY2026-27-v1' }));
app.get('/api/demo/access',async (_request,reply)=>{
  reply.header('cache-control','no-store');
  return {accounts:await publicDemoAccounts()};
});
app.post('/api/auth/login',async request=>{
  const body=(request.body??{}) as {username?:string;password?:string};
  const result=await login(body.username,body.password,request.ip);
  await audit(null,result.user.id,'auth.login');
  return result;
});
app.get('/api/auth/me',async request=>({user:request.principal}));
app.post('/api/auth/logout',async request=>{
  const token=(request.headers.authorization??'').slice(7);
  await logout(token);
  await audit(null,actorId(request),'auth.logout');
  return {ok:true};
});
app.post('/api/auth/change-password',async request=>{
  const body=(request.body??{}) as {currentPassword?:string;newPassword?:string};
  await changePassword(actorId(request),body.currentPassword,body.newPassword);
  await audit(null,actorId(request),'auth.password.changed');
  return {ok:true};
});
app.get('/api/auth/users',async request=>{mustBe(request,['admin']);return listUsers();});
app.post('/api/auth/users',async request=>{
  mustBe(request,['admin']);
  const created=await createUser((request.body??{}) as Record<string,unknown>);
  await audit(null,actorId(request),'auth.user.created',{userId:created.id,role:created.role,employeeId:created.employeeId});
  return created;
});
app.post('/api/auth/users/:id/reset-password',async request=>{
  mustBe(request,['admin']);
  const {id}=request.params as {id:string};
  if(id===actorId(request))throw Object.assign(new Error('Use Change my password for your own account'),{statusCode:400});
  const temporaryPassword=await resetUserPassword(id);
  await audit(null,actorId(request),'auth.password.reset',{userId:id});
  return {temporaryPassword};
});
app.delete('/api/auth/users/:id',async request=>{
  mustBe(request,['admin']);
  const {id}=request.params as {id:string};
  await removeDemoUser(id);
  await audit(null,actorId(request),'auth.user.removed',{userId:id});
  return {ok:true};
});
app.post('/api/demo/reset', async request => {
  mustBe(request,process.env.PUBLIC_DEMO==='1'?['admin','hr-operator']:['admin']);
  await db.transaction(async tx => {
    await tx.query('DELETE FROM payroll_lines WHERE run_id=$1',['RUN-2026-09']);
    await tx.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM app_users WHERE employee_id > $1)',[demoSeedLastEmployeeId]);
    await tx.query('DELETE FROM app_users WHERE employee_id > $1',[demoSeedLastEmployeeId]);
    await tx.query('DELETE FROM payroll_inputs WHERE employee_id > $1',[demoSeedLastEmployeeId]);
    await tx.query('DELETE FROM employees WHERE id > $1',[demoSeedLastEmployeeId]);
    await tx.query("UPDATE payroll_runs SET status='draft',prepared_by=NULL,approved_by=NULL,approved_at=NULL,version=version+1,updated_at=now() WHERE id=$1",['RUN-2026-09']);
    await tx.query("UPDATE employees SET bank_ready=false,bank_account_last4=NULL WHERE id <= 'EMP00012'");
    await tx.query("UPDATE employees SET tax_regime='new' WHERE id='EMP00001'");
    await tx.query(`UPDATE payroll_inputs SET variable_pay=CASE WHEN employee_id IN
      ('EMP00002','EMP00024','EMP00032','EMP00040') THEN 5000000 ELSE 0 END,
      other_deduction=0,unpaid_days=0,working_days=30,note=NULL WHERE run_id=$1`,['RUN-2026-09']);
  });
  await audit('RUN-2026-09',actorId(request),'demo.reset');
  return summary(await runById('RUN-2026-09'));
});
app.get('/api/bootstrap', async request => {
  const run = await runById('RUN-2026-09');
  return { organization: { name: 'Aster Group', legalEntities: 1, branches: 5, mode: 'Synthetic demo' },
    actor: actor(request), run: actor(request)==='employee' ?
      {id:run.id,year:run.year,month:run.month,status:run.status} : await summary(run) };
});

app.get('/api/hierarchy/summary',async request=>{
  mustBe(request,['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const counts=await db.query<{employment_type:EmploymentType;position_level:number;count:string}>(`
    SELECT employment_type,position_level,count(*)::text AS count FROM employees
    WHERE employment_status='active' GROUP BY employment_type,position_level ORDER BY position_level DESC`);
  const departments=await db.query<{department:string}>('SELECT DISTINCT department FROM employees WHERE department IS NOT NULL ORDER BY department');
  const total=counts.rows.reduce((sum,row)=>sum+Number(row.count),0);
  return {employmentTypes,positionLevels,branches,departments:departments.rows.map(row=>row.department),
    total,counts:counts.rows.map(row=>({employmentType:row.employment_type,level:Number(row.position_level),count:Number(row.count)}))};
});

app.get('/api/hierarchy/managers',async request=>{
  mustBe(request,['admin','hr-operator']);
  const q=request.query as {level?:string;search?:string};
  const level=Math.min(8,Math.max(1,Number(q.level??1)));
  const search=`%${(q.search??'').trim()}%`;
  const rows=await db.query<{id:string;name:string;job_title:string;position_level:number}>(`
    SELECT id,name,job_title,position_level FROM employees
    WHERE employment_status='active' AND position_level>$1 AND (id ILIKE $2 OR name ILIKE $2)
    ORDER BY position_level DESC,id LIMIT 60`,[level,search]);
  return rows.rows.map(row=>({id:row.id,name:row.name,jobTitle:row.job_title,positionLevel:Number(row.position_level)}));
});

app.get('/api/employees', async request => {
  mustBe(request, ['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const q = request.query as { search?: string; page?: string; size?: string; state?: string;
    employmentType?:string;level?:string;department?:string;payrollScope?:string };
  const page = Math.max(1, Number(q.page ?? 1));
  const size = Math.min(100, Math.max(1, Number(q.size ?? 20)));
  const search = `%${(q.search ?? '').trim()}%`;
  const state = q.state ?? '';
  const employmentType=q.employmentType??'';
  const level=q.level&&Number.isInteger(Number(q.level))?Number(q.level):0;
  const department=q.department??'';
  const scope=q.payrollScope??'';
  const conditions = `(e.id ILIKE $1 OR e.name ILIKE $1 OR e.branch ILIKE $1 OR e.job_title ILIKE $1)
    AND ($2='' OR e.state=$2) AND ($3='' OR e.employment_type=$3)
    AND ($4::integer=0 OR e.position_level=$4) AND ($5='' OR e.department=$5)
    AND ($6='' OR e.payroll_scope=$6::boolean)`;
  const params=[search,state,employmentType,level,department,scope];
  const count = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM employees e WHERE ${conditions}`,params);
  const rows = await db.query<DbEmployee>(`SELECT e.*,m.name AS manager_name,i.working_days,i.unpaid_days FROM employees e
    LEFT JOIN employees m ON m.id=e.manager_id
    LEFT JOIN payroll_inputs i ON i.employee_id=e.id AND i.run_id='RUN-2026-09'
    WHERE ${conditions} ORDER BY e.position_level DESC,e.id LIMIT $7 OFFSET $8`,
    [...params,size,(page-1)*size]);
  return { total: Number(count.rows[0]?.count ?? 0), page, size, items: rows.rows.map(employeeFromDb) };
});

app.post('/api/employees',async request=>{
  mustBe(request,['admin','hr-operator']);
  const body=request.body as Record<string,unknown> | null;
  if(!body) throw Object.assign(new Error('Employee details are required'),{statusCode:400});
  const run=await runById('RUN-2026-09');
  if(run.status!=='draft') throw Object.assign(new Error('Add employees before calculating this demo payroll'),{statusCode:409});
  const name=String(body.name??'').trim();
  const employmentType=String(body.employmentType??'') as EmploymentType;
  const positionLevel=Number(body.positionLevel);
  const jobTitle=String(body.jobTitle??'').trim();
  const department=String(body.department??'').trim();
  const branch=String(body.branch??'').trim();
  const state=String(body.state??'').trim();
  const joinDate=String(body.joinDate??'');
  const dateOfBirth=String(body.dateOfBirth??'');
  const managerId=body.managerId ? String(body.managerId) : null;
  const workEmail=body.workEmail ? String(body.workEmail).trim() : null;
  const phone=body.phone ? String(body.phone).trim() : null;
  const payGroup=String(body.payGroup??'General').trim();
  const monthlyBasic=Number(body.monthlyBasic??0);
  const monthlyHra=Number(body.monthlyHra??0);
  const monthlySpecial=Number(body.monthlySpecial??0);
  const leaveBalanceDays=Number(body.leaveBalanceDays??0);
  const pfMember=Boolean(body.pfMember);
  const esiMember=Boolean(body.esiMember);
  const payrollScope=employmentType!=='contractor';
  const validDate=(value:string)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const parsed=new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
  };
  if(name.length<2||name.length>120||!employmentTypes.includes(employmentType)||
    !Number.isInteger(positionLevel)||positionLevel<1||positionLevel>8||
    !jobTitle||jobTitle.length>100||!department||department.length>80||
    !branches.some(item=>item.branch===branch&&item.state===state)||
    !validDate(joinDate)||!validDate(dateOfBirth)||dateOfBirth>=joinDate||joinDate>run.payment_date||
    (workEmail!==null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail))||
    (phone!==null&&!/^\+?[0-9]{10,15}$/.test(phone))||
    !payGroup||payGroup.length>80||
    [monthlyBasic,monthlyHra,monthlySpecial].some(value=>!Number.isSafeInteger(value)||value<0)||
    (payrollScope&&monthlyBasic===0)||!Number.isInteger(leaveBalanceDays)||leaveBalanceDays<0||leaveBalanceDays>365) {
    throw Object.assign(new Error('Check the employee name, hierarchy, location, dates and pay details'),{statusCode:400});
  }
  if(positionLevel<8&&!managerId) throw Object.assign(new Error('Choose a manager above this position level'),{statusCode:400});
  if(positionLevel===8&&managerId) throw Object.assign(new Error('Managing Director has no reporting manager in this hierarchy'),{statusCode:400});
  if(managerId){
    const manager=await db.query<{position_level:number}>("SELECT position_level FROM employees WHERE id=$1 AND employment_status='active'",[managerId]);
    if(!manager.rows[0]||Number(manager.rows[0].position_level)<=positionLevel)
      throw Object.assign(new Error('Reporting manager must have a higher position level'),{statusCode:400});
  }
  const created=await db.transaction(async tx=>{
    const latest=await tx.query<{max:string}>("SELECT coalesce(max(substring(id from 4)::integer),0)::text AS max FROM employees");
    const id=`EMP${String(Number(latest.rows[0]?.max??0)+1).padStart(5,'0')}`;
    const fields=['id','name','branch','state','pay_group','join_date','date_of_birth',
      'monthly_basic','monthly_hra','monthly_special','tax_regime','pf_member','esi_member',
      'professional_tax','labour_welfare_fund','employment_type','position_level','job_title',
      'department','manager_id','work_email','phone','employment_status','payroll_scope','leave_balance_days'];
    const values=[id,name,branch,state,payGroup,joinDate,dateOfBirth,monthlyBasic,monthlyHra,
      monthlySpecial,'new',pfMember,esiMember,payrollScope?20000:0,0,employmentType,positionLevel,jobTitle,
      department,managerId,workEmail,phone,'active',payrollScope,leaveBalanceDays];
    await tx.query(`INSERT INTO employees(${fields.join(',')}) VALUES(${fields.map((_,index)=>`$${index+1}`).join(',')})`,values);
    await tx.query(`INSERT INTO payroll_inputs(run_id,employee_id,working_days,unpaid_days)
      VALUES($1,$2,30,0)`,['RUN-2026-09',id]);
    return id;
  });
  await audit(null,actorId(request),'employee.created',{employeeId:created,employmentType,positionLevel,payrollScope});
  const row=await db.query<DbEmployee>(`SELECT e.*,m.name AS manager_name,i.working_days,i.unpaid_days
    FROM employees e LEFT JOIN employees m ON m.id=e.manager_id
    LEFT JOIN payroll_inputs i ON i.employee_id=e.id AND i.run_id='RUN-2026-09' WHERE e.id=$1`,[created]);
  return employeeFromDb(row.rows[0]);
});

app.get('/api/employees/:id', async request => {
  const { id } = request.params as { id: string };
  if (actor(request) === 'employee' && id !== request.principal?.employeeId) {
    throw Object.assign(new Error('Access denied'), { statusCode: 403 });
  }
  const found = await db.query<DbEmployee>(`SELECT e.*,m.name AS manager_name,i.working_days,i.unpaid_days FROM employees e
    LEFT JOIN employees m ON m.id=e.manager_id
    LEFT JOIN payroll_inputs i ON i.employee_id=e.id AND i.run_id='RUN-2026-09'
    WHERE e.id=$1`, [id]);
  if (!found.rows[0]) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  return employeeFromDb(found.rows[0]);
});

app.patch('/api/employees/:id', async request => {
  const { id } = request.params as { id: string };
  const body = request.body as { bankReady?: boolean; bankAccountLast4?: string; taxRegime?: string };
  const who=actor(request);
  if(who==='employee') {
    if(id!==request.principal?.employeeId||Object.keys(body).some(key=>key!=='taxRegime'))
      throw Object.assign(new Error('Employees can change only their own tax choice'),{statusCode:403});
    const scope=await db.query<{payroll_scope:boolean}>('SELECT payroll_scope FROM employees WHERE id=$1',[id]);
    if(!scope.rows[0]?.payroll_scope)throw Object.assign(new Error('Contractor records are outside employee payroll'),{statusCode:403});
  } else mustBe(request,['admin','hr-operator']);
  const run=await runById('RUN-2026-09');
  if(body.taxRegime!==undefined&&run.status!=='draft')
    throw Object.assign(new Error('Tax choice is locked after calculation'),{statusCode:409});
  if((body.bankReady!==undefined||body.bankAccountLast4!==undefined)&&!['draft','calculated'].includes(run.status))
    throw Object.assign(new Error('Bank verification is locked after submission'),{statusCode:409});
  if (body.bankAccountLast4 !== undefined && !/^\d{4}$/.test(body.bankAccountLast4)) {
    throw Object.assign(new Error('Enter exactly four bank account ending digits'), { statusCode: 400 });
  }
  if (body.taxRegime !== undefined && !['new','old'].includes(body.taxRegime)) {
    throw Object.assign(new Error('Invalid tax regime'), { statusCode: 400 });
  }
  const updated=await db.query<{id:string}>(`UPDATE employees SET bank_ready=coalesce($2,bank_ready),
    bank_account_last4=coalesce($3,bank_account_last4), tax_regime=coalesce($4,tax_regime) WHERE id=$1 RETURNING id`,
    [id,body.bankReady ?? null,body.bankAccountLast4 ?? null,body.taxRegime ?? null]);
  if(!updated.rows[0]) throw Object.assign(new Error('Employee not found'),{statusCode:404});
  await audit(null,actorId(request),'employee.updated',{ employeeId:id,fields:Object.keys(body) });
  return { ok:true, message:'Employee updated. Recalculate the payroll run to refresh exceptions.' };
});

app.get('/api/runs/:id', async request => {
  const { id } = request.params as { id: string };
  const run=await runById(id);
  if(actor(request)==='employee') return {id:run.id,year:run.year,month:run.month,status:run.status};
  return summary(run);
});

app.get('/api/runs/:id/lines', async request => {
  mustBe(request,['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const { id } = request.params as { id: string };
  const q = request.query as { search?: string; page?: string; size?: string; exception?: string };
  const search = `%${(q.search ?? '').trim()}%`;
  const page = Math.max(1,Number(q.page ?? 1));
  const size = Math.min(100,Math.max(1,Number(q.size ?? 20)));
  const onlyExceptions = q.exception === 'true';
  const condition = `l.run_id=$1 AND (e.id ILIKE $2 OR e.name ILIKE $2 OR e.branch ILIKE $2)
    AND ($3::boolean=false OR jsonb_array_length(l.result->'flags')>0)`;
  const count = await db.query<{ count:string }>(`SELECT count(*)::text AS count FROM payroll_lines l JOIN employees e ON e.id=l.employee_id WHERE ${condition}`,
    [id,search,onlyExceptions]);
  const rows = await db.query<{ result: PayrollLine }>(`SELECT l.result FROM payroll_lines l JOIN employees e ON e.id=l.employee_id WHERE ${condition} ORDER BY e.id LIMIT $4 OFFSET $5`,
    [id,search,onlyExceptions,size,(page-1)*size]);
  return { total:Number(count.rows[0]?.count ?? 0),page,size,items:rows.rows.map(row => row.result) };
});

app.get('/api/runs/:id/exceptions', async request => {
  mustBe(request,['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const { id } = request.params as { id:string };
  const rows = await db.query<{ employee_id:string; name:string; flag: PayrollLine['flags'][number] }>(`
    SELECT l.employee_id,e.name,flag FROM payroll_lines l
    JOIN employees e ON e.id=l.employee_id,
    jsonb_array_elements(l.result->'flags') AS flag
    WHERE l.run_id=$1 ORDER BY CASE WHEN flag->>'severity'='blocking' THEN 0 ELSE 1 END,e.id LIMIT 100`,[id]);
  return rows.rows.map(row => ({ employeeId:row.employee_id,name:row.name,...row.flag }));
});

app.post('/api/runs/:id/calculate', async request => {
  mustBe(request,['admin','hr-operator','payroll-operator']);
  const { id } = request.params as { id:string };
  const run = await runById(id);
  if (!['draft','calculated'].includes(run.status)) throw Object.assign(new Error('Approved or submitted runs cannot be recalculated'),{statusCode:409});
  const rows = await db.query<DbEmployee & Record<string,unknown>>(`SELECT e.*,i.variable_pay,i.other_deduction,i.unpaid_days,i.working_days,i.note
    FROM employees e JOIN payroll_inputs i ON i.employee_id=e.id AND i.run_id=$1
    WHERE e.payroll_scope=true AND e.employment_status='active' ORDER BY e.id`,[id]);
  const results: PayrollLine[] = rows.rows.map(row => calculatePayroll(employeeFromDb(row),{
    employeeId:String(row.id), variablePay:asMoney(row.variable_pay), otherDeduction:asMoney(row.other_deduction),
    unpaidDays:Number(row.unpaid_days), workingDays:Number(row.working_days), note:row.note ? String(row.note) : undefined,
  },{year:run.year,month:run.month,paymentDate:run.payment_date}));
  await db.transaction(async tx => {
    await tx.query('DELETE FROM payroll_lines WHERE run_id=$1',[id]);
    for (let offset=0;offset<results.length;offset+=200) {
      const chunk = results.slice(offset,offset+200);
      const params: unknown[] = [];
      const values = chunk.map((line,index) => {
        params.push(id,line.employeeId,JSON.stringify(line));
        const n=index*3;
        return `($${n+1},$${n+2},$${n+3}::jsonb)`;
      });
      await tx.query(`INSERT INTO payroll_lines(run_id,employee_id,result) VALUES ${values.join(',')}`,params);
    }
    await tx.query("UPDATE payroll_runs SET status='calculated',updated_at=now() WHERE id=$1",[id]);
  });
  await audit(id,actorId(request),'payroll.calculated',{employees:results.length,version:run.version});
  return summary(await runById(id));
});

type ImportRow = { employee_id:string; variable_pay:string; other_deduction:string; unpaid_days:string; working_days:string; note?:string };
function validateImport(text:string): { valid:PayrollInput[]; errors:Array<{row:number;message:string}> } {
  let rows:ImportRow[];
  try { rows=parse(text,{columns:true,skip_empty_lines:true,trim:true,bom:true}) as ImportRow[]; }
  catch { return {valid:[],errors:[{row:0,message:'Invalid CSV format'}]}; }
  const required=['employee_id','variable_pay','other_deduction','unpaid_days','working_days'];
  if (!rows.length) return {valid:[],errors:[{row:0,message:'CSV is empty'}]};
  if (required.some(key => !(key in rows[0]))) return {valid:[],errors:[{row:1,message:`Required columns: ${required.join(', ')}`}]};
  const seen=new Set<string>();
  const valid:PayrollInput[]=[];
  const errors:Array<{row:number;message:string}>=[];
  rows.forEach((row,index) => {
    const line=index+2;
    if (!/^EMP\d{5}$/.test(row.employee_id)) { errors.push({row:line,message:'Invalid employee ID'}); return; }
    if (seen.has(row.employee_id)) { errors.push({row:line,message:'Duplicate employee ID'}); return; }
    seen.add(row.employee_id);
    const values=[row.variable_pay,row.other_deduction,row.unpaid_days,row.working_days].map(Number);
    if (values.some(v => !Number.isFinite(v)) || !Number.isSafeInteger(Math.round(values[0]*100)) ||
      !Number.isSafeInteger(Math.round(values[1]*100)) || values[0]<0 || values[1]<0 || values[2]<0 || values[3]<=0 ||
      values[2]>values[3] || !Number.isInteger(values[2]) || !Number.isInteger(values[3])) {
      errors.push({row:line,message:'Invalid pay or attendance value'}); return;
    }
    valid.push({employeeId:row.employee_id,variablePay:Math.round(values[0]*100),
      otherDeduction:Math.round(values[1]*100),unpaidDays:values[2],workingDays:values[3],note:row.note});
  });
  return {valid,errors};
}

async function reviewImport(contents:string) {
  const result=validateImport(contents);
  if(!result.valid.length) return result;
  const ids=result.valid.map(row=>row.employeeId);
  const existing=await db.query<{id:string;payroll_scope:boolean}>('SELECT id,payroll_scope FROM employees WHERE id=ANY($1::text[])',[ids]);
  const found=new Set(existing.rows.map(row=>row.id));
  const contractorIds=new Set(existing.rows.filter(row=>!row.payroll_scope).map(row=>row.id));
  for(const id of ids) if(!found.has(id)) result.errors.push({row:0,message:`Unknown employee: ${id}`});
  for(const row of result.valid) if(contractorIds.has(row.employeeId)&&(row.variablePay>0||row.otherDeduction>0))
    result.errors.push({row:0,message:`Contractor ${row.employeeId} accepts attendance only`});
  result.valid=result.valid.filter(row=>found.has(row.employeeId)&&!result.errors.some(error=>error.message.includes(row.employeeId)));
  return result;
}

app.post('/api/runs/:id/import/preview',async request => {
  mustBe(request,['admin','hr-operator','payroll-operator']);
  const {csv:contents} = request.body as {csv:string};
  return reviewImport(contents);
});

app.post('/api/runs/:id/import/commit',async request => {
  mustBe(request,['admin','hr-operator','payroll-operator']);
  const {id}=request.params as {id:string};
  const run=await runById(id);
  if (run.status!=='draft') throw Object.assign(new Error('Inputs are locked after calculation'),{statusCode:409});
  const {csv:contents}=request.body as {csv:string};
  const {valid,errors}=await reviewImport(contents);
  if (errors.length) throw Object.assign(new Error(`Import has ${errors.length} validation errors`),{statusCode:400});
  await db.transaction(async tx => {
    for (const row of valid) {
      await tx.query(`INSERT INTO payroll_inputs(run_id,employee_id,variable_pay,other_deduction,unpaid_days,working_days,note)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(run_id,employee_id) DO UPDATE SET variable_pay=$3,other_deduction=$4,unpaid_days=$5,working_days=$6,note=$7`,
        [id,row.employeeId,row.variablePay,row.otherDeduction,row.unpaidDays,row.workingDays,row.note ?? null]);
    }
  });
  await audit(id,actorId(request),'inputs.imported',{count:valid.length});
  return {ok:true,imported:valid.length};
});

app.post('/api/runs/:id/submit',async request => {
  mustBe(request,['admin','hr-operator','payroll-operator']);
  const {id}=request.params as {id:string};
  const run=await runById(id);
  const totals=await summary(run);
  if (run.status!=='calculated' || totals.calculatedEmployees!==totals.totalEmployees || totals.blocking>0) {
    throw Object.assign(new Error('Calculate all employees and clear blocking exceptions before approval'),{statusCode:409});
  }
  await db.query("UPDATE payroll_runs SET status='approval_pending',prepared_by=$2,updated_at=now() WHERE id=$1",[id,actorId(request)]);
  await audit(id,actorId(request),'payroll.submitted');
  return summary(await runById(id));
});

app.post('/api/runs/:id/approve',async request => {
  mustBe(request,['finance-approver']);
  const {id}=request.params as {id:string};
  const run=await runById(id);
  if (run.status!=='approval_pending') throw Object.assign(new Error('Run is not pending approval'),{statusCode:409});
  if (run.prepared_by===actorId(request)) throw Object.assign(new Error('Preparer cannot approve the same run'),{statusCode:403});
  const {note}=request.body as {note?:string};
  await db.query("UPDATE payroll_runs SET status='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1",
    [id,actorId(request)]);
  await audit(id,actorId(request),'payroll.approved',{note:note ?? ''});
  return summary(await runById(id));
});

app.get('/api/runs/:id/audit',async request => {
  mustBe(request,['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const {id}=request.params as {id:string};
  const rows=await db.query('SELECT * FROM audit_events WHERE run_id=$1 ORDER BY id DESC LIMIT 100',[id]);
  return rows.rows;
});

app.get('/api/runs/:id/payslip/:employeeId',async request => {
  const {id,employeeId}=request.params as {id:string;employeeId:string};
  if (actor(request)==='employee' && employeeId!==request.principal?.employeeId) {
    throw Object.assign(new Error('Access denied'),{statusCode:403});
  }
  const run=await runById(id);
  if (actor(request)==='employee' && !['approved','reconciled','closed'].includes(run.status)) {
    throw Object.assign(new Error('Payslip is available after approval'),{statusCode:403});
  }
  const row=await db.query<{result:PayrollLine}>('SELECT result FROM payroll_lines WHERE run_id=$1 AND employee_id=$2',[id,employeeId]);
  if (!row.rows[0]) throw Object.assign(new Error('Payslip not found'),{statusCode:404});
  return {period:`${run.year}-${String(run.month).padStart(2,'0')}`,status:run.status,line:row.rows[0].result};
});

app.get('/api/runs/:id/export/:kind',async (request,reply) => {
  mustBe(request,['admin','hr-operator','payroll-operator','finance-approver','auditor']);
  const {id,kind}=request.params as {id:string;kind:string};
  const run=await runById(id);
  const allowed=['salary-register','bank-demo','epf-prep','esi-prep','form138-prep','state-deductions'];
  if (!allowed.includes(kind)) throw Object.assign(new Error('Unknown report'),{statusCode:404});
  if (kind==='bank-demo' && !['approved','reconciled','closed'].includes(run.status)) {
    throw Object.assign(new Error('Bank file requires approval'),{statusCode:409});
  }
  const rows=await db.query<{result:PayrollLine}>('SELECT result FROM payroll_lines WHERE run_id=$1 ORDER BY employee_id',[id]);
  let output:unknown[][]=[];
  if (kind==='salary-register') output=[['Employee ID','Name','State','Gross INR','Deductions INR','Net INR'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.employeeName,r.state,r.gross/100,r.deductions/100,r.net/100])];
  if (kind==='bank-demo') output=[['DEMO ONLY - NOT A BANK UPLOAD FILE'],['Employee ID','Beneficiary','Fictional Account','Net INR'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.employeeName,`TEST${r.employeeId}`,r.net/100])];
  if (kind==='epf-prep') output=[['Employee ID','PF Wages INR','Employee EPF INR','Employer EPF INR','Employer EPS INR','Employer EDLI INR'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.basic/100,r.pfEmployee/100,r.pfEmployer/100,r.epsEmployer/100,r.edliEmployer/100])];
  if (kind==='esi-prep') output=[['Employee ID','Gross INR','Employee ESI INR','Employer ESI INR'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.gross/100,r.esiEmployee/100,r.esiEmployer/100])];
  if (kind==='form138-prep') output=[['Employee ID','Salary INR','Tax deducted INR','Tax year','Applicable section'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.gross/100,r.incomeTax/100,'2026-27','392(1)'])];
  if (kind==='state-deductions') output=[['Employee ID','State','Professional tax INR','Labour welfare INR'],
    ...rows.rows.map(({result:r})=>[r.employeeId,r.state,r.professionalTax/100,r.labourWelfareFund/100])];
  await audit(id,actorId(request),'report.exported',{kind});
  reply.header('content-type','text/csv; charset=utf-8');
  reply.header('content-disposition',`attachment; filename="${id}-${kind}.csv"`);
  return csv(output);
});

app.post('/api/runs/:id/reconcile-demo',async request => {
  mustBe(request,['finance-approver']);
  const {id}=request.params as {id:string};
  const run=await runById(id);
  if (run.status!=='approved') throw Object.assign(new Error('Approval required before reconciliation'),{statusCode:409});
  await db.query("UPDATE payroll_runs SET status='reconciled',updated_at=now() WHERE id=$1",[id]);
  await audit(id,actorId(request),'payments.reconciled.demo',{notice:'Synthetic demonstration only'});
  return summary(await runById(id));
});

app.setErrorHandler((error,request,reply) => {
  request.log.error(error);
  const detail=error as Error & {statusCode?:number};
  reply.code(detail.statusCode ?? 500).send({error:detail.message});
});

if(process.env.SERVE_WEB==='1')await registerPreviewWeb(app);
const port=Number(process.env.PORT ?? 4000);
await app.listen({port,host:process.env.HOST ?? '127.0.0.1'});

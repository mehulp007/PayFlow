import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const credentialText=await readFile(new URL('../data/individual-demo-credentials.txt',import.meta.url),'utf8');
const credentials=new Map(credentialText.split(/\r?\n/).filter(line=>line.includes('\t')).map(line=>{
  const [username,password]=line.split('\t');return [username,password];
}));
assert.equal(credentials.size,6);
assert.equal(new Set(credentials.values()).size,6);

const base='http://127.0.0.1:4000/api';
const tokens={};
async function authenticate(username,role=username){
  const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username,password:credentials.get(username)})});
  assert.equal(response.status,200,`Could not sign in as ${username}`);
  const result=await response.json();
  tokens[role]=result.token;
  return result.user;
}
async function call(path,role='hr-operator',method='GET',body,extraHeaders={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(body===undefined?{}:{'content-type':'application/json'}),
    ...(tokens[role]?{authorization:`Bearer ${tokens[role]}`} : {}),...extraHeaders},
    body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  return {status:response.status,payload};
}
const run='/runs/RUN-2026-09';
let createdAccountId=null;
let newHireUsername=null;
try{
  assert.equal((await call('/runs/RUN-2026-09','anonymous')).status,401);
  for(const [username,role] of [['admin','admin'],['hr','hr-operator'],['payroll','payroll-operator'],
    ['finance','finance-approver'],['auditor','auditor'],['employee','employee']])await authenticate(username,role);
  const oldShared=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:'admin',password:'AsterDemo!2026'})});
  assert.equal(oldShared.status,401);
  assert.equal((await call('/auth/me','employee')).payload.user.employeeId,'EMP00001');
  assert.equal((await call('/demo/reset','employee','POST',{}, {'x-demo-user':'admin'})).status,403);
  assert.equal((await call('/auth/users','employee')).status,403);
  assert.equal((await call('/demo/reset','admin','POST',{})).status,200);
  const newAccess=await call('/auth/users','admin','POST',{
    username:`smoke.${Date.now()}`,role:'employee',employeeId:'EMP00002',
  });
  assert.equal(newAccess.status,200);
  assert.equal(newAccess.payload.mustChangePassword,true);
  assert(newAccess.payload.temporaryPassword.length>=12);
  assert.equal((await call('/auth/users','admin')).payload.find(user=>user.id===newAccess.payload.id).temporaryPassword,undefined);
  assert.equal((await call('/auth/users','admin','POST',{
    username:`duplicate.${Date.now()}`,role:'employee',employeeId:'EMP00002',
  })).status,409);
  createdAccountId=newAccess.payload.id;
  const newLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:newAccess.payload.username,password:newAccess.payload.temporaryPassword})});
  assert.equal(newLogin.status,200);
  tokens['second-employee']=(await newLogin.json()).token;
  assert.equal((await call('/employees/EMP00002','second-employee')).status,403);
  assert.equal((await call('/auth/change-password','second-employee','POST',{
    currentPassword:newAccess.payload.temporaryPassword,newPassword:'RotatedTest!2026',
  })).status,200);
  assert.equal((await call('/auth/me','second-employee')).status,401);
  const rotatedLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:newAccess.payload.username,password:'RotatedTest!2026'})});
  assert.equal(rotatedLogin.status,200);
  const rotated=await rotatedLogin.json();
  assert.equal(rotated.user.mustChangePassword,false);
  tokens['second-employee']=rotated.token;
  assert.equal((await call('/auth/users/USR-admin/reset-password','admin','POST',{})).status,400);
  const recovered=await call(`/auth/users/${createdAccountId}/reset-password`,'admin','POST',{});
  assert.equal(recovered.status,200);
  assert.equal((await call('/auth/me','second-employee')).status,401);
  const recoveryLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:newAccess.payload.username,password:recovered.payload.temporaryPassword})});
  assert.equal(recoveryLogin.status,200);
  tokens['second-employee']=(await recoveryLogin.json()).token;
  assert.equal((await call('/employees/EMP00002','second-employee')).status,403);
  assert.equal((await call('/auth/change-password','second-employee','POST',{
    currentPassword:recovered.payload.temporaryPassword,newPassword:'RecoveredTest!2026',
  })).status,200);
  const recoveredLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:newAccess.payload.username,password:'RecoveredTest!2026'})});
  assert.equal(recoveredLogin.status,200);
  tokens['second-employee']=(await recoveredLogin.json()).token;
  assert.equal((await call('/employees/EMP00002','second-employee')).status,200);
  assert.equal((await call('/employees/EMP00001','second-employee')).status,403);
  assert.equal((await call('/employees/EMP00001','auditor','PATCH',{taxRegime:'old'})).status,403);
  const hierarchy=await call('/hierarchy/summary');
  assert.equal(hierarchy.payload.total,8420);
  assert(hierarchy.payload.employmentTypes.includes('contractor'));
  assert.equal(hierarchy.payload.positionLevels.at(-1).label,'Managing Director');
  const created=await call('/employees','hr-operator','POST',{
    name:'Kavya Rao',employmentType:'contractor',positionLevel:1,jobTitle:'Associate',
    department:'Operations',branch:'Bengaluru',state:'Karnataka',managerId:'EMP00048',
    joinDate:'2026-09-01',dateOfBirth:'1995-01-01',workEmail:'kavya@example.invalid',
    phone:'9876543210',payGroup:'General',monthlyBasic:0,monthlyHra:0,monthlySpecial:0,
    leaveBalanceDays:0,pfMember:false,esiMember:false,
  });
  assert.equal(created.status,200);
  assert.equal(created.payload.payrollScope,false);
  const contractorId=created.payload.id;
  const filtered=await call(`/employees?employmentType=contractor&search=${contractorId}`);
  assert.equal(filtered.payload.total,1);
  assert.equal(filtered.payload.items[0].managerName,'Employee 00048');
  const contractorPay=await call(`${run}/import/preview`,'hr-operator','POST',{
    csv:`employee_id,variable_pay,other_deduction,unpaid_days,working_days\n${contractorId},100,0,0,30`,
  });
  assert.equal(contractorPay.payload.errors[0].message,`Contractor ${contractorId} accepts attendance only`);
  assert.equal((await call(`${run}/import/commit`,'hr-operator','POST',{
    csv:`employee_id,variable_pay,other_deduction,unpaid_days,working_days\n${contractorId},0,0,2,30`,
  })).status,200);
  assert.equal((await call(`/employees/${contractorId}`)).payload.unpaidDays,2);
  const direct=await call('/employees','hr-operator','POST',{
    name:'Riya Sharma',employmentType:'permanent',positionLevel:2,jobTitle:'Senior Associate',
    department:'Finance',branch:'Mumbai',state:'Maharashtra',managerId:'EMP00040',
    joinDate:'2026-09-01',dateOfBirth:'1994-05-15',workEmail:'riya@example.invalid',
    phone:'9876543211',payGroup:'General',monthlyBasic:3000000,monthlyHra:1200000,
    monthlySpecial:800000,leaveBalanceDays:12,pfMember:true,esiMember:false,
  });
  assert.equal(direct.status,200);
  assert.equal(direct.payload.payrollScope,true);
  assert.equal(direct.payload.managerName,'Employee 00040');
  const directId=direct.payload.id;
  newHireUsername=`newhire.${Date.now()}`;
  assert.equal((await call('/auth/users','admin','POST',{
    username:newHireUsername,role:'employee',employeeId:directId,
  })).status,200);
  const payrollPopulation=(await call(run)).payload.totalEmployees;
  assert(payrollPopulation>5000&&payrollPopulation<8421);
  assert.equal((await call('/employees/EMP00001','employee','PATCH',{taxRegime:'old'})).status,200);
  assert.equal((await call('/employees/EMP00001','employee')).payload.taxRegime,'old');
  assert.equal((await call('/employees/EMP00002','employee','PATCH',{taxRegime:'old'})).status,403);
  const invalid=await call(`${run}/import/preview`,'hr-operator','POST',{
    csv:'employee_id,variable_pay,other_deduction,unpaid_days,working_days\nEMP00001,100,0,0,30\nEMP00001,100,0,0,30',
  });
  assert.equal(invalid.payload.errors[0].message,'Duplicate employee ID');
  const unknown=await call(`${run}/import/preview`,'hr-operator','POST',{
    csv:'employee_id,variable_pay,other_deduction,unpaid_days,working_days\nEMP99999,100,0,0,30',
  });
  assert.equal(unknown.payload.errors[0].message,'Unknown employee: EMP99999');
  const imported=await call(`${run}/import/commit`,'hr-operator','POST',{
    csv:'employee_id,variable_pay,other_deduction,unpaid_days,working_days,note\nEMP00001,2500,0,1,30,Smoke test',
  });
  assert.equal(imported.payload.imported,1);
  let computed=await call(`${run}/calculate`,'hr-operator','POST',{});
  assert.equal(computed.payload.calculatedEmployees,payrollPopulation);
  assert.equal(computed.payload.blocking,13);
  assert.equal((await call('/employees','hr-operator','POST',{name:'Late hire'})).status,409);
  assert.equal((await call('/employees/EMP00001','employee','PATCH',{taxRegime:'new'})).status,409);
  const employeeRun=await call(run,'employee');
  assert.equal(employeeRun.status,200);
  assert.equal(employeeRun.payload.net,undefined);
  assert.equal((await call(`${run}/lines`,'employee')).status,403);
  assert.equal((await call(`${run}/exceptions`,'employee')).status,403);
  assert.equal((await call(`${run}/payslip/EMP00001`,'employee')).status,403);
  assert.equal((await call('/employees/EMP00002','employee')).status,403);
  assert.equal((await call(`${run}/submit`,'hr-operator','POST',{})).status,409);
  for(let n=1;n<=12;n++){
    const employeeId=`EMP${String(n).padStart(5,'0')}`;
    assert.equal((await call(`/employees/${employeeId}`,'hr-operator','PATCH',{
      bankReady:true,bankAccountLast4:'1234',
    })).status,200);
  }
  assert.equal((await call(`/employees/${directId}`,'hr-operator','PATCH',{
    bankReady:true,bankAccountLast4:'1234',
  })).status,200);
  computed=await call(`${run}/calculate`,'hr-operator','POST',{});
  assert.equal(computed.payload.blocking,0);
  assert.equal(computed.payload.gross-computed.payload.deductions,computed.payload.net);
  assert.equal((await call(`${run}/submit`,'hr-operator','POST',{})).payload.status,'approval_pending');
  assert.equal((await call(`${run}/approve`,'hr-operator','POST',{})).status,403);
  assert.equal((await call(`${run}/approve`,'finance-approver','POST',{note:'Smoke test'})).payload.status,'approved');
  assert.equal((await call(`${run}/payslip/EMP00001`,'employee')).status,200);
  const bank=await fetch(`${base}${run}/export/bank-demo`,{headers:{authorization:`Bearer ${tokens['finance-approver']}`}});
  assert.equal(bank.status,200);
  const bankText=await bank.text();
  assert(bankText.includes('DEMO ONLY - NOT A BANK UPLOAD FILE'));
  assert.equal((await call(`${run}/reconcile-demo`,'finance-approver','POST',{})).payload.status,'reconciled');
  console.log(`PASS: hierarchy and contractor attendance, ${payrollPopulation} calculations, exception gate, approval, payslip and reconciliation.`);
}finally{
  if(createdAccountId)assert.equal((await call(`/auth/users/${createdAccountId}`,'admin','DELETE')).status,200);
  assert.equal((await call('/demo/reset','admin','POST',{})).status,200);
  if(newHireUsername)assert(!(await call('/auth/users','admin')).payload.some(user=>user.username===newHireUsername));
}

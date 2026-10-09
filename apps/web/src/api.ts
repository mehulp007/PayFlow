export type Role = 'admin' | 'hr-operator' | 'payroll-operator' | 'finance-approver' | 'auditor' | 'employee';
export type User = {id:string;username:string;role:Role;employeeId:string|null;mustChangePassword:boolean};
export type LoginResult = {token:string;user:User};
const tokenKey='payroll-studio-demo-session';
export function getToken():string|null{return sessionStorage.getItem(tokenKey);}
export function setToken(token:string|null):void{
  if(token)sessionStorage.setItem(tokenKey,token);else sessionStorage.removeItem(tokenKey);
}
export type Run = {
  id:string;year:number;month:number;payment_date:string;status:string;prepared_by:string|null;
  approved_by:string|null;approved_at:string|null;version:number;totalEmployees:number;
  calculatedEmployees:number;gross:number;deductions:number;net:number;blocking:number;warnings:number;
};
export type Employee = {
  id:string;name:string;branch:string;state:string;payGroup:string;joinDate:string;dateOfBirth:string;
  bankAccountLast4:string|null;bankReady:boolean;monthlyBasic:number;monthlyHra:number;monthlySpecial:number;
  taxRegime:'new'|'old';oldRegimeAnnualDeductions:number;pfMember:boolean;esiMember:boolean;
  epsMember:boolean;pfOnActualWages:boolean;gender:'female'|'male'|'other'|null;
  employmentType:'contractor'|'casual'|'fixed_term'|'probation'|'permanent';positionLevel:number;
  jobTitle:string;department:string;managerId:string|null;managerName:string|null;
  workEmail:string|null;phone:string|null;employmentStatus:string;payrollScope:boolean;
  leaveBalanceDays:number;leaveTakenDays:number;workingDays:number|null;unpaidDays:number|null;
};
export type HierarchySummary={employmentTypes:Employee['employmentType'][];
  positionLevels:Array<{level:number;label:string}>;branches:Array<{branch:string;state:string}>;
  departments:string[];total:number;counts:Array<{employmentType:Employee['employmentType'];level:number;count:number}>};
export type ManagerOption={id:string;name:string;jobTitle:string;positionLevel:number};
export type Flag = {code:string;severity:'blocking'|'warning';message:string};
export type Line = {
  employeeId:string;employeeName:string;branch:string;state:string;basic:number;hra:number;special:number;
  variablePay:number;lossOfPay:number;ncpDays:number;gross:number;statutoryWages:number;pfWages:number;
  epsWages:number;edliWages:number;pfEmployee:number;pfEmployer:number;epsEmployer:number;edliEmployer:number;
  epfAdminCharges:number;esiWages:number;esiEmployee:number;esiEmployer:number;professionalTax:number;
  labourWelfareFund:number;labourWelfareFundEmployer:number;incomeTax:number;otherDeduction:number;
  deductions:number;net:number;employerCost:number;annualProjectedTax:number;ruleVersion:string;
  ruleNotes:string[];flags:Flag[];
};
export type Exception = Flag & {employeeId:string;name:string};
export type Audit = {id:number;actor:string;action:string;details:Record<string,unknown>;created_at:string};
export type Page<T> = {total:number;page:number;size:number;items:T[]};

export async function api<T>(path:string,_role:Role,options:RequestInit={}):Promise<T> {
  const token=getToken();
  const response=await fetch(`/api${path}`,{
    ...options,
    headers:{...(options.body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`} : {}),...options.headers},
  });
  if(!response.ok){
    if(response.status===401 && path!=='/auth/login' && token){setToken(null);window.dispatchEvent(new Event('auth:expired'));}
    const body=await response.json().catch(()=>({error:response.statusText}));
    throw new Error(body.error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function download(path:string,_role:Role):Promise<void>{
  const token=getToken();
  const response=await fetch(`/api${path}`,{headers:token?{authorization:`Bearer ${token}`}:{}});
  if(response.status===401){setToken(null);window.dispatchEvent(new Event('auth:expired'));}
  if(!response.ok){const body=await response.json();throw new Error(body.error ?? 'Download failed');}
  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'report.csv';
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function money(paise:number,compact=false):string{
  const rupees=paise/100;
  if(compact && Math.abs(rupees)>=10000000)return `₹${(rupees/10000000).toFixed(2)} Cr`;
  if(compact && Math.abs(rupees)>=100000)return `₹${(rupees/100000).toFixed(2)} L`;
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(rupees);
}

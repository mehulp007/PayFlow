import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { dataDirectory, db } from './db.js';

export type Role = 'admin' | 'hr-operator' | 'payroll-operator' | 'finance-approver' | 'auditor' | 'employee';
export type Principal = { id: string; username: string; role: Role; employeeId: string | null; mustChangePassword: boolean };
type Account = Principal & { password_hash: string; active: boolean };
const roles: Role[] = ['admin','hr-operator','payroll-operator','finance-approver','auditor','employee'];
const failures = new Map<string,{count:number;until:number}>();
const demoCredentialPath=resolve(dirname(dataDirectory),'individual-demo-credentials.txt');
function temporaryPassword():string{return `${randomBytes(18).toString('base64url')}aA1!`;}

function passwordHash(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
function passwordMatches(password: string, stored: string): boolean {
  const [salt,expected] = stored.split(':');
  if (!salt || !expected || !/^[0-9a-f]{128}$/.test(expected)) return false;
  const actual = scryptSync(password,salt,64);
  return timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }

export async function initializeAuth(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
      employee_id TEXT REFERENCES employees(id), password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true, must_change_password BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id),
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS auth_migrations (name TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_employee_account ON app_users(employee_id)
      WHERE role='employee' AND active=true AND employee_id IS NOT NULL;
  `);
  const migrated=await db.query('SELECT name FROM auth_migrations WHERE name=$1',['individual-demo-credentials-v1']);
  if(migrated.rows[0])return;
  const existing = await db.query<{count:string}>('SELECT count(*)::text AS count FROM app_users');
  const seed: Array<[string,Role,string|null]> = [
    ['admin','admin',null],['hr','hr-operator',null],['payroll','payroll-operator',null],
    ['finance','finance-approver',null],['auditor','auditor',null],['employee','employee','EMP00001'],
  ];
  const credentials=seed.map(([username,role,employeeId])=>({username,role,employeeId,password:temporaryPassword()}));
  const note=['PAYFLOW - SYNTHETIC DEMO CREDENTIALS',
    'Each built-in account has its own password. Change it after signing in.',
    'Keep this file private. Do not use real payroll data.',
    '',...credentials.map(item=>`${item.username}\t${item.password}\t${item.role}`),''].join('\n');
  await writeFile(demoCredentialPath,note,{mode:0o600});
  await db.transaction(async tx=>{
    for(const item of credentials){
      if(Number(existing.rows[0]?.count??0)===0){
        await tx.query(`INSERT INTO app_users(id,username,role,employee_id,password_hash,must_change_password)
          VALUES($1,$2,$3,$4,$5,false)`,[`USR-${item.username}`,item.username,item.role,item.employeeId,passwordHash(item.password)]);
      }else{
        await tx.query(`UPDATE app_users SET password_hash=$2,must_change_password=false WHERE id=$1`,
          [`USR-${item.username}`,passwordHash(item.password)]);
      }
    }
    await tx.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::text[])',[credentials.map(item=>`USR-${item.username}`)]);
    await tx.query('INSERT INTO auth_migrations(name) VALUES($1)',['individual-demo-credentials-v1']);
  });
}

export async function login(usernameInput: unknown, passwordInput: unknown, source: string): Promise<{token:string;user:Principal}> {
  const username = String(usernameInput ?? '').trim().toLowerCase();
  const password = String(passwordInput ?? '');
  if (!/^[a-z0-9._-]{2,64}$/.test(username) || !password || password.length>256)
    throw Object.assign(new Error('Invalid username or password'),{statusCode:401});
  const key = `${source}:${username}`;
  const failed = failures.get(key);
  if (failed && failed.count>=5 && failed.until>Date.now())
    throw Object.assign(new Error('Too many attempts. Try again in 15 minutes.'),{statusCode:429});
  const row = await db.query<Account>('SELECT id,username,role,employee_id AS "employeeId",must_change_password AS "mustChangePassword",password_hash,active FROM app_users WHERE username=$1',[username]);
  const account = row.rows[0];
  const valid = account?.active && passwordMatches(password,account.password_hash);
  if (!valid) {
    const count = (failed && failed.until>Date.now() ? failed.count : 0)+1;
    failures.set(key,{count,until:Date.now()+15*60_000});
    throw Object.assign(new Error('Invalid username or password'),{statusCode:401});
  }
  failures.delete(key);
  const token=randomBytes(32).toString('base64url');
  await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'12 hours\')',
    [tokenHash(token),account.id]);
  return {token,user:{id:account.id,username:account.username,role:account.role,employeeId:account.employeeId,mustChangePassword:account.mustChangePassword}};
}

export async function sessionUser(token: string): Promise<Principal|null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result=await db.query<Principal>(`SELECT u.id,u.username,u.role,u.employee_id AS "employeeId",u.must_change_password AS "mustChangePassword"
    FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[tokenHash(token)]);
  return result.rows[0]??null;
}
export async function logout(token: string): Promise<void> {
  if (/^[A-Za-z0-9_-]{43}$/.test(token))
    await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash(token)]);
}
export async function listUsers(): Promise<Principal[]> {
  const result=await db.query<Principal>('SELECT id,username,role,employee_id AS "employeeId",must_change_password AS "mustChangePassword" FROM app_users WHERE active=true ORDER BY username');
  return result.rows;
}
export async function createUser(body: Record<string,unknown>): Promise<Principal & {temporaryPassword:string}> {
  const username=String(body.username??'').trim().toLowerCase();
  const role=body.role as Role;
  const employeeId=body.employeeId ? String(body.employeeId).trim().toUpperCase() : null;
  if (!/^[a-z0-9._-]{2,64}$/.test(username)) throw Object.assign(new Error('Username must be 2–64 letters, digits, dots, hyphens or underscores'),{statusCode:400});
  if (!roles.includes(role)) throw Object.assign(new Error('Invalid role'),{statusCode:400});
  if (role==='employee' && !employeeId) throw Object.assign(new Error('Link an employee ID to employee access'),{statusCode:400});
  if (role!=='employee' && employeeId) throw Object.assign(new Error('Employee ID is only for employee access'),{statusCode:400});
  if (employeeId) {
    const employee=await db.query('SELECT id FROM employees WHERE id=$1 AND employment_status=\'active\'',[employeeId]);
    if (!employee.rows[0]) throw Object.assign(new Error('Active employee ID not found'),{statusCode:400});
  }
  const id=`USR-${randomBytes(12).toString('hex')}`;
  const password=temporaryPassword();
  try {
    const result=await db.query<Principal>(`INSERT INTO app_users(id,username,role,employee_id,password_hash,must_change_password)
      VALUES($1,$2,$3,$4,$5,true) RETURNING id,username,role,employee_id AS "employeeId",must_change_password AS "mustChangePassword"`,
      [id,username,role,employeeId,passwordHash(password)]);
    return {...result.rows[0],temporaryPassword:password};
  } catch (error) {
    if (String(error).includes('one_active_employee_account')) throw Object.assign(new Error('This employee already has an account'),{statusCode:409});
    if (String(error).includes('unique')) throw Object.assign(new Error('Username already exists'),{statusCode:409});
    throw error;
  }
}
export async function removeDemoUser(id:string):Promise<void>{
  if(!/^USR-[0-9a-f]{24}$/.test(id)) throw Object.assign(new Error('Built-in demo accounts cannot be removed'),{statusCode:403});
  await db.transaction(async tx=>{
    await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[id]);
    const removed=await tx.query('DELETE FROM app_users WHERE id=$1 RETURNING id',[id]);
    if(!removed.rows[0])throw Object.assign(new Error('Account not found'),{statusCode:404});
  });
}
export async function resetUserPassword(id:string):Promise<string>{
  const password=temporaryPassword();
  await db.transaction(async tx=>{
    const updated=await tx.query('UPDATE app_users SET password_hash=$2,must_change_password=true WHERE id=$1 AND active=true RETURNING id',
      [id,passwordHash(password)]);
    if(!updated.rows[0])throw Object.assign(new Error('Account not found'),{statusCode:404});
    await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[id]);
  });
  return password;
}
export async function changePassword(userId:string,currentInput:unknown,nextInput:unknown):Promise<void>{
  const current=String(currentInput??'');
  const next=String(nextInput??'');
  if(next.length<12||next.length>256||next===current)
    throw Object.assign(new Error('Choose a different password of 12–256 characters'),{statusCode:400});
  const found=await db.query<{password_hash:string}>('SELECT password_hash FROM app_users WHERE id=$1 AND active=true',[userId]);
  if(!found.rows[0]||!passwordMatches(current,found.rows[0].password_hash))
    throw Object.assign(new Error('Current password is incorrect'),{statusCode:403});
  await db.transaction(async tx=>{
    await tx.query('UPDATE app_users SET password_hash=$2,must_change_password=false WHERE id=$1',[userId,passwordHash(next)]);
    await tx.query('DELETE FROM auth_sessions WHERE user_id=$1',[userId]);
  });
}

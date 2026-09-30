import pg from 'pg';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDirectory = resolve(process.env.PAYROLL_DATA_DIRECTORY ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../../..', 'data', 'payroll-pg'));
// Render Free has a 512 MiB memory limit; keep its shared showcase small.
export const demoSeedEmployeeCount = process.env.PUBLIC_DEMO === '1' ? 240 : 8420;
export const demoSeedLastEmployeeId = `EMP${String(demoSeedEmployeeCount).padStart(5, '0')}`;
type Queryable = { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
type Database = Queryable & {
  exec(sql: string): Promise<void>;
  transaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function postgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000 });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) { await pool.query(sql); },
    async transaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          async query<R>(sql: string, params?: unknown[]) {
            const response = await client.query(sql, params);
            return { rows: response.rows as R[] };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}

async function localDatabase(): Promise<Database> {
  await mkdir(dataDirectory, { recursive: true });
  await acquireDataLock();
  const { PGlite } = await import('@electric-sql/pglite');
  const local = new PGlite(dataDirectory);
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await local.query<T>(sql, params);
      return { rows: result.rows };
    },
    async exec(sql: string) { await local.exec(sql); },
    transaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T> {
      return local.transaction(tx => callback({
        async query<R>(sql: string, params?: unknown[]) {
          const result = await tx.query<R>(sql, params);
          return { rows: result.rows };
        },
      }));
    },
    async close() { await local.close(); },
  };
}
const lockPath=resolve(dirname(dataDirectory),'payroll-api.lock');
const lockOwner=`${process.pid}:${randomUUID()}`;
async function acquireDataLock():Promise<void>{
  for(let attempt=0;attempt<2;attempt++){
    try{
      const file=await open(lockPath,'wx');
      try{await file.writeFile(lockOwner);}finally{await file.close();}
      process.once('exit',()=>{
        try{if(readFileSync(lockPath,'utf8')===lockOwner)unlinkSync(lockPath);}catch{}
      });
      return;
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      const owner=await readFile(lockPath,'utf8').catch(()=>'');
      const pid=Number(owner.split(':')[0]);
      if(Number.isInteger(pid)&&pid>0){
        try{process.kill(pid,0);throw new Error('Another payroll API is using the local data. Stop it before starting a second server.');}
        catch(check){if((check as Error).message.startsWith('Another payroll API'))throw check;
          if((check as NodeJS.ErrnoException).code!=='ESRCH')throw check;}
      }
      await unlink(lockPath).catch(()=>{});
    }
  }
  throw new Error('Unable to acquire the local payroll database lock');
}
if (process.env.PUBLIC_DEMO === '1' && !process.env.DATABASE_URL) {
  throw new Error('Public showcase requires DATABASE_URL; wait for Render PostgreSQL to become ready.');
}
export const db: Database = process.env.DATABASE_URL
  ? postgresDatabase(process.env.DATABASE_URL)
  : await localDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      branch TEXT NOT NULL,
      state TEXT NOT NULL,
      pay_group TEXT NOT NULL,
      join_date TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      bank_account_last4 TEXT,
      bank_ready BOOLEAN NOT NULL DEFAULT false,
      monthly_basic BIGINT NOT NULL,
      monthly_hra BIGINT NOT NULL,
      monthly_special BIGINT NOT NULL,
      tax_regime TEXT NOT NULL DEFAULT 'new',
      old_regime_annual_deductions BIGINT NOT NULL DEFAULT 0,
      annual_other_income BIGINT NOT NULL DEFAULT 0,
      annual_prior_employer_taxable_salary BIGINT NOT NULL DEFAULT 0,
      tax_already_deducted BIGINT NOT NULL DEFAULT 0,
      pf_member BOOLEAN NOT NULL DEFAULT true,
      pf_on_full_basic BOOLEAN NOT NULL DEFAULT false,
      esi_member BOOLEAN NOT NULL DEFAULT false,
      professional_tax BIGINT,
      labour_welfare_fund BIGINT
    );
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      prepared_by TEXT,
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS payroll_inputs (
      run_id TEXT NOT NULL REFERENCES payroll_runs(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      variable_pay BIGINT NOT NULL DEFAULT 0,
      other_deduction BIGINT NOT NULL DEFAULT 0,
      unpaid_days INTEGER NOT NULL DEFAULT 0,
      working_days INTEGER NOT NULL DEFAULT 30,
      note TEXT,
      PRIMARY KEY (run_id, employee_id)
    );
    CREATE TABLE IF NOT EXISTS payroll_lines (
      run_id TEXT NOT NULL REFERENCES payroll_runs(id),
      employee_id TEXT NOT NULL REFERENCES employees(id),
      result JSONB NOT NULL,
      PRIMARY KEY (run_id, employee_id)
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY,
      run_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_level INTEGER;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS department TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_email TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active';
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS payroll_scope BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_balance_days INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_taken_days INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS employees_hierarchy_idx ON employees(employment_type,position_level,department);
  `);
  const count = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM employees');
  if (Number(count.rows[0]?.count ?? 0) > 0) {
    await backfillHierarchy();
    return;
  }
  // All seeded people and accounts are fictitious demonstration data.
  await db.exec(`
    INSERT INTO employees (
      id,name,branch,state,pay_group,join_date,date_of_birth,bank_account_last4,bank_ready,
      monthly_basic,monthly_hra,monthly_special,tax_regime,old_regime_annual_deductions,
      pf_member,esi_member,professional_tax,labour_welfare_fund
    )
    SELECT
      'EMP' || lpad(n::text, 5, '0'),
      CASE n WHEN 1 THEN 'Aarav Kumar' WHEN 2 THEN 'Sneha Iyer' WHEN 3 THEN 'Rohan Mehta'
        WHEN 4 THEN 'Priya Das' WHEN 5 THEN 'Meera Shaikh' ELSE 'Employee ' || lpad(n::text, 5, '0') END,
      CASE n % 5 WHEN 0 THEN 'Mumbai' WHEN 1 THEN 'Bengaluru' WHEN 2 THEN 'Chennai'
        WHEN 3 THEN 'Gurugram' ELSE 'Kolkata' END,
      CASE n % 5 WHEN 0 THEN 'Maharashtra' WHEN 1 THEN 'Karnataka' WHEN 2 THEN 'Tamil Nadu'
        WHEN 3 THEN 'Haryana' ELSE 'West Bengal' END,
      CASE WHEN n % 8 = 0 THEN 'Operations' ELSE 'General' END,
      '2021-06-01', '1991-06-01',
      CASE WHEN n <= 12 THEN NULL ELSE lpad((1000 + n % 9000)::text, 4, '0') END,
      n > 12,
      (18000 + (n % 11) * 4000) * 100,
      (9000 + (n % 7) * 2000) * 100,
      (7000 + (n % 9) * 3000) * 100,
      CASE WHEN n % 6 = 0 THEN 'old' ELSE 'new' END,
      CASE WHEN n % 6 = 0 THEN 15000000 ELSE 0 END,
      true, false,
      20000, 0
    FROM generate_series(1, ${demoSeedEmployeeCount}) AS n;
    INSERT INTO payroll_runs (id,year,month,payment_date,status,prepared_by)
    VALUES ('RUN-2026-09',2026,9,'2026-09-30','draft','hr-operator');
    INSERT INTO payroll_inputs (run_id,employee_id,variable_pay,other_deduction,unpaid_days,working_days)
    SELECT 'RUN-2026-09', id,
      CASE WHEN id IN ('EMP00002','EMP00024','EMP00032','EMP00040') THEN 5000000 ELSE 0 END,
      0, 0, 30 FROM employees;
  `);
  await backfillHierarchy();
}

async function backfillHierarchy(): Promise<void> {
  // Populate the existing fictional workforce once; subsequent edits are preserved.
  await db.exec(`
    UPDATE employees e SET
      employment_type=CASE WHEN n.num % 17=0 THEN 'contractor' WHEN n.num % 13=0 THEN 'casual'
        WHEN n.num % 11=0 THEN 'fixed_term' WHEN n.num % 7=0 THEN 'probation' ELSE 'permanent' END,
      position_level=CASE WHEN n.num=8 THEN 8 WHEN n.num % 1000=16 THEN 7
        WHEN n.num % 500=24 THEN 6 WHEN n.num % 250=32 THEN 5
        WHEN n.num % 100=40 THEN 4 WHEN n.num=48 OR n.num % 20=0 THEN 3
        WHEN n.num % 4=0 THEN 2 ELSE 1 END,
      department=CASE n.num % 5 WHEN 0 THEN 'Operations' WHEN 1 THEN 'Technology'
        WHEN 2 THEN 'Sales' WHEN 3 THEN 'Finance' ELSE 'People' END,
      job_title=CASE WHEN n.num=8 THEN 'Managing Director'
        WHEN n.num % 1000=16 THEN 'Vice President' WHEN n.num % 500=24 THEN 'Director'
        WHEN n.num % 250=32 THEN 'Senior Manager' WHEN n.num % 100=40 THEN 'Manager'
        WHEN n.num=48 OR n.num % 20=0 THEN 'Supervisor' WHEN n.num % 4=0 THEN 'Senior Associate'
        ELSE 'Associate' END,
      manager_id=CASE WHEN n.num=8 THEN NULL WHEN n.num % 1000=16 THEN 'EMP00008'
        WHEN n.num % 500=24 THEN 'EMP00016' WHEN n.num % 250=32 THEN 'EMP00024'
        WHEN n.num % 100=40 THEN 'EMP00032' WHEN n.num=48 OR n.num % 20=0 THEN 'EMP00040'
        ELSE 'EMP00048' END,
      work_email='employee' || lpad(n.num::text,5,'0') || '@example.invalid',
      employment_status='active',
      payroll_scope=n.num % 17<>0,
      leave_balance_days=CASE WHEN n.num % 17=0 OR n.num % 13=0 THEN 0
        WHEN n.num % 7=0 THEN 4 ELSE 12 END,
      leave_taken_days=n.num % 3
    FROM (SELECT id, substring(id from 4)::integer AS num FROM employees WHERE employment_type IS NULL) n
    WHERE e.id=n.id;
    UPDATE employees SET employment_type='contractor',payroll_scope=false WHERE employment_type='contract';
    UPDATE employees SET job_title='Managing Director' WHERE position_level=8;
    UPDATE employees SET employment_type='permanent',payroll_scope=true,leave_balance_days=12
      WHERE id<='${demoSeedLastEmployeeId}' AND position_level>=4;
    UPDATE employees SET monthly_basic=0,monthly_hra=0,monthly_special=0,
      pf_member=false,esi_member=false,professional_tax=0,labour_welfare_fund=0,
      bank_ready=false,bank_account_last4=NULL,leave_balance_days=0
      WHERE id<='${demoSeedLastEmployeeId}' AND employment_type='contractor';
  `);
}

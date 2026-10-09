import { eq, sql } from 'drizzle-orm';
import type { Db, Tx } from './client.js';
import { appMeta, payrollRuns } from './schema.js';

export const DEMO_RUN_ID = 'RUN-2026-09';
export const DEMO_ORGANIZATION = { name: 'Aster Group', branches: 5, mode: 'Synthetic demo' };
/** The twelve seeded people whose bank details are missing, so the first calculation has blocking exceptions. */
export const SEEDED_BANK_EXCEPTIONS = 12;
const VARIABLE_PAY_IDS = ['EMP00002', 'EMP00024', 'EMP00032', 'EMP00040'];

const FEMALE = [
  'Ananya',
  'Diya',
  'Ishita',
  'Kavya',
  'Meera',
  'Nisha',
  'Pooja',
  'Riya',
  'Sana',
  'Tanvi',
  'Aditi',
  'Bhavna',
  'Charu',
  'Divya',
  'Fatima',
  'Gauri',
  'Harini',
  'Isha',
  'Jyoti',
  'Kritika',
  'Lakshmi',
  'Madhuri',
  'Neha',
  'Pallavi',
  'Radhika',
  'Shreya',
  'Swati',
  'Uma',
  'Vaishnavi',
  'Zoya',
];
const MALE = [
  'Aarav',
  'Arjun',
  'Dev',
  'Ishaan',
  'Kabir',
  'Nikhil',
  'Pranav',
  'Rahul',
  'Sahil',
  'Vikram',
  'Abhishek',
  'Aniket',
  'Deepak',
  'Farhan',
  'Gaurav',
  'Harsh',
  'Imran',
  'Karan',
  'Manish',
  'Naveen',
  'Omkar',
  'Prakash',
  'Rohit',
  'Sandeep',
  'Suresh',
  'Tarun',
  'Varun',
  'Vivek',
  'Yash',
  'Zubin',
];
const SURNAMES = [
  'Sharma',
  'Iyer',
  'Mehta',
  'Das',
  'Shaikh',
  'Reddy',
  'Nair',
  'Gupta',
  'Banerjee',
  'Kulkarni',
  'Patel',
  'Rao',
  'Singh',
  'Menon',
  'Chatterjee',
  'Joshi',
  'Pillai',
  'Verma',
  'Ghosh',
  'Desai',
  'Krishnan',
  'Bose',
  'Kapoor',
  'Naidu',
  'Mukherjee',
  'Chauhan',
  'Hegde',
  'Saxena',
  'Pandey',
  'Fernandes',
  'Malhotra',
  'Bhat',
  'Sinha',
  'Agarwal',
  'Kumar',
  'Shetty',
  'Mishra',
  'Dutta',
  'Thakur',
  'Varghese',
];
const FIXED_PEOPLE = [
  "1:'Aarav Kumar':'male'",
  "2:'Sneha Iyer':'female'",
  "3:'Rohan Mehta':'male'",
  "4:'Priya Das':'female'",
  "5:'Meera Shaikh':'female'",
].map(item => item.split(':'));

/** Knuth's multiplicative hash, so people near each other in the hierarchy get unrelated names. */
const NAME_HASH = '(n::bigint * 2654435761) % 4294967296';
const sqlArray = (items: string[]) => `ARRAY[${items.map(item => `'${item}'`).join(',')}]`;
const caseFixed = (index: 1 | 2) =>
  `CASE n ${FIXED_PEOPLE.map(parts => `WHEN ${parts[0]} THEN ${parts[index]}`).join(' ')} ELSE NULL END`;

/**
 * Creates the fictional Aster Group workforce and its September 2026 draft run. All people are generated:
 * position levels form an 8-level pyramid reporting up to EMP00008, contractors sit outside payroll, and
 * salaries scale with level.
 */
export async function seedDemoCompany(db: Db, employeeCount: number): Promise<boolean> {
  const seeded = await db.select().from(appMeta).where(eq(appMeta.key, 'demo_seed_size'));
  if (seeded.length) return false;
  if (employeeCount < 60) throw new Error('The demo company needs at least 60 people to form its hierarchy');

  const level = `CASE WHEN n=8 THEN 8 WHEN n%1000=16 THEN 7 WHEN n%500=24 THEN 6 WHEN n%250=32 THEN 5
    WHEN n%100=40 THEN 4 WHEN n=48 OR n%20=0 THEN 3 WHEN n%4=0 THEN 2 ELSE 1 END`;
  await db.execute(
    sql.raw(`
    INSERT INTO employees (id, name, gender, branch, state, pay_group, join_date, date_of_birth,
      bank_account_last4, bank_ready, monthly_basic, monthly_hra, monthly_special, tax_regime,
      old_regime_annual_deductions, pf_member, eps_member, esi_member, employment_type, position_level, job_title,
      department, manager_id, work_email, employment_status, payroll_scope, leave_balance_days, leave_taken_days)
    SELECT id, name, gender, branch, state, pay_group, join_date, date_of_birth, bank_account_last4, bank_ready,
      basic, hra, special, tax_regime, deductions, in_payroll, in_payroll AND basic + special <= 2500000, false,
      employment_type, level, job_title, department, manager_id, work_email, 'active', in_payroll,
      CASE WHEN employment_type IN ('contractor','casual') THEN 0 WHEN employment_type='probation' THEN 4 ELSE 12 END,
      n % 3
    FROM (
      SELECT n, id, name, gender, branch, state, pay_group, join_date, date_of_birth, bank_account_last4, bank_ready,
        tax_regime, deductions, employment_type, level, job_title, department, manager_id, work_email,
        employment_type <> 'contractor' AS in_payroll,
        CASE WHEN employment_type = 'contractor' THEN 0 ELSE round((18000 + (n % 11) * 4000) * factor) * 100 END AS basic,
        CASE WHEN employment_type = 'contractor' THEN 0 ELSE round((9000 + (n % 7) * 2000) * factor) * 100 END AS hra,
        CASE WHEN employment_type = 'contractor' THEN 0 ELSE round((7000 + (n % 9) * 3000) * factor) * 100 END AS special
      FROM (
        SELECT n, 'EMP' || lpad(n::text, 5, '0') AS id,
          coalesce(${caseFixed(1)},
            CASE WHEN n % 2 = 0 THEN (${sqlArray(FEMALE)})[1 + (${NAME_HASH}) % ${FEMALE.length}]
              ELSE (${sqlArray(MALE)})[1 + (${NAME_HASH}) % ${MALE.length}] END
            || ' ' || (${sqlArray(SURNAMES)})[1 + (${NAME_HASH} / 64) % ${SURNAMES.length}]) AS name,
          coalesce(${caseFixed(2)}, CASE WHEN n % 2 = 0 THEN 'female' ELSE 'male' END) AS gender,
          (ARRAY['Mumbai','Bengaluru','Chennai','Gurugram','Kolkata'])[1 + n % 5] AS branch,
          (ARRAY['Maharashtra','Karnataka','Tamil Nadu','Haryana','West Bengal'])[1 + n % 5] AS state,
          CASE WHEN n % 8 = 0 THEN 'Operations' ELSE 'General' END AS pay_group,
          (date '2015-04-01' + (n * 53 % 3400))::date AS join_date,
          (date '1970-01-01' + (n * 397 % 9500))::date AS date_of_birth,
          CASE WHEN n <= ${SEEDED_BANK_EXCEPTIONS} THEN NULL ELSE lpad((1000 + n % 9000)::text, 4, '0') END AS bank_account_last4,
          n > ${SEEDED_BANK_EXCEPTIONS} AS bank_ready,
          CASE WHEN n % 6 = 0 THEN 'old' ELSE 'new' END AS tax_regime,
          CASE WHEN n % 6 = 0 THEN 15000000 ELSE 0 END AS deductions,
          lvl AS level,
          (ARRAY[1, 1.4, 1.8, 2.6, 3.6, 5, 7, 10])[lvl] AS factor,
          CASE WHEN lvl >= 4 THEN 'permanent' WHEN n % 17 = 0 THEN 'contractor' WHEN n % 13 = 0 THEN 'casual'
            WHEN n % 11 = 0 THEN 'fixed_term' WHEN n % 7 = 0 THEN 'probation' ELSE 'permanent' END AS employment_type,
          (ARRAY['Associate','Senior Associate','Supervisor','Manager','Senior Manager','Director','Vice President',
            'Managing Director'])[lvl] AS job_title,
          (ARRAY['Operations','Technology','Sales','Finance','People'])[1 + n % 5] AS department,
          CASE lvl WHEN 8 THEN NULL WHEN 7 THEN 'EMP00008' WHEN 6 THEN 'EMP00016' WHEN 5 THEN 'EMP00024'
            WHEN 4 THEN 'EMP00032' WHEN 3 THEN 'EMP00040' ELSE 'EMP00048' END AS manager_id,
          'emp' || lpad(n::text, 5, '0') || '@aster.example' AS work_email
        FROM (SELECT n, ${level} AS lvl FROM generate_series(1, ${Number(employeeCount)}) AS n) AS numbered
      ) AS people
    ) AS priced;
  `),
  );
  await db.insert(payrollRuns).values({ id: DEMO_RUN_ID, year: 2026, month: 9, paymentDate: '2026-09-30' });
  await resetDemoInputs(db);
  await db.insert(appMeta).values({ key: 'demo_seed_size', value: String(employeeCount) });
  return true;
}

/** Restores the seeded attendance and variable pay for the demo run. */
export async function resetDemoInputs(db: Db | Tx): Promise<void> {
  await db.execute(sql`DELETE FROM payroll_inputs WHERE run_id = ${DEMO_RUN_ID}`);
  await db.execute(sql`
    INSERT INTO payroll_inputs (run_id, employee_id, variable_pay, other_deduction, unpaid_days, working_days)
    SELECT ${DEMO_RUN_ID}, id,
      CASE WHEN id IN (${sql.join(
        VARIABLE_PAY_IDS.map(id => sql`${id}`),
        sql`, `,
      )}) THEN 5000000 ELSE 0 END, 0, 0, 30
    FROM employees`);
}

export async function demoSeedSize(db: Db): Promise<number> {
  const rows = await db.select().from(appMeta).where(eq(appMeta.key, 'demo_seed_size'));
  return Number(rows[0]?.value ?? 0);
}

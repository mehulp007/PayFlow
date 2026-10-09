import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  annualIncomeTax,
  calculateEpf,
  calculateEsi,
  calculatePayroll,
  epfWageCeilingOn,
  esiCoveredForPeriod,
  labourWelfareFund,
  professionalTax,
  statutoryWages,
} from './index.js';
import type { EmployeePayrollProfile, PayrollInput } from './types.js';

const R = (n: number) => n * 100;

function employee(overrides: Partial<EmployeePayrollProfile> = {}): EmployeePayrollProfile {
  return {
    id: 'E001',
    name: 'Test Employee',
    branch: 'Mumbai',
    state: 'Maharashtra',
    payGroup: 'Monthly',
    joinDate: '2020-01-01',
    dateOfBirth: '1990-01-01',
    gender: 'male',
    bankAccountLast4: null,
    bankReady: false,
    monthlyBasic: R(25000),
    monthlyHra: R(10000),
    monthlySpecial: R(15000),
    taxRegime: 'new',
    oldRegimeAnnualDeductions: 0,
    annualOtherIncome: 0,
    annualPriorEmployerTaxableSalary: 0,
    taxAlreadyDeducted: 0,
    pfMember: true,
    pfOnActualWages: false,
    epsMember: true,
    esiMember: false,
    ...overrides,
  };
}
const input = (overrides: Partial<PayrollInput> = {}): PayrollInput => ({
  employeeId: 'E001',
  variablePay: 0,
  otherDeduction: 0,
  unpaidDays: 0,
  workingDays: 30,
  ...overrides,
});
const october = { year: 2026, month: 10, paymentDate: '2026-10-31' };

describe('income tax, tax year 2026-27', () => {
  test('new regime: ₹75,000 standard deduction and full rebate up to ₹12 lakh', () => {
    assert.equal(annualIncomeTax({ annualGrossSalary: R(1275000), regime: 'new', age: 35 }).total, 0);
    assert.equal(annualIncomeTax({ annualGrossSalary: R(1675000), regime: 'new', age: 35 }).slabTax, R(120000));
  });
  test('new regime: marginal relief just above ₹12 lakh', () => {
    const result = annualIncomeTax({ annualGrossSalary: R(1285000), regime: 'new', age: 35 });
    assert.equal(result.taxableIncome, R(1210000));
    assert.equal(result.total, R(10400)); // tax limited to the ₹10,000 excess, plus 4% cess
  });
  test('old regime: senior citizen exemption of ₹3 lakh', () => {
    assert.equal(annualIncomeTax({ annualGrossSalary: R(350000), regime: 'old', age: 65 }).total, 0);
  });
  test('surcharge of 10% above ₹50 lakh with cess', () => {
    const result = annualIncomeTax({ annualGrossSalary: R(6075000), regime: 'new', age: 40 });
    assert.equal(result.slabTax, R(1380000));
    assert.equal(result.surcharge, R(138000));
    assert.equal(result.total, R(1578720));
  });
});

describe('wages under the Code on Wages, 2019', () => {
  test('HRA is excluded while exclusions stay within 50% of pay', () => {
    assert.equal(statutoryWages({ basic: R(25000), hra: R(10000), special: R(15000), variablePay: 0 }), R(40000));
  });
  test('exclusions above 50% are added back to wages', () => {
    assert.equal(statutoryWages({ basic: R(20000), hra: R(30000), special: 0, variablePay: 0 }), R(25000));
  });
});

describe('EPF, EPS and EDLI', () => {
  test('ceiling rises from ₹15,000 to ₹25,000 on 17 September 2026', () => {
    assert.equal(epfWageCeilingOn('2026-09-16'), R(15000));
    assert.equal(epfWageCeilingOn('2026-09-17'), R(25000));
  });
  const base = { dateOfBirth: '1990-01-01', member: true, epsMember: true, onActualWages: false };
  test('August 2026 uses the ₹15,000 ceiling', () => {
    const epf = calculateEpf({ ...base, wages: R(40000), year: 2026, month: 8 });
    assert.deepEqual([epf.employee, epf.employerEps, epf.employerEpf], [R(1800), R(1250), R(550)]);
  });
  test('September 2026 is split 16/14 days between the two ceilings (EPFO FAQ, scenario C)', () => {
    const epf = calculateEpf({ ...base, wages: R(20000), year: 2026, month: 9 });
    assert.equal(epf.pfWages, R(17333));
    assert.equal(epf.employee, R(2080));
    assert.equal(epf.employerEps, R(1444));
    assert.equal(epf.employerEpf, R(636));
    assert.equal(epf.edli, R(87));
    assert.equal(epf.adminCharges, R(87));
  });
  test('October 2026 uses the ₹25,000 ceiling (₹2,083 EPS, ₹917 EPF)', () => {
    const epf = calculateEpf({ ...base, wages: R(40000), year: 2026, month: 10 });
    assert.deepEqual(
      [epf.employee, epf.employerEps, epf.employerEpf, epf.edli, epf.adminCharges],
      [R(3000), R(2083), R(917), R(125), R(125)],
    );
  });
  test('voluntary contribution on actual wages keeps EPS and EDLI at the ceiling', () => {
    const epf = calculateEpf({ ...base, onActualWages: true, wages: R(40000), year: 2026, month: 10 });
    assert.deepEqual(
      [epf.employee, epf.employerEps, epf.employerEpf, epf.edli, epf.adminCharges],
      [R(4800), R(2083), R(2717), R(125), R(200)],
    );
  });
  test('EPS stops on the 58th birthday and the employer share moves to EPF', () => {
    const turning = calculateEpf({ ...base, dateOfBirth: '1968-10-15', wages: R(25000), year: 2026, month: 10 });
    assert.equal(turning.employerEps, R(940)); // 14 of 31 days
    assert.equal(turning.employerEpf, R(2060));
    const older = calculateEpf({ ...base, dateOfBirth: '1966-01-01', wages: R(25000), year: 2026, month: 10 });
    assert.deepEqual([older.employerEps, older.employerEpf], [0, R(3000)]);
  });
  test('non-members of EPS put the full employer 12% into EPF', () => {
    const epf = calculateEpf({ ...base, epsMember: false, wages: R(25000), year: 2026, month: 10 });
    assert.deepEqual([epf.employerEps, epf.employerEpf], [0, R(3000)]);
  });
});

describe('ESI', () => {
  test('coverage is decided against the ₹21,000 ceiling', () => {
    assert.equal(esiCoveredForPeriod(R(21000)), true);
    assert.equal(esiCoveredForPeriod(R(21001)), false);
  });
  test('0.75% and 3.25%, rounded up to the next rupee', () => {
    assert.deepEqual(calculateEsi({ wages: R(18000), covered: true, paidDays: 30 }), {
      wages: R(18000),
      employee: R(135),
      employer: R(585),
      continuedAboveCeiling: false,
    });
    const odd = calculateEsi({ wages: R(18010), covered: true, paidDays: 30 });
    assert.deepEqual([odd.employee, odd.employer], [R(136), R(586)]);
  });
  test('coverage continues above the ceiling until the contribution period ends', () => {
    const esi = calculateEsi({ wages: R(22000), covered: true, paidDays: 30 });
    assert.equal(esi.employee, R(165));
    assert.equal(esi.continuedAboveCeiling, true);
  });
  test('no employee share at an average daily wage up to ₹176', () => {
    const esi = calculateEsi({ wages: R(5000), covered: true, paidDays: 30 });
    assert.deepEqual([esi.employee, esi.employer], [0, R(163)]);
  });
});

describe('professional tax', () => {
  const pt = (state: string, monthlyGross: number, month = 10, gender: 'female' | 'male' | null = 'male') =>
    professionalTax({ state, month, monthlyGross: R(monthlyGross), gender })?.amount;
  test('Karnataka: ₹200 from ₹25,000, ₹300 in February', () => {
    assert.equal(pt('Karnataka', 24999), 0);
    assert.equal(pt('Karnataka', 25000), R(200));
    assert.equal(pt('Karnataka', 25000, 2), R(300));
  });
  test('Maharashtra: women exempt up to ₹25,000', () => {
    assert.equal(pt('Maharashtra', 25000, 10, 'female'), 0);
    assert.equal(pt('Maharashtra', 25001, 10, 'female'), R(200));
    assert.equal(pt('Maharashtra', 9000), R(175));
    assert.equal(pt('Maharashtra', 50000, 2), R(300));
    assert.ok(professionalTax({ state: 'Maharashtra', month: 10, monthlyGross: R(50000), gender: null })?.needsReview);
  });
  test('Tamil Nadu: half-yearly slab deducted in September and March', () => {
    assert.equal(pt('Tamil Nadu', 6000, 9), R(425));
    assert.equal(pt('Tamil Nadu', 50000, 3), R(1250));
    assert.equal(pt('Tamil Nadu', 50000, 10), 0);
  });
  test('West Bengal slabs and Haryana nil', () => {
    assert.equal(pt('West Bengal', 30000), R(150));
    assert.equal(pt('West Bengal', 45000), R(200));
    assert.equal(pt('Haryana', 90000), 0);
  });
  test('unknown states have no rule', () => {
    assert.equal(professionalTax({ state: 'Goa', month: 10, monthlyGross: R(50000), gender: 'male' }), null);
  });
});

describe('labour welfare fund', () => {
  test('fixed contributions fall only in their deduction months', () => {
    assert.deepEqual(labourWelfareFund({ state: 'Karnataka', month: 12, date: '2026-12-01', monthlyGross: R(50000) }), {
      employee: R(50),
      employer: R(100),
      note: 'Karnataka LWF: ₹50 + ₹100 employer, annually in December',
    });
    assert.equal(
      labourWelfareFund({ state: 'Karnataka', month: 11, date: '2026-11-01', monthlyGross: R(50000) })?.employee,
      0,
    );
    assert.equal(
      labourWelfareFund({ state: 'Maharashtra', month: 6, date: '2026-06-01', monthlyGross: R(50000) })?.employer,
      R(75),
    );
  });
  test('Haryana: 0.2% of wages with the cap indexed each January', () => {
    const y2026 = labourWelfareFund({ state: 'Haryana', month: 3, date: '2026-03-01', monthlyGross: R(50000) });
    assert.deepEqual([y2026?.employee, y2026?.employer], [R(35), R(70)]);
    const y2025 = labourWelfareFund({ state: 'Haryana', month: 6, date: '2025-06-01', monthlyGross: R(50000) });
    assert.deepEqual([y2025?.employee, y2025?.employer], [R(34), R(68)]);
    assert.equal(
      labourWelfareFund({ state: 'Haryana', month: 6, date: '2026-06-01', monthlyGross: R(10000) })?.employee,
      R(20),
    );
  });
});

describe('payroll line', () => {
  test('reconciles gross, deductions, net and employer cost', () => {
    const line = calculatePayroll(employee(), input(), october);
    assert.equal(line.gross, R(50000));
    assert.equal(line.statutoryWages, R(40000));
    assert.equal(line.pfEmployee, R(3000));
    assert.equal(line.professionalTax, R(200));
    assert.equal(line.incomeTax, 0);
    assert.equal(line.gross - line.deductions, line.net);
    assert.equal(line.employerCost, R(50000 + 917 + 2083 + 125 + 125));
    assert.ok(line.flags.some(flag => flag.code === 'BANK_MISSING'));
  });
  test('mid-year joiners are not projected for months before joining', () => {
    const pay = { monthlyBasic: R(75000), monthlyHra: R(30000), monthlySpecial: R(45000) };
    const longServing = calculatePayroll(employee(pay), input(), october);
    const newJoiner = calculatePayroll(employee({ ...pay, joinDate: '2026-09-01' }), input(), october);
    assert.equal(longServing.incomeTax, R(12567)); // ₹1,50,800 on ₹18 lakh, spread evenly over twelve months
    const withHistory = calculatePayroll(
      employee({ ...pay, salaryPaidThisYear: R(150000 * 6), taxAlreadyDeducted: 0 }),
      input(),
      october,
    );
    assert.equal(withHistory.incomeTax, R(25133)); // no TDS so far: the year's tax is recovered over October–March
    assert.equal(newJoiner.incomeTax, 0); // ₹10.5 lakh projected: within the rebate
  });
  test('loss of pay in the current month is not extrapolated to the rest of the year', () => {
    const pay = { monthlyBasic: R(75000), monthlyHra: R(30000), monthlySpecial: R(45000) };
    const line = calculatePayroll(employee(pay), input({ unpaidDays: 15 }), october);
    const projected = annualIncomeTax({ annualGrossSalary: R(150000 * 11 + 75000), regime: 'new', age: 36 });
    assert.equal(line.annualProjectedTax, projected.total);
  });
  test('unknown states block the line until rules are reviewed', () => {
    const line = calculatePayroll(employee({ state: 'Goa', bankReady: true }), input(), october);
    assert.deepEqual(
      line.flags.map(flag => flag.code),
      ['PT_RULE_MISSING', 'LWF_RULE_MISSING'],
    );
  });
  test('September 2026 lines record the EPF ceiling split', () => {
    const line = calculatePayroll(employee(), input(), { year: 2026, month: 9, paymentDate: '2026-09-30' });
    assert.ok(line.ruleNotes.some(note => note.includes('September 2026')));
    assert.equal(line.pfEmployee, R(2360)); // (₹8,000 + ₹11,666.67) × 12%
  });
  test('net always equals gross less deductions', () => {
    for (const unpaidDays of [0, 3, 30])
      for (const variablePay of [0, R(12345)])
        for (const state of ['Karnataka', 'Haryana', 'Tamil Nadu']) {
          const line = calculatePayroll(
            employee({ state, esiMember: true }),
            input({ unpaidDays, variablePay }),
            october,
          );
          assert.equal(line.gross - line.deductions, line.net);
        }
  });
});

describe('review flags', () => {
  test('periods outside the reviewed tax year are flagged', () => {
    const line = calculatePayroll(employee({ bankReady: true }), input(), {
      year: 2027,
      month: 4,
      paymentDate: '2027-04-30',
    });
    assert.ok(line.flags.some(flag => flag.code === 'RULES_NOT_REVIEWED'));
    const march = calculatePayroll(employee({ bankReady: true }), input(), {
      year: 2027,
      month: 3,
      paymentDate: '2027-03-31',
    });
    assert.ok(!march.flags.some(flag => flag.code === 'RULES_NOT_REVIEWED'));
  });
  test('an exit in the period reminds payroll of the two-day final settlement', () => {
    const line = calculatePayroll(employee({ bankReady: true, exitDate: '2026-10-20' }), input(), october);
    assert.ok(line.flags.some(flag => flag.code === 'FINAL_SETTLEMENT' && flag.message.includes('2026-10-20')));
  });
});

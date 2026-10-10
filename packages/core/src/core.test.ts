import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
  annualIncomeTax,
  compareRegimes,
  earnedLeaveEntitlement,
  EMPTY_DECLARATION,
  leaveDays,
  leaveDaysInMonth,
  oldRegimeDeductions,
  calculateEpf,
  calculateEsi,
  calculatePayroll,
  epfWageCeilingOn,
  esiCoveredForPeriod,
  labourWelfareFund,
  professionalTax,
  statutoryWages,
} from './index.js';
import type { EmployeePayrollProfile, PayrollInput, TaxDeclaration } from './types.js';

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
    declaration: null,
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
  test('West Bengal: the revised slabs apply to salaries from 1 October 2026', () => {
    const wb = (monthlyGross: number, date: string) =>
      professionalTax({
        state: 'West Bengal',
        month: Number(date.slice(5, 7)),
        date,
        monthlyGross: R(monthlyGross),
        gender: 'male',
      })?.amount;
    assert.deepEqual(
      [20000, 30000, 45000, 100000, 100001].map(gross => wb(gross, '2026-10-01')),
      [0, R(100), R(140), R(170), R(208)],
    );
    assert.deepEqual(
      [10000, 15000, 25000, 30000, 45000].map(gross => wb(gross, '2026-09-01')),
      [0, R(110), R(130), R(150), R(200)],
    );
    const line = calculatePayroll(employee({ state: 'West Bengal', branch: 'Kolkata' }), input(), october);
    assert.equal(line.professionalTax, R(140)); // ₹50,000 gross
  });
  test('Haryana levies no professional tax', () => {
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

describe('old-regime declarations (Form 124)', () => {
  const salary = {
    annualBasic: R(600000),
    annualHra: R(300000),
    annualEmployeePf: 0,
    annualProfessionalTax: 0,
    age: 40,
  };
  const declare = (overrides: Partial<TaxDeclaration>): TaxDeclaration => ({ ...EMPTY_DECLARATION, ...overrides });
  const allowed = (result: ReturnType<typeof oldRegimeDeductions>, code: string) =>
    result.lines.find(line => line.code === code)?.allowed;

  test('Bengaluru rent qualifies for the 50% HRA limit from 2026-27; Gurugram stays at 40%', () => {
    const bengaluru = oldRegimeDeductions(declare({ monthlyRent: R(30000), rentCity: 'Bengaluru' }), salary);
    const gurugram = oldRegimeDeductions(declare({ monthlyRent: R(30000), rentCity: 'Gurugram' }), salary);
    assert.equal(allowed(bengaluru, 'hra'), R(300000));
    assert.equal(allowed(gurugram, 'hra'), R(240000));
  });
  test('rent below 10% of basic gives no HRA exemption', () => {
    assert.equal(allowed(oldRegimeDeductions(declare({ monthlyRent: R(4000), rentCity: 'Pune' }), salary), 'hra'), 0);
  });
  test('employee PF counts towards the ₹1,50,000 limit of s. 123', () => {
    const context = { ...salary, annualEmployeePf: R(21600) };
    assert.equal(allowed(oldRegimeDeductions(declare({ section123: R(120000) }), context), 'section-123'), R(141600));
    assert.equal(allowed(oldRegimeDeductions(declare({ section123: R(140000) }), context), 'section-123'), R(150000));
  });
  test('health insurance, NPS, home loan and professional tax limits', () => {
    const result = oldRegimeDeductions(
      declare({
        healthSelf: R(30000),
        healthParents: R(60000),
        parentsSenior: true,
        npsAdditional: R(80000),
        homeLoanInterest: R(250000),
      }),
      { ...salary, annualProfessionalTax: R(3000) },
    );
    assert.equal(allowed(result, 'section-126'), R(75000));
    assert.equal(allowed(result, 'section-124'), R(50000));
    assert.equal(allowed(result, 'home-loan'), R(200000));
    assert.equal(allowed(result, 'professional-tax'), R(2500));
    assert.equal(result.total, R(327500));
  });
});

describe('regime comparison', () => {
  const highEarner = employee({
    monthlyBasic: R(100000),
    monthlyHra: R(50000),
    monthlySpecial: R(50000),
    epsMember: false,
    taxRegime: 'old',
    declaration: {
      ...EMPTY_DECLARATION,
      monthlyRent: R(60000),
      rentCity: 'Mumbai',
      section123: R(150000),
      npsAdditional: R(50000),
      healthSelf: R(25000),
    },
  });

  test('large declared deductions make the old regime cheaper', () => {
    const comparison = compareRegimes(highEarner, october);
    assert.equal(comparison.projectedGross, R(2400000));
    assert.equal(comparison.new.total, R(292500));
    assert.equal(comparison.old.deductions.total, R(827500));
    assert.equal(comparison.old.taxableIncome, R(1522500));
    assert.equal(comparison.old.total, R(280020));
    assert.equal(comparison.recommended, 'old');
    assert.equal(comparison.saving, R(12480));
  });
  test('without declarations the new regime is recommended', () => {
    const comparison = compareRegimes({ ...highEarner, declaration: null }, october);
    assert.equal(comparison.recommended, 'new');
  });
  test('the payroll line uses the same old-regime deductions as the comparison', () => {
    const line = calculatePayroll(highEarner, input(), october);
    assert.equal(line.taxDeductionsAllowed, R(827500));
    assert.equal(line.annualProjectedTax, R(280020));
    assert.equal(line.incomeTax, compareRegimes(highEarner, october).old.monthlyTds);
  });
});

describe('month-over-month review', () => {
  test('gross pay moving more than 25% from last month is flagged', () => {
    const flagged = (previousGross: number) =>
      calculatePayroll(employee({ bankReady: true, previousGross }), input(), october).flags.find(
        flag => flag.code === 'PAY_CHANGE',
      );
    assert.equal(flagged(R(40000)), undefined);
    assert.match(flagged(R(39000))!.message, /up 28%/);
    assert.match(flagged(R(70000))!.message, /down 29%/);
  });
  test('approved unpaid leave is explained on the line', () => {
    const line = calculatePayroll(employee(), input({ unpaidDays: 3, unpaidLeaveDays: 2 }), october);
    assert.ok(line.ruleNotes.includes('Includes 2 days of approved leave without pay'));
    assert.equal(line.ncpDays, 3);
  });
});

describe('leave under the OSH Code', () => {
  test('leave days skip Sundays and split across months', () => {
    assert.equal(leaveDays('2026-10-05', '2026-10-11'), 6);
    assert.equal(leaveDaysInMonth('2026-09-28', '2026-10-03', 2026, 10), 3);
    assert.equal(leaveDaysInMonth('2026-09-28', '2026-10-03', 2026, 9), 3);
  });
  test('one day of earned leave for every 20 days worked, once 180 days are worked', () => {
    assert.deepEqual(earnedLeaveEntitlement({ joinDate: '2020-01-01' }, 2026), {
      daysWorked: 313,
      qualifies: true,
      days: 15,
    });
    assert.equal(earnedLeaveEntitlement({ joinDate: '2025-09-01' }, 2026).days, 0);
    assert.equal(earnedLeaveEntitlement({ joinDate: '2026-02-01' }, 2026).daysWorked, 0);
  });
});

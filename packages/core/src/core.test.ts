import assert from 'node:assert/strict';
import test from 'node:test';
import { annualIncomeTax, calculatePayroll, epfWageCeilingOn } from './index.js';
import type { EmployeePayrollProfile } from './types.js';

const R = (n: number) => n * 100;

test('2026-27 new-regime slab, standard deduction and rebate', () => {
  assert.equal(annualIncomeTax({ annualGrossSalary: R(1275000), regime: 'new', age: 35 }).total, 0);
  assert.equal(annualIncomeTax({ annualGrossSalary: R(1675000), regime: 'new', age: 35 }).slabTax, R(120000));
});

test('EPF ceiling changes on 17 September 2026', () => {
  assert.equal(epfWageCeilingOn('2026-09-16'), R(15000));
  assert.equal(epfWageCeilingOn('2026-09-17'), R(25000));
});

test('payroll flags missing bank details and reconciles gross less deductions to net', () => {
  const employee: EmployeePayrollProfile = {
    id: 'E001', name: 'Test Employee', branch: 'Mumbai', state: 'Maharashtra', payGroup: 'Monthly',
    joinDate: '2020-01-01', dateOfBirth: '1990-01-01', bankAccountLast4: null, bankReady: false,
    monthlyBasic: R(25000), monthlyHra: R(10000), monthlySpecial: R(15000), taxRegime: 'new',
    oldRegimeAnnualDeductions: 0, annualOtherIncome: 0, annualPriorEmployerTaxableSalary: 0,
    taxAlreadyDeducted: 0, pfMember: true, pfOnFullBasic: false, esiMember: false,
    professionalTax: R(200), labourWelfareFund: 0,
  };
  const result = calculatePayroll(employee, { employeeId: 'E001', variablePay: 0,
    otherDeduction: 0, unpaidDays: 0, workingDays: 30 },
    { year: 2026, month: 9, paymentDate: '2026-09-30' });
  assert.equal(result.pfEmployee, R(3000));
  assert.equal(result.gross - result.deductions, result.net);
  assert(result.flags.some(flag => flag.code === 'BANK_MISSING'));
});

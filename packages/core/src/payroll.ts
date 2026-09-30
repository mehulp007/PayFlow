import { ageOn, annualIncomeTax } from './tax.js';
import type { EmployeePayrollProfile, Money, PayrollInput, PayrollLine, PayrollPeriod } from './types.js';

const R = (rupees: number): Money => rupees * 100;
const roundRupee = (paise: Money): Money => Math.round(paise / 100) * 100;
export const RULE_VERSION = 'IN-TY2026-27-v1';

export function epfWageCeilingOn(date: string): Money {
  return date >= '2026-09-17' ? R(25000) : R(15000);
}

export function calculatePayroll(
  employee: EmployeePayrollProfile,
  input: PayrollInput,
  period: PayrollPeriod,
): PayrollLine {
  if (input.workingDays <= 0 || input.unpaidDays < 0 || input.unpaidDays > input.workingDays) {
    throw new Error(`Invalid attendance for ${employee.id}`);
  }
  const flags: PayrollLine['flags'] = [];
  const paidFraction = (input.workingDays - input.unpaidDays) / input.workingDays;
  const basic = roundRupee(employee.monthlyBasic * paidFraction);
  const hra = roundRupee(employee.monthlyHra * paidFraction);
  const special = roundRupee(employee.monthlySpecial * paidFraction);
  const lossOfPay = employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial - basic - hra - special;
  const gross = basic + hra + special + input.variablePay;
  const pfBase = employee.pfOnFullBasic ? basic : Math.min(basic, epfWageCeilingOn(period.paymentDate));
  const pfEmployee = employee.pfMember ? roundRupee(pfBase * 0.12) : 0;
  const epsEmployer = employee.pfMember ? roundRupee(Math.min(pfBase, epfWageCeilingOn(period.paymentDate)) * 0.0833) : 0;
  const pfEmployer = employee.pfMember ? Math.max(0, roundRupee(pfBase * 0.12) - epsEmployer) : 0;
  const edliEmployer = employee.pfMember ? roundRupee(Math.min(pfBase, epfWageCeilingOn(period.paymentDate)) * 0.005) : 0;
  const esiCovered = employee.esiMember && gross <= R(21000);
  const esiEmployee = esiCovered ? roundRupee(gross * 0.0075) : 0;
  const esiEmployer = esiCovered ? roundRupee(gross * 0.0325) : 0;
  if (employee.professionalTax === null) flags.push({ code: 'PT_RULE_MISSING', severity: 'blocking', message: `Professional tax rule for ${employee.state} needs review` });
  if (employee.labourWelfareFund === null) flags.push({ code: 'LWF_RULE_MISSING', severity: 'blocking', message: `Labour welfare rule for ${employee.state} needs review` });
  const professionalTax = employee.professionalTax ?? 0;
  const labourWelfareFund = employee.labourWelfareFund ?? 0;
  const yearEnd = `${period.year + (period.month > 3 ? 1 : 0)}-03-31`;
  const monthsElapsed = period.month >= 4 ? period.month - 3 : period.month + 9;
  const monthsRemaining = 13 - monthsElapsed;
  const recurringAnnual = (basic + hra + special) * 12;
  const projectedGross = recurringAnnual + input.variablePay + employee.annualPriorEmployerTaxableSalary;
  const projected = annualIncomeTax({
    annualGrossSalary: projectedGross,
    annualOtherIncome: employee.annualOtherIncome,
    eligibleDeductions: employee.taxRegime === 'old' ? employee.oldRegimeAnnualDeductions : 0,
    regime: employee.taxRegime,
    age: ageOn(employee.dateOfBirth, yearEnd),
  });
  const incomeTax = Math.max(0, roundRupee((projected.total - employee.taxAlreadyDeducted) / monthsRemaining));
  const otherDeduction = input.otherDeduction;
  const deductions = pfEmployee + esiEmployee + professionalTax + labourWelfareFund + incomeTax + otherDeduction;
  const net = gross - deductions;
  if (!employee.bankReady) flags.push({ code: 'BANK_MISSING', severity: 'blocking', message: 'Verified bank details required' });
  if (net < 0) flags.push({ code: 'NEGATIVE_NET', severity: 'blocking', message: 'Deductions exceed gross pay' });
  if (gross > (employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial) * 1.5) {
    flags.push({ code: 'HIGH_VARIANCE', severity: 'warning', message: 'Pay is over 50% above regular monthly salary' });
  }
  return {
    employeeId: employee.id, employeeName: employee.name, branch: employee.branch, state: employee.state,
    basic, hra, special, variablePay: input.variablePay, lossOfPay, gross,
    pfEmployee, pfEmployer, epsEmployer, edliEmployer, esiEmployee, esiEmployer,
    professionalTax, labourWelfareFund, incomeTax, otherDeduction, deductions, net,
    annualProjectedTax: projected.total, ruleVersion: RULE_VERSION, flags,
  };
}

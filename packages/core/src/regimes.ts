import type { OldRegimeDeductions } from './declarations.js';
import { projectTax } from './payroll.js';
import { calculateEpf, statutoryWages } from './statutory.js';
import type { TaxCalculation } from './tax.js';
import type { EmployeePayrollProfile, Money, PayrollPeriod, TaxRegime } from './types.js';

export interface RegimeResult extends TaxCalculation {
  regime: TaxRegime;
  /** Old-regime deductions allowed (empty under the new regime, which allows only the standard deduction). */
  deductions: OldRegimeDeductions;
  /** TDS for the period's month if this regime applied. */
  monthlyTds: Money;
}
export interface RegimeComparison {
  /** Salary projected for the tax year: paid so far, then the regular salary to March. */
  projectedGross: Money;
  new: RegimeResult;
  old: RegimeResult;
  /** The regime with the lower tax; the new regime when they are equal (it is the default under s. 202). */
  recommended: TaxRegime;
  /** Tax saved by the recommended regime. */
  saving: Money;
}

/**
 * Compares the year's tax under both regimes for the period, assuming the regular salary for the current and
 * remaining months. Deductions come from the employee's declaration, employee PF and professional tax.
 */
export function compareRegimes(employee: EmployeePayrollProfile, period: PayrollPeriod): RegimeComparison {
  const regular = employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial;
  const epf = calculateEpf({
    wages: statutoryWages({
      basic: employee.monthlyBasic,
      hra: employee.monthlyHra,
      special: employee.monthlySpecial,
      variablePay: 0,
    }),
    year: period.year,
    month: period.month,
    dateOfBirth: employee.dateOfBirth,
    member: employee.pfMember,
    epsMember: employee.epsMember,
    onActualWages: employee.pfOnActualWages,
  });
  const current = { currentGross: regular, monthlyEmployeePf: epf.employee };
  const result = (regime: TaxRegime): RegimeResult => {
    const tax = projectTax(employee, period, current, regime);
    return { ...tax.projected, regime, deductions: tax.deductions, monthlyTds: tax.monthlyTds };
  };
  const newRegime = result('new');
  const oldRegime = result('old');
  const recommended: TaxRegime = oldRegime.total < newRegime.total ? 'old' : 'new';
  return {
    projectedGross: projectTax(employee, period, current, 'new').projectedGross,
    new: newRegime,
    old: oldRegime,
    recommended,
    saving: Math.abs(newRegime.total - oldRegime.total),
  };
}

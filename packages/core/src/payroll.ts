import { calculateEpf, calculateEsi, monthStart, roundRupee, statutoryWages } from './statutory.js';
import { labourWelfareFund, professionalTax, STATE_RULES_VERSION } from './stateRules.js';
import { oldRegimeDeductions, type OldRegimeDeductions } from './declarations.js';
import { ageOn, annualIncomeTax, type TaxCalculation } from './tax.js';
import type { EmployeePayrollProfile, Money, PayrollInput, PayrollLine, PayrollPeriod, TaxRegime } from './types.js';

export const RULE_VERSION = `IN-TY2026-27-v3+${STATE_RULES_VERSION}`;
/** The tax year whose rates and thresholds this rule pack was reviewed against (April 2026 – March 2027). */
export const REVIEWED_TAX_YEAR = { startYear: 2026, label: '2026–27' } as const;

/** Months of the Indian tax year (April = 1 … March = 12) up to and including `month`. */
export function taxYearMonthIndex(month: number): number {
  return month >= 4 ? month - 3 : month + 9;
}

/** Whole months employed in the tax year before the current month, starting from the join month. */
function monthsEmployedBefore(joinDate: string, period: PayrollPeriod): number {
  const yearStart = `${period.month >= 4 ? period.year : period.year - 1}-04-01`;
  const from = joinDate > yearStart ? joinDate : yearStart;
  const current = monthStart(period.year, period.month);
  if (from >= current) return 0;
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5, 7));
  return (period.year - fromYear) * 12 + (period.month - fromMonth);
}

/** Month-over-month change in gross pay that is flagged for review. */
export const PAY_CHANGE_THRESHOLD = 0.25;

/** Months of the tax year employed before the current one, and the months still to come after it. */
function taxMonths(employee: EmployeePayrollProfile, period: PayrollPeriod) {
  return {
    before: monthsEmployedBefore(employee.joinDate, period),
    after: 12 - taxYearMonthIndex(period.month),
  };
}

/** Professional tax over the months employed in the tax year, at the regular monthly gross. */
function annualProfessionalTax(
  employee: EmployeePayrollProfile,
  period: PayrollPeriod,
  regularMonthly: Money,
  months: number,
): Money {
  const startYear = period.month >= 4 ? period.year : period.year - 1;
  let year = 0;
  for (let index = 0; index < 12; index++) {
    const month = ((index + 3) % 12) + 1; // April to March
    const date = monthStart(month >= 4 ? startYear : startYear + 1, month);
    year +=
      professionalTax({ state: employee.state, month, date, monthlyGross: regularMonthly, gender: employee.gender })
        ?.amount ?? 0;
  }
  return Math.round((year * months) / 12);
}

/**
 * Projects the tax year for one regime: salary already paid (or the regular salary for earlier months),
 * this month's pay and regular pay to March. Returns the annual tax, the deductions used, and this month's
 * TDS, which spreads the tax still due evenly over the remaining months (s. 392).
 */
export function projectTax(
  employee: EmployeePayrollProfile,
  period: PayrollPeriod,
  current: { currentGross: Money; monthlyEmployeePf: Money },
  regime: TaxRegime = employee.taxRegime,
): { projected: TaxCalculation; deductions: OldRegimeDeductions; projectedGross: Money; monthlyTds: Money } {
  const regularMonthly = employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial;
  const months = taxMonths(employee, period);
  const monthsInYear = months.before + 1 + months.after;
  const salaryBefore = employee.salaryPaidThisYear ?? regularMonthly * months.before;
  const projectedGross =
    salaryBefore + current.currentGross + regularMonthly * months.after + employee.annualPriorEmployerTaxableSalary;
  const yearEnd = `${period.year + (period.month > 3 ? 1 : 0)}-03-31`;
  const age = ageOn(employee.dateOfBirth, yearEnd);
  const deductions =
    regime === 'old'
      ? oldRegimeDeductions(employee.declaration, {
          annualBasic: employee.monthlyBasic * monthsInYear,
          annualHra: employee.monthlyHra * monthsInYear,
          annualEmployeePf: current.monthlyEmployeePf * monthsInYear,
          annualProfessionalTax: annualProfessionalTax(employee, period, regularMonthly, monthsInYear),
          age,
        })
      : { lines: [], total: 0 };
  const projected = annualIncomeTax({
    annualGrossSalary: projectedGross,
    annualOtherIncome: employee.annualOtherIncome,
    eligibleDeductions: deductions.total,
    regime,
    age,
  });
  // Without year-to-date figures, assume earlier months were paid at the regular salary with TDS spread evenly.
  const taxDeductedBefore =
    employee.salaryPaidThisYear === undefined
      ? Math.max(employee.taxAlreadyDeducted, (projected.total * months.before) / monthsInYear)
      : employee.taxAlreadyDeducted;
  const monthlyTds = Math.max(0, roundRupee((projected.total - taxDeductedBefore) / (months.after + 1)));
  return { projected, deductions, projectedGross, monthlyTds };
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
  const ruleNotes: string[] = [];
  const periodStart = monthStart(period.year, period.month);

  // Earnings, pro-rated for unpaid days.
  const paidDays = input.workingDays - input.unpaidDays;
  const paidFraction = paidDays / input.workingDays;
  const basic = roundRupee(employee.monthlyBasic * paidFraction);
  const hra = roundRupee(employee.monthlyHra * paidFraction);
  const special = roundRupee(employee.monthlySpecial * paidFraction);
  const regularMonthly = employee.monthlyBasic + employee.monthlyHra + employee.monthlySpecial;
  const lossOfPay = regularMonthly - basic - hra - special;
  const gross = basic + hra + special + input.variablePay;

  // Statutory wages (Code on Wages) drive PF and ESI.
  const wages = statutoryWages({ basic, hra, special, variablePay: input.variablePay });
  if (wages > basic + special) ruleNotes.push('Excluded allowances exceed 50% of pay; the excess is counted as wages');

  const epf = calculateEpf({
    wages,
    year: period.year,
    month: period.month,
    dateOfBirth: employee.dateOfBirth,
    member: employee.pfMember,
    epsMember: employee.epsMember,
    onActualWages: employee.pfOnActualWages,
  });
  if (period.year === 2026 && period.month === 9 && employee.pfMember) {
    ruleNotes.push('EPF wage ceiling split for September 2026: ₹15,000 for 1–16 Sep, ₹25,000 from 17 Sep');
  }

  const esi = calculateEsi({ wages, covered: employee.esiMember, paidDays });
  if (esi.continuedAboveCeiling) {
    flags.push({
      code: 'ESI_ABOVE_CEILING',
      severity: 'warning',
      message: 'Wages are above ₹21,000; ESI continues until the contribution period ends',
    });
  }

  const pt = professionalTax({
    state: employee.state,
    month: period.month,
    date: periodStart,
    monthlyGross: gross,
    gender: employee.gender,
  });
  if (!pt)
    flags.push({
      code: 'PT_RULE_MISSING',
      severity: 'blocking',
      message: `Professional tax rule for ${employee.state} needs review`,
    });
  else {
    ruleNotes.push(pt.note);
    if (pt.needsReview) flags.push({ code: 'PT_REVIEW', severity: 'warning', message: pt.needsReview });
  }
  const lwf = labourWelfareFund({ state: employee.state, month: period.month, date: periodStart, monthlyGross: gross });
  if (!lwf)
    flags.push({
      code: 'LWF_RULE_MISSING',
      severity: 'blocking',
      message: `Labour welfare rule for ${employee.state} needs review`,
    });
  else if (lwf.employee || lwf.employer) ruleNotes.push(lwf.note);
  const professionalTaxAmount = pt?.amount ?? 0;
  const lwfEmployee = lwf?.employee ?? 0;
  const lwfEmployer = lwf?.employer ?? 0;

  // Income tax: project the year from salary already paid, this month's actual pay, and regular pay ahead.
  const tax = projectTax(employee, period, { currentGross: gross, monthlyEmployeePf: epf.employee });
  const incomeTax = tax.monthlyTds;
  if (employee.taxRegime === 'old') {
    ruleNotes.push(
      tax.deductions.total
        ? `Old regime: ₹${(tax.deductions.total / 100).toLocaleString('en-IN')} of deductions allowed in the TDS projection`
        : 'Old regime: no deductions declared beyond the standard deduction',
    );
  }
  if (input.unpaidLeaveDays) ruleNotes.push(`Includes ${input.unpaidLeaveDays} days of approved leave without pay`);

  const otherDeduction = input.otherDeduction;
  const deductions = epf.employee + esi.employee + professionalTaxAmount + lwfEmployee + incomeTax + otherDeduction;
  const net = gross - deductions;
  const employerCost =
    gross + epf.employerEpf + epf.employerEps + epf.edli + epf.adminCharges + esi.employer + lwfEmployer;

  if (!employee.bankReady)
    flags.push({ code: 'BANK_MISSING', severity: 'blocking', message: 'Verified bank details required' });
  if (net < 0) flags.push({ code: 'NEGATIVE_NET', severity: 'blocking', message: 'Deductions exceed gross pay' });
  else if (deductions > wages / 2) {
    flags.push({
      code: 'DEDUCTIONS_OVER_HALF',
      severity: 'warning',
      message: 'Deductions exceed 50% of wages (Code on Wages, s. 18); review before approval',
    });
  }
  if (gross > regularMonthly * 1.5) {
    flags.push({ code: 'HIGH_VARIANCE', severity: 'warning', message: 'Pay is over 50% above regular monthly salary' });
  }
  const previous = employee.previousGross;
  if (previous && Math.abs(gross - previous) > previous * PAY_CHANGE_THRESHOLD) {
    const change = Math.round(((gross - previous) / previous) * 100);
    flags.push({
      code: 'PAY_CHANGE',
      severity: 'warning',
      message: `Gross pay ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% on last month (₹${(previous / 100).toLocaleString('en-IN')})`,
    });
  }
  const taxYearStart = period.month >= 4 ? period.year : period.year - 1;
  if (taxYearStart !== REVIEWED_TAX_YEAR.startYear) {
    flags.push({
      code: 'RULES_NOT_REVIEWED',
      severity: 'warning',
      message: `Rates are reviewed for tax year ${REVIEWED_TAX_YEAR.label} only; verify rules for this period`,
    });
  }
  if (employee.exitDate && employee.exitDate.slice(0, 7) === periodStart.slice(0, 7)) {
    flags.push({
      code: 'FINAL_SETTLEMENT',
      severity: 'warning',
      message: `Leaves on ${employee.exitDate}: wages are due within two working days of exit (Code on Wages, s. 17(2))`,
    });
  }

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    branch: employee.branch,
    state: employee.state,
    basic,
    hra,
    special,
    variablePay: input.variablePay,
    lossOfPay,
    workingDays: input.workingDays,
    paidDays,
    ncpDays: input.unpaidDays,
    gross,
    statutoryWages: wages,
    pfWages: epf.pfWages,
    epsWages: epf.epsWages,
    edliWages: epf.edliWages,
    pfEmployee: epf.employee,
    pfEmployer: epf.employerEpf,
    epsEmployer: epf.employerEps,
    edliEmployer: epf.edli,
    epfAdminCharges: epf.adminCharges,
    esiWages: esi.wages,
    esiEmployee: esi.employee,
    esiEmployer: esi.employer,
    professionalTax: professionalTaxAmount,
    labourWelfareFund: lwfEmployee,
    labourWelfareFundEmployer: lwfEmployer,
    incomeTax,
    otherDeduction,
    deductions,
    net,
    employerCost,
    annualProjectedTax: tax.projected.total,
    taxDeductionsAllowed: tax.deductions.total,
    ruleVersion: RULE_VERSION,
    ruleNotes,
    flags,
  };
}

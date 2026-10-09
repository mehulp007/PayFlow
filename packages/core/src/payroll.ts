import { calculateEpf, calculateEsi, monthStart, roundRupee, statutoryWages } from './statutory.js';
import { labourWelfareFund, professionalTax, STATE_RULES_VERSION } from './stateRules.js';
import { ageOn, annualIncomeTax } from './tax.js';
import type { EmployeePayrollProfile, PayrollInput, PayrollLine, PayrollPeriod } from './types.js';

export const RULE_VERSION = `IN-TY2026-27-v2+${STATE_RULES_VERSION}`;

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
  const monthIndex = taxYearMonthIndex(period.month);
  const monthsAfter = 12 - monthIndex;
  const monthsBefore = monthsEmployedBefore(employee.joinDate, period);
  const salaryBefore = employee.salaryPaidThisYear ?? regularMonthly * monthsBefore;
  const projectedGross =
    salaryBefore + gross + regularMonthly * monthsAfter + employee.annualPriorEmployerTaxableSalary;
  const yearEnd = `${period.year + (period.month > 3 ? 1 : 0)}-03-31`;
  const projected = annualIncomeTax({
    annualGrossSalary: projectedGross,
    annualOtherIncome: employee.annualOtherIncome,
    eligibleDeductions: employee.taxRegime === 'old' ? employee.oldRegimeAnnualDeductions : 0,
    regime: employee.taxRegime,
    age: ageOn(employee.dateOfBirth, yearEnd),
  });
  // Without year-to-date figures, assume earlier months were paid at the regular salary with TDS spread evenly.
  const taxDeductedBefore =
    employee.salaryPaidThisYear === undefined
      ? Math.max(employee.taxAlreadyDeducted, (projected.total * monthsBefore) / (monthsBefore + 1 + monthsAfter))
      : employee.taxAlreadyDeducted;
  const incomeTax = Math.max(0, roundRupee((projected.total - taxDeductedBefore) / (monthsAfter + 1)));

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
    annualProjectedTax: projected.total,
    ruleVersion: RULE_VERSION,
    ruleNotes,
    flags,
  };
}

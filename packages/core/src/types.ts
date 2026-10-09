/** All monetary values are integer paise. Dates use YYYY-MM-DD. */
export type Money = number;
export type TaxRegime = 'new' | 'old';
export type Gender = 'female' | 'male' | 'other';

export interface EmployeePayrollProfile {
  id: string;
  name: string;
  branch: string;
  state: string;
  payGroup: string;
  joinDate: string;
  dateOfBirth: string;
  /** Needed for Maharashtra professional tax, which exempts women earning up to ₹25,000. */
  gender: Gender | null;
  bankAccountLast4: string | null;
  bankReady: boolean;
  monthlyBasic: Money;
  monthlyHra: Money;
  monthlySpecial: Money;
  taxRegime: TaxRegime;
  oldRegimeAnnualDeductions: Money;
  annualOtherIncome: Money;
  annualPriorEmployerTaxableSalary: Money;
  /**
   * Taxable salary already paid by this employer earlier in the tax year. When omitted, the regular
   * monthly salary is assumed for each month employed before the current one.
   */
  salaryPaidThisYear?: Money;
  /** TDS already deducted by this employer earlier in the tax year. */
  taxAlreadyDeducted: Money;
  pfMember: boolean;
  /** Contributes on actual PF wages above the statutory ceiling (voluntary, with employer consent). */
  pfOnActualWages: boolean;
  /** Member of the Employees' Pension Scheme (wages within the ceiling on joining). */
  epsMember: boolean;
  /** Covered by ESI for the current contribution period (decided on wages at the start of the period). */
  esiMember: boolean;
}

export interface PayrollInput {
  employeeId: string;
  variablePay: Money;
  otherDeduction: Money;
  unpaidDays: number;
  workingDays: number;
  note?: string;
}

export interface PayrollPeriod {
  year: number;
  month: number;
  paymentDate: string;
}

export type FlagSeverity = 'blocking' | 'warning';
export interface PayrollFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

export interface PayrollLine {
  employeeId: string;
  employeeName: string;
  branch: string;
  state: string;
  basic: Money;
  hra: Money;
  special: Money;
  variablePay: Money;
  lossOfPay: Money;
  /** Non-contributing period days reported in the EPF ECR (unpaid days). */
  ncpDays: number;
  gross: Money;
  /** "Wages" under the Code on Wages, 2019 after the 50% exclusion cap. */
  statutoryWages: Money;
  pfWages: Money;
  epsWages: Money;
  edliWages: Money;
  pfEmployee: Money;
  pfEmployer: Money;
  epsEmployer: Money;
  edliEmployer: Money;
  epfAdminCharges: Money;
  esiWages: Money;
  esiEmployee: Money;
  esiEmployer: Money;
  professionalTax: Money;
  labourWelfareFund: Money;
  labourWelfareFundEmployer: Money;
  incomeTax: Money;
  otherDeduction: Money;
  deductions: Money;
  net: Money;
  /** Gross pay plus every employer-side statutory contribution. */
  employerCost: Money;
  annualProjectedTax: Money;
  ruleVersion: string;
  ruleNotes: string[];
  flags: PayrollFlag[];
}

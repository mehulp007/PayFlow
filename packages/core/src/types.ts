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
  /** Last working day, when the person has left or is leaving. */
  exitDate?: string | null;
  dateOfBirth: string;
  /** Needed for Maharashtra professional tax, which exempts women earning up to ₹25,000. */
  gender: Gender | null;
  bankAccountLast4: string | null;
  bankReady: boolean;
  monthlyBasic: Money;
  monthlyHra: Money;
  monthlySpecial: Money;
  taxRegime: TaxRegime;
  /** The employee's declaration for the tax year (Form 124); used only under the old regime. */
  declaration: TaxDeclaration | null;
  annualOtherIncome: Money;
  annualPriorEmployerTaxableSalary: Money;
  /**
   * Taxable salary already paid by this employer earlier in the tax year. When omitted, the regular
   * monthly salary is assumed for each month employed before the current one, with TDS deducted evenly.
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
  /** Gross pay in the previous approved month, for the month-over-month change check. */
  previousGross?: Money | null;
}

/**
 * What an employee declares to the employer so TDS can allow old-regime deductions (Form 124 under the
 * Income-tax Rules, 2026, which replaced Form 12BB). Amounts are annual paise unless stated.
 */
export interface TaxDeclaration {
  /** Rent paid each month, for the house rent allowance exemption. */
  monthlyRent: Money;
  /** City of the rented home: eight cities qualify for the 50% HRA limit. */
  rentCity: string | null;
  /** Landlord PAN, required when annual rent exceeds ₹1,00,000. */
  landlordPan: string | null;
  /** Schedule XV savings under s. 123 (life insurance, PPF, ELSS, tuition fees, home-loan principal…). */
  section123: Money;
  /** Additional NPS contribution under s. 124 (formerly 80CCD(1B)). */
  npsAdditional: Money;
  /** Health insurance for self, spouse and children under s. 126 (formerly 80D). */
  healthSelf: Money;
  /** Health insurance for parents under s. 126. */
  healthParents: Money;
  parentsSenior: boolean;
  /** Interest on a loan for a self-occupied home. */
  homeLoanInterest: Money;
}

export interface PayrollInput {
  employeeId: string;
  variablePay: Money;
  otherDeduction: Money;
  unpaidDays: number;
  workingDays: number;
  /** How many of the unpaid days come from approved leave without pay (for the calculation notes). */
  unpaidLeaveDays?: number;
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
  /** Days in the pay period and days paid (absent from lines calculated before Phase 3). */
  workingDays?: number;
  paidDays?: number;
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
  /** Old-regime deductions allowed in the tax projection (zero under the new regime). */
  taxDeductionsAllowed: Money;
  ruleVersion: string;
  ruleNotes: string[];
  flags: PayrollFlag[];
}

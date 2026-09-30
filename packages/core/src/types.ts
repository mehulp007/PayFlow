/** All monetary values are integer paise. Dates use YYYY-MM-DD. */
export type Money = number;
export type TaxRegime = 'new' | 'old';

export interface EmployeePayrollProfile {
  id: string;
  name: string;
  branch: string;
  state: string;
  payGroup: string;
  joinDate: string;
  dateOfBirth: string;
  bankAccountLast4: string | null;
  bankReady: boolean;
  monthlyBasic: Money;
  monthlyHra: Money;
  monthlySpecial: Money;
  taxRegime: TaxRegime;
  oldRegimeAnnualDeductions: Money;
  annualOtherIncome: Money;
  annualPriorEmployerTaxableSalary: Money;
  taxAlreadyDeducted: Money;
  pfMember: boolean;
  pfOnFullBasic: boolean;
  esiMember: boolean;
  /** Must come from a reviewed, effective-dated state rule pack. */
  professionalTax: Money | null;
  labourWelfareFund: Money | null;
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
  gross: Money;
  pfEmployee: Money;
  pfEmployer: Money;
  epsEmployer: Money;
  edliEmployer: Money;
  esiEmployee: Money;
  esiEmployer: Money;
  professionalTax: Money;
  labourWelfareFund: Money;
  incomeTax: Money;
  otherDeduction: Money;
  deductions: Money;
  net: Money;
  annualProjectedTax: Money;
  ruleVersion: string;
  flags: Array<{ code: string; severity: 'blocking' | 'warning'; message: string }>;
}

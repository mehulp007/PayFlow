import type { Money, TaxDeclaration } from './types.js';

const R = (rupees: number): Money => rupees * 100;

/**
 * Cities where the HRA exemption may reach 50% of salary (Income-tax Rules, 2026, rule 279, from tax year
 * 2026-27). Everywhere else the limit is 40%.
 */
export const HRA_METRO_CITIES = [
  'Ahmedabad',
  'Bengaluru',
  'Chennai',
  'Delhi',
  'Hyderabad',
  'Kolkata',
  'Mumbai',
  'Pune',
] as const;

/** Annual limits for old-regime deductions, tax year 2026-27. */
export const DEDUCTION_LIMITS = {
  section123: R(150000),
  npsAdditional: R(50000),
  healthSelf: R(25000),
  healthSelfSenior: R(50000),
  healthParents: R(25000),
  healthParentsSenior: R(50000),
  homeLoanInterest: R(200000),
  /** Tax on employment is limited to ₹2,500 a year by Article 276 of the Constitution. */
  professionalTax: R(2500),
} as const;

/** Rent above this a year needs the landlord's PAN on the declaration. */
export const LANDLORD_PAN_RENT_LIMIT = R(100000);

export const EMPTY_DECLARATION: TaxDeclaration = {
  monthlyRent: 0,
  rentCity: null,
  landlordPan: null,
  section123: 0,
  npsAdditional: 0,
  healthSelf: 0,
  healthParents: 0,
  parentsSenior: false,
  homeLoanInterest: 0,
};

export interface DeductionLine {
  code: 'hra' | 'professional-tax' | 'section-123' | 'section-124' | 'section-126' | 'home-loan';
  label: string;
  claimed: Money;
  allowed: Money;
  note: string;
}
export interface OldRegimeDeductions {
  lines: DeductionLine[];
  total: Money;
}

export const isMetroCity = (city: string | null) =>
  city !== null && (HRA_METRO_CITIES as readonly string[]).includes(city);

/**
 * Old-regime deductions for a tax year from salary facts and the employee's declaration. Employee PF and
 * professional tax are counted automatically; everything else comes from the declaration.
 */
export function oldRegimeDeductions(
  declaration: TaxDeclaration | null,
  context: {
    /** Basic pay for the months employed in the tax year ("salary" for HRA is basic plus dearness allowance). */
    annualBasic: Money;
    annualHra: Money;
    annualEmployeePf: Money;
    annualProfessionalTax: Money;
    age: number;
  },
): OldRegimeDeductions {
  const d = declaration ?? EMPTY_DECLARATION;
  const lines: DeductionLine[] = [];
  const add = (line: DeductionLine) => {
    if (line.claimed > 0) lines.push({ ...line, allowed: Math.max(0, Math.round(line.allowed)) });
  };

  const annualRent = d.monthlyRent * 12;
  const metro = isMetroCity(d.rentCity);
  add({
    code: 'hra',
    label: 'House rent allowance exemption',
    claimed: annualRent > 0 ? context.annualHra : 0,
    allowed: Math.min(
      context.annualHra,
      context.annualBasic * (metro ? 0.5 : 0.4),
      annualRent - context.annualBasic * 0.1,
    ),
    note: `Least of HRA received, ${metro ? '50' : '40'}% of basic${metro ? ` (${d.rentCity})` : ''}, and rent above 10% of basic`,
  });
  add({
    code: 'professional-tax',
    label: 'Professional tax',
    claimed: context.annualProfessionalTax,
    allowed: Math.min(context.annualProfessionalTax, DEDUCTION_LIMITS.professionalTax),
    note: 'Tax on employment deducted by the employer',
  });
  const savings = d.section123 + context.annualEmployeePf;
  add({
    code: 'section-123',
    label: 'Savings and investments (s. 123)',
    claimed: savings,
    allowed: Math.min(savings, DEDUCTION_LIMITS.section123),
    note: 'Declared Schedule XV savings plus employee PF, up to ₹1,50,000',
  });
  add({
    code: 'section-124',
    label: 'Additional NPS contribution (s. 124)',
    claimed: d.npsAdditional,
    allowed: Math.min(d.npsAdditional, DEDUCTION_LIMITS.npsAdditional),
    note: 'Up to ₹50,000, over and above s. 123',
  });
  const selfLimit = context.age >= 60 ? DEDUCTION_LIMITS.healthSelfSenior : DEDUCTION_LIMITS.healthSelf;
  const parentsLimit = d.parentsSenior ? DEDUCTION_LIMITS.healthParentsSenior : DEDUCTION_LIMITS.healthParents;
  add({
    code: 'section-126',
    label: 'Health insurance (s. 126)',
    claimed: d.healthSelf + d.healthParents,
    allowed: Math.min(d.healthSelf, selfLimit) + Math.min(d.healthParents, parentsLimit),
    note: `Self and family up to ₹${selfLimit / 100}, parents up to ₹${parentsLimit / 100}`,
  });
  add({
    code: 'home-loan',
    label: 'Home loan interest (self-occupied)',
    claimed: d.homeLoanInterest,
    allowed: Math.min(d.homeLoanInterest, DEDUCTION_LIMITS.homeLoanInterest),
    note: 'Up to ₹2,00,000 for a self-occupied home',
  });
  return { lines, total: lines.reduce((sum, line) => sum + line.allowed, 0) };
}

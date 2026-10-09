import type { Gender, Money } from './types.js';

const R = (rupees: number): Money => rupees * 100;
const roundRupee = (paise: number): Money => Math.round(paise / 100) * 100;

/**
 * State rule pack for salaried employees, reviewed October 2026. Amounts are per employee.
 * Rates change by state notification; verify against the state portal before live use.
 */
export const STATE_RULES_VERSION = 'IN-STATES-2026-10';

// ---------------------------------------------------------------------------
// Professional tax
// ---------------------------------------------------------------------------

type Slab = { upTo: Money; amount: Money };
const slabAmount = (value: Money, slabs: Slab[]): Money =>
  (slabs.find(slab => value <= slab.upTo) ?? slabs[slabs.length - 1]).amount;
const ABOVE = Number.MAX_SAFE_INTEGER;

export interface ProfessionalTaxArgs {
  state: string;
  month: number;
  /** Gross salary for the month. */
  monthlyGross: Money;
  gender: Gender | null;
  /** Tamil Nadu levies PT on half-yearly income; defaults to six times the month's gross. */
  halfYearlyGross?: Money;
}
export interface RuleResult {
  amount: Money;
  note: string;
  needsReview?: string;
}

const professionalTaxRules: Record<string, (args: ProfessionalTaxArgs) => RuleResult> = {
  // Karnataka Tax on Professions (Amendment) Act, 2025: ₹200 a month from ₹25,000, ₹300 in February.
  Karnataka: ({ monthlyGross, month }) => ({
    amount: monthlyGross < R(25000) ? 0 : month === 2 ? R(300) : R(200),
    note: 'Karnataka PT: ₹200/month from ₹25,000 gross, ₹300 in February',
  }),
  // Maharashtra PT Act, as amended 2023: women up to ₹25,000 exempt; ₹300 in February.
  Maharashtra: ({ monthlyGross, month, gender }) => {
    const top = month === 2 ? R(300) : R(200);
    const slabs: Slab[] =
      gender === 'female'
        ? [
            { upTo: R(25000), amount: 0 },
            { upTo: ABOVE, amount: top },
          ]
        : [
            { upTo: R(7500), amount: 0 },
            { upTo: R(10000), amount: R(175) },
            { upTo: ABOVE, amount: top },
          ];
    return {
      amount: slabAmount(monthlyGross, slabs),
      note:
        gender === 'female'
          ? 'Maharashtra PT (women): exempt up to ₹25,000'
          : 'Maharashtra PT: ₹175 / ₹200, ₹300 in February',
      needsReview: gender === null ? 'Gender not recorded; Maharashtra PT applied using the general slab' : undefined,
    };
  },
  // Greater Chennai Corporation half-yearly slabs, revised from the second half of 2024-25.
  // Deducted once per half-year in the September and March payrolls.
  'Tamil Nadu': ({ month, monthlyGross, halfYearlyGross }) => {
    if (month !== 9 && month !== 3) return { amount: 0, note: 'Tamil Nadu PT is deducted in September and March' };
    const income = halfYearlyGross ?? monthlyGross * 6;
    return {
      amount: slabAmount(income, [
        { upTo: R(21000), amount: 0 },
        { upTo: R(30000), amount: R(180) },
        { upTo: R(45000), amount: R(425) },
        { upTo: R(60000), amount: R(930) },
        { upTo: R(75000), amount: R(1025) },
        { upTo: ABOVE, amount: R(1250) },
      ]),
      note: 'Tamil Nadu PT (Greater Chennai Corporation): half-yearly slab',
    };
  },
  // West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979.
  'West Bengal': ({ monthlyGross }) => ({
    amount: slabAmount(monthlyGross, [
      { upTo: R(10000), amount: 0 },
      { upTo: R(15000), amount: R(110) },
      { upTo: R(25000), amount: R(130) },
      { upTo: R(40000), amount: R(150) },
      { upTo: ABOVE, amount: R(200) },
    ]),
    note: 'West Bengal PT: monthly slab',
  }),
  Haryana: () => ({ amount: 0, note: 'Haryana does not levy professional tax' }),
};

/** Returns null when the state has no reviewed rule, which blocks the payroll line. */
export function professionalTax(args: ProfessionalTaxArgs): RuleResult | null {
  return professionalTaxRules[args.state]?.(args) ?? null;
}

// ---------------------------------------------------------------------------
// Labour welfare fund
// ---------------------------------------------------------------------------

export interface LwfResult {
  employee: Money;
  employer: Money;
  note: string;
}

/** Haryana caps the employee share (0.2% of wages) and indexes the cap every 1 January. */
const HARYANA_LWF_CAPS: ReadonlyArray<{ from: string; employeeCap: Money }> = [
  { from: '2025-01-01', employeeCap: R(34) },
  { from: '2026-01-01', employeeCap: R(35) },
];

function fixed(months: number[], employee: number, employer: number, note: string) {
  return ({ month }: { month: number }): LwfResult =>
    months.includes(month)
      ? { employee: R(employee), employer: R(employer), note }
      : { employee: 0, employer: 0, note };
}

const lwfRules: Record<string, (args: { month: number; date: string; monthlyGross: Money }) => LwfResult> = {
  Karnataka: fixed([12], 50, 100, 'Karnataka LWF: ₹50 + ₹100 employer, annually in December'),
  Maharashtra: fixed([6, 12], 25, 75, 'Maharashtra LWF: ₹25 + ₹75 employer, June and December'),
  'Tamil Nadu': fixed([12], 20, 40, 'Tamil Nadu LWF: ₹20 + ₹40 employer, annually in December'),
  'West Bengal': fixed([6, 12], 3, 30, 'West Bengal LWF: ₹3 + ₹30 employer, June and December'),
  Haryana: ({ date, monthlyGross }) => {
    let cap = HARYANA_LWF_CAPS[0].employeeCap;
    for (const step of HARYANA_LWF_CAPS) if (date >= step.from) cap = step.employeeCap;
    const employee = Math.min(roundRupee(monthlyGross * 0.002), cap);
    return { employee, employer: employee * 2, note: `Haryana LWF: 0.2% of wages up to ₹${cap / 100}, employer twice` };
  },
};

/** Returns null when the state has no reviewed rule. */
export function labourWelfareFund(args: {
  state: string;
  month: number;
  date: string;
  monthlyGross: Money;
}): LwfResult | null {
  return lwfRules[args.state]?.(args) ?? null;
}

export const SUPPORTED_STATES = Object.keys(professionalTaxRules);

/** Plain-language summary of each state's rules, for display. Kept beside the rules so both change together. */
export const STATE_RULE_SUMMARIES: Record<string, { professionalTax: string[]; labourWelfareFund: string }> = {
  Karnataka: {
    professionalTax: [
      'Nil below ₹25,000 gross a month',
      '₹200 a month from ₹25,000',
      '₹300 in February (₹2,500 a year)',
    ],
    labourWelfareFund: '₹50 employee + ₹100 employer, deducted in December',
  },
  Maharashtra: {
    professionalTax: [
      'Men: nil to ₹7,500 · ₹175 to ₹10,000 · ₹200 above',
      'Women: nil to ₹25,000 · ₹200 above',
      '₹300 in February instead of ₹200 (₹2,500 a year)',
    ],
    labourWelfareFund: '₹25 employee + ₹75 employer, deducted in June and December',
  },
  'Tamil Nadu': {
    professionalTax: [
      'Half-yearly, on six months of income (Greater Chennai Corporation)',
      'Nil to ₹21,000 · ₹180 · ₹425 · ₹930 · ₹1,025 · ₹1,250 above ₹75,000',
      'Deducted in September and March',
    ],
    labourWelfareFund: '₹20 employee + ₹40 employer, deducted in December',
  },
  'West Bengal': {
    professionalTax: ['Nil to ₹10,000 · ₹110 to ₹15,000 · ₹130 to ₹25,000', '₹150 to ₹40,000 · ₹200 above'],
    labourWelfareFund: '₹3 employee + ₹30 employer, deducted in June and December',
  },
  Haryana: {
    professionalTax: ['Not levied'],
    labourWelfareFund: '0.2% of wages up to ₹35 a month (from January 2026); employer pays twice the employee share',
  },
};

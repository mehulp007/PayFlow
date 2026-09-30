import type { Money, TaxRegime } from './types.js';

export interface TaxCalculation {
  taxableIncome: Money;
  slabTax: Money;
  rebate: Money;
  surcharge: Money;
  cess: Money;
  total: Money;
}

const R = (rupees: number): Money => rupees * 100;
const wholeRupee = (paise: Money): Money => Math.round(paise / 100) * 100;

function progressiveTax(income: Money, slabs: Array<[Money, number]>): Money {
  let remaining = Math.max(0, income);
  let previous = 0;
  let tax = 0;
  for (const [limit, rate] of slabs) {
    const width = Math.min(remaining, limit - previous);
    if (width > 0) tax += width * rate;
    remaining -= width;
    previous = limit;
  }
  if (remaining > 0) tax += remaining * 0.30;
  return wholeRupee(tax);
}

function slabTaxFor(income: Money, regime: TaxRegime, age: number): Money {
  if (regime === 'new') {
    return progressiveTax(income, [
      [R(400000), 0], [R(800000), 0.05], [R(1200000), 0.10],
      [R(1600000), 0.15], [R(2000000), 0.20], [R(2400000), 0.25],
    ]);
  }
  const exempt = age >= 80 ? R(500000) : age >= 60 ? R(300000) : R(250000);
  return progressiveTax(income, [[exempt, 0], [R(500000), 0.05], [R(1000000), 0.20]]);
}

function baseTax(income: Money, regime: TaxRegime, age: number): { slab: Money; rebate: Money } {
  const slab = slabTaxFor(income, regime, age);
  if (regime === 'old') {
    return { slab, rebate: income <= R(500000) ? Math.min(slab, R(12500)) : 0 };
  }
  if (income <= R(1200000)) return { slab, rebate: Math.min(slab, R(60000)) };
  // Ordinary salary income receives marginal rebate immediately above ₹12 lakh.
  const relief = Math.max(0, slab - (income - R(1200000)));
  return { slab, rebate: wholeRupee(relief) };
}

/** Salary-only tax projection for TY 2026-27. Special-rate income is deliberately excluded. */
export function annualIncomeTax(args: {
  annualGrossSalary: Money;
  annualOtherIncome?: Money;
  eligibleDeductions?: Money;
  regime: TaxRegime;
  age: number;
}): TaxCalculation {
  const standardDeduction = args.regime === 'new' ? R(75000) : R(50000);
  const taxableIncome = Math.max(0, wholeRupee(
    args.annualGrossSalary + (args.annualOtherIncome ?? 0) - standardDeduction - (args.eligibleDeductions ?? 0),
  ));
  const { slab, rebate } = baseTax(taxableIncome, args.regime, args.age);
  const afterRebate = Math.max(0, slab - rebate);
  let rate = 0;
  let threshold = 0;
  if (taxableIncome > R(50000000)) { rate = args.regime === 'new' ? 0.25 : 0.37; threshold = R(50000000); }
  else if (taxableIncome > R(20000000)) { rate = 0.25; threshold = R(20000000); }
  else if (taxableIncome > R(10000000)) { rate = 0.15; threshold = R(10000000); }
  else if (taxableIncome > R(5000000)) { rate = 0.10; threshold = R(5000000); }
  let surcharge = wholeRupee(afterRebate * rate);
  if (rate > 0) {
    const below = baseTax(threshold, args.regime, args.age);
    const thresholdBase = below.slab - below.rebate;
    const thresholdRate = threshold === R(5000000) ? 0 : threshold === R(10000000) ? 0.10 :
      threshold === R(20000000) ? 0.15 : 0.25;
    const maximum = thresholdBase * (1 + thresholdRate) + (taxableIncome - threshold);
    surcharge = Math.max(0, Math.min(surcharge, wholeRupee(maximum - afterRebate)));
  }
  const cess = wholeRupee((afterRebate + surcharge) * 0.04);
  return { taxableIncome, slabTax: slab, rebate, surcharge, cess,
    total: afterRebate + surcharge + cess };
}

export function ageOn(dateOfBirth: string, date: string): number {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const on = new Date(`${date}T00:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  if (on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

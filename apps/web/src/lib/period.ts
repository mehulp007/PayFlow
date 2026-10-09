const monthName = (month: number, style: 'long' | 'short' = 'long') =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleString('en-IN', { month: style, timeZone: 'UTC' });

/** "September 2026" */
export const periodLabel = (year: number, month: number) => `${monthName(month)} ${year}`;

/** "2026–27": Indian tax years run April to March. */
export function taxYearLabel(year: number, month: number): string {
  const start = month >= 4 ? year : year - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** "1–30 September 2026 · payment date 30 September" */
export function periodRange(year: number, month: number, paymentDate: string): string {
  const paid = new Date(`${paymentDate}T00:00:00Z`);
  return `1–${daysInMonth(year, month)} ${periodLabel(year, month)} · payment date ${paid.getUTCDate()} ${monthName(paid.getUTCMonth() + 1)}`;
}

export interface FilingDate {
  month: string;
  day: number;
  title: string;
  detail: string;
}

/**
 * Statutory due dates that follow a pay month: EPF ECR and ESI by the 15th of the next month, and the
 * quarterly salary TDS statement (Form 138) at the end of the month after each quarter (31 May for Q4).
 */
export function filingCalendar(year: number, month: number): FilingDate[] {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 ? 3 : 4;
  const tdsDue = {
    1: { month: 7, day: 31 },
    2: { month: 10, day: 31 },
    3: { month: 1, day: 31 },
    4: { month: 5, day: 31 },
  }[quarter];
  return [
    {
      month: monthName(next.month, 'short').toUpperCase(),
      day: 15,
      title: `${monthName(month)} EPF ECR and ESI contribution`,
      detail:
        year === 2026 && month === 9
          ? 'One ECR covers both September ceiling periods; record challan references'
          : 'File the ECR and ESI return; record challan references',
    },
    {
      month: monthName(tdsDue.month, 'short').toUpperCase(),
      day: tdsDue.day,
      title: `Q${quarter} salary TDS · Form 138`,
      detail: 'Reconcile deductions with challans',
    },
  ];
}

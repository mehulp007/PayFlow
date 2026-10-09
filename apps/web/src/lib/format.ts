const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Formats integer paise as rupees; `compact` uses lakh (L) and crore (Cr). */
export function money(paise: number, compact = false): string {
  const rupees = paise / 100;
  if (compact && Math.abs(rupees) >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
  if (compact && Math.abs(rupees) >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)} L`;
  return inr.format(rupees);
}

export const count = (value: number | null | undefined) => (value ?? 0).toLocaleString('en-IN');

/** "fixed_term" → "Fixed Term" */
export const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

/** "approval_pending" → "approval pending" */
export const statusLabel = (status: string) => status.replaceAll('_', ' ');

export const initials = (name: string) =>
  name
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('');

/** Pill colour for a run status: neutral while open, blue in progress, green once approved. */
export function runTone(status: string): 'neutral' | 'info' | 'success' {
  if (status === 'draft') return 'neutral';
  return ['approved', 'paid', 'closed'].includes(status) ? 'success' : 'info';
}

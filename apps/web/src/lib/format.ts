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

/** Parses API timestamps, including PostgreSQL's "2026-10-09 16:17:11.265+00" text form. */
export function parseTimestamp(value: string): Date {
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(/[+-]\d\d$/.test(iso) ? `${iso}:00` : iso);
}

export const dateTime = (value: string) =>
  parseTimestamp(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** "just now", "5 min ago", "3 h ago", then the date. */
export function timeAgo(value: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - parseTimestamp(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return parseTimestamp(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "2026-10-19" → "19 Oct 2026" */
export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

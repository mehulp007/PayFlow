/** Quotes a CSV cell and neutralises spreadsheet formula injection (cells starting with = + - @). */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Paise to a plain rupee figure for exports. */
export const rupees = (paise: number) => paise / 100;

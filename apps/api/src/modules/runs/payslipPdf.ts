import PDFDocument from 'pdfkit';
import type { PayrollLine } from '@payflow/core';

const COLORS = {
  primary: '#2454bd',
  text: '#142247',
  muted: '#7d8aa0',
  border: '#e4eaf3',
  tint: '#eef3ff',
};
const PAGE = { width: 595.28, margin: 40 };
const CONTENT = PAGE.width - PAGE.margin * 2;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const amount = (paise: number) =>
  (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}
/** Whole rupees in words using the Indian system (lakh, crore). */
export function rupeesInWords(paise: number): string {
  let rupees = Math.round(Math.abs(paise) / 100);
  if (rupees === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  for (const [size, name] of [
    [1_00_00_000, 'Crore'],
    [1_00_000, 'Lakh'],
    [1_000, 'Thousand'],
  ] as const) {
    const count = Math.floor(rupees / size);
    if (count)
      parts.push(
        `${count >= 100 ? rupeesInWords(count * 100).replace(' Rupees Only', '') : belowHundred(count)} ${name}`,
      );
    rupees %= size;
  }
  if (rupees) parts.push(belowThousand(rupees));
  return `${parts.join(' ')} Rupees Only`;
}

export interface PayslipDocument {
  organizationName: string;
  year: number;
  month: number;
  paymentDate: string;
  status: string;
  line: PayrollLine;
  employee: {
    jobTitle: string;
    department: string;
    joinDate: string;
    taxRegime: string;
    bankAccountLast4: string | null;
  };
}

/**
 * Renders a wage slip as a PDF (Code on Wages, 2019, s. 50(3): a wage slip on or before the payment of
 * wages). Built-in PDF fonts have no rupee sign, so amounts are labelled INR.
 */
export function payslipPdf(slip: PayslipDocument): Promise<Buffer> {
  const { line } = slip;
  const period = `${MONTHS[slip.month - 1]} ${slip.year}`;
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    info: { Title: `Payslip ${period} - ${line.employeeName}`, Author: slip.organizationName, Creator: 'PayFlow' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Header band
  doc.rect(0, 0, PAGE.width, 92).fill(COLORS.primary);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(slip.organizationName, PAGE.margin, 30, {
      width: CONTENT * 0.6,
    });
  doc.font('Helvetica').fontSize(9).fillColor('#dbe6ff').text('Wage slip · Code on Wages, 2019', PAGE.margin, 56);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff').text(`Payslip · ${period}`, PAGE.margin, 32, {
    width: CONTENT,
    align: 'right',
  });
  doc.font('Helvetica').fontSize(9).fillColor('#dbe6ff').text(`Paid on ${slip.paymentDate}`, PAGE.margin, 52, {
    width: CONTENT,
    align: 'right',
  });

  // Employee details
  let y = 116;
  const details: Array<[string, string]> = [
    ['Employee', line.employeeName],
    ['Employee ID', line.employeeId],
    ['Designation', slip.employee.jobTitle],
    ['Department', slip.employee.department],
    ['Branch', `${line.branch}, ${line.state}`],
    ['Date of joining', slip.employee.joinDate],
    ['Days paid', line.paidDays === undefined ? '—' : `${line.paidDays} of ${line.workingDays}`],
    ['Loss-of-pay days', String(line.ncpDays)],
    ['Tax regime', slip.employee.taxRegime === 'old' ? 'Old regime' : 'New regime (s. 202)'],
    ['Bank account', slip.employee.bankAccountLast4 ? `•••• ${slip.employee.bankAccountLast4}` : 'Not verified'],
  ];
  const columnWidth = CONTENT / 2;
  details.forEach(([label, value], index) => {
    const x = PAGE.margin + (index % 2) * columnWidth;
    const rowY = y + Math.floor(index / 2) * 20;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(label, x, rowY, { width: 95 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COLORS.text)
      .text(value, x + 95, rowY, { width: columnWidth - 105 });
  });
  y += Math.ceil(details.length / 2) * 20 + 10;

  // Net pay
  doc.roundedRect(PAGE.margin, y, CONTENT, 58, 8).fill(COLORS.tint);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text('NET PAY', PAGE.margin + 16, y + 12);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(COLORS.primary)
    .text(`INR ${amount(line.net)}`, PAGE.margin + 16, y + 26);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.text)
    .text(rupeesInWords(line.net), PAGE.margin + 220, y + 30, {
      width: CONTENT - 236,
      align: 'right',
    });
  y += 76;

  // Earnings and deductions side by side
  const table = (
    x: number,
    top: number,
    width: number,
    title: string,
    rows: Array<[string, number]>,
    total: [string, number],
  ) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text).text(title, x, top);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text('INR', x, top + 1, { width, align: 'right' });
    let rowY = top + 18;
    for (const [label, value] of rows) {
      doc
        .moveTo(x, rowY - 4)
        .lineTo(x + width, rowY - 4)
        .lineWidth(0.6)
        .strokeColor(COLORS.border)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLORS.text)
        .text(label, x, rowY, { width: width * 0.65 });
      doc.text(amount(value), x, rowY, { width, align: 'right' });
      rowY += 18;
    }
    doc
      .moveTo(x, rowY - 4)
      .lineTo(x + width, rowY - 4)
      .lineWidth(1)
      .strokeColor(COLORS.text)
      .stroke();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text).text(total[0], x, rowY);
    doc.text(amount(total[1]), x, rowY, { width, align: 'right' });
    return rowY + 20;
  };
  const half = (CONTENT - 24) / 2;
  const earnings: Array<[string, number]> = [
    ['Basic', line.basic],
    ['House rent allowance', line.hra],
    ['Special allowance', line.special],
    ['Variable pay', line.variablePay],
  ];
  const deductions: Array<[string, number]> = [
    ['Provident fund', line.pfEmployee],
    ['ESI', line.esiEmployee],
    ['Professional tax', line.professionalTax],
    ['Labour welfare fund', line.labourWelfareFund],
    ['Income tax (TDS)', line.incomeTax],
    ['Other deductions', line.otherDeduction],
  ];
  const left = table(PAGE.margin, y, half, 'Earnings', earnings, ['Gross earnings', line.gross]);
  const right = table(PAGE.margin + half + 24, y, half, 'Deductions', deductions, [
    'Total deductions',
    line.deductions,
  ]);
  y = Math.max(left, right) + 8;
  if (line.lossOfPay > 0) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(
        `Earnings are after loss of pay of INR ${amount(line.lossOfPay)} for ${line.ncpDays} unpaid days.`,
        PAGE.margin,
        y,
      );
    y += 18;
  }

  // Employer contributions and statutory wages
  const employer: Array<[string, number]> = [
    ['EPF (employer)', line.pfEmployer],
    ['EPS (pension)', line.epsEmployer],
    ['EDLI and EPF admin charges', line.edliEmployer + line.epfAdminCharges],
    ['ESI (employer)', line.esiEmployer],
    ['Labour welfare fund (employer)', line.labourWelfareFundEmployer],
  ];
  const wages: Array<[string, number]> = [
    ['Wages (Code on Wages, s. 2(y))', line.statutoryWages],
    ['PF wages', line.pfWages],
    ['ESI wages', line.esiWages],
  ];
  const employerEnd = table(PAGE.margin, y, half, 'Employer contributions', employer, [
    'Cost to employer',
    line.employerCost,
  ]);
  const wagesEnd = table(PAGE.margin + half + 24, y, half, 'Statutory wages and tax', wages, [
    'Projected annual tax',
    line.annualProjectedTax,
  ]);
  y = Math.max(employerEnd, wagesEnd) + 14;

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
  doc.text(
    `Calculated with rule pack ${line.ruleVersion}. Run status: ${slip.status.replace('_', ' ')}. ` +
      'This is a computer-generated wage slip and needs no signature.',
    PAGE.margin,
    y,
    { width: CONTENT },
  );
  doc.moveDown(0.4);
  doc.text(
    'SYNTHETIC DEMONSTRATION DOCUMENT generated by PayFlow. It is not a statutory record and must not be used for ' +
      'loans, visas or tax filing.',
    { width: CONTENT },
  );
  doc.end();
  return done;
}

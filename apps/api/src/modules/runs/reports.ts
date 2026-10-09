import type { PayrollLine } from '@payflow/core';
import type { ReportKind } from '@payflow/shared';
import { rupees } from '../../lib/csv.js';

type Report = { header: unknown[][]; row: (line: PayrollLine) => unknown[]; include?: (line: PayrollLine) => boolean };

/** Preparation reports. None of these are portal upload formats; see docs/compliance-notes.md. */
export const REPORTS: Record<ReportKind, Report> = {
  'salary-register': {
    header: [['Employee ID', 'Name', 'State', 'Gross INR', 'Deductions INR', 'Net INR', 'Employer cost INR']],
    row: l => [
      l.employeeId,
      l.employeeName,
      l.state,
      rupees(l.gross),
      rupees(l.deductions),
      rupees(l.net),
      rupees(l.employerCost),
    ],
  },
  'bank-demo': {
    header: [['DEMO ONLY - NOT A BANK UPLOAD FILE'], ['Employee ID', 'Beneficiary', 'Fictional Account', 'Net INR']],
    row: l => [l.employeeId, l.employeeName, `TEST${l.employeeId}`, rupees(l.net)],
  },
  'epf-prep': {
    header: [
      [
        'Employee ID',
        'Member name',
        'Gross wages INR',
        'EPF wages INR',
        'EPS wages INR',
        'EDLI wages INR',
        'EE share INR',
        'EPS contribution INR',
        'ER share INR',
        'EDLI INR',
        'Admin charges INR',
        'NCP days',
      ],
    ],
    include: l => l.pfWages > 0,
    row: l => [
      l.employeeId,
      l.employeeName,
      rupees(l.gross),
      rupees(l.pfWages),
      rupees(l.epsWages),
      rupees(l.edliWages),
      rupees(l.pfEmployee),
      rupees(l.epsEmployer),
      rupees(l.pfEmployer),
      rupees(l.edliEmployer),
      rupees(l.epfAdminCharges),
      l.ncpDays,
    ],
  },
  'esi-prep': {
    header: [['Employee ID', 'Name', 'ESI wages INR', 'Employee ESI INR', 'Employer ESI INR']],
    include: l => l.esiWages > 0,
    row: l => [l.employeeId, l.employeeName, rupees(l.esiWages), rupees(l.esiEmployee), rupees(l.esiEmployer)],
  },
  'form138-prep': {
    header: [['Employee ID', 'Salary INR', 'Tax deducted INR', 'Tax year', 'Applicable section']],
    row: l => [l.employeeId, rupees(l.gross), rupees(l.incomeTax), '2026-27', '392'],
  },
  'state-deductions': {
    header: [['Employee ID', 'State', 'Professional tax INR', 'LWF employee INR', 'LWF employer INR']],
    row: l => [
      l.employeeId,
      l.state,
      rupees(l.professionalTax),
      rupees(l.labourWelfareFund),
      rupees(l.labourWelfareFundEmployer),
    ],
  },
};

export function buildReport(kind: ReportKind, lines: PayrollLine[]): unknown[][] {
  const report = REPORTS[kind];
  return [...report.header, ...lines.filter(report.include ?? (() => true)).map(report.row)];
}

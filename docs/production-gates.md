# Production release gates

This checklist records the work remaining after the executable prototype. Each gate needs named HR, Finance, security, and Indian payroll-compliance owners before live payroll.

| Gate | Evidence required |
|---|---|
| Employer discovery | Signed salary structures, policy decisions, pay groups, active states, registrations, bank layout, approval matrix and historical data mapping. |
| Rules | Effective-dated, source-linked, reviewed test cases for both tax regimes, salary exemptions and deductions, EPF/EPS/EDLI, ESI contribution periods, each active state's PT/LWF/minimum wages, gratuity and labour-code wages. |
| Calculation | Explainable component ledger, prior-month comparison, retroactive adjustments and versioning; approved results remain immutable. No blocking exception can be approved. |
| Identity and privacy | SSO, MFA for approval/export, person-level maker-checker, employee self-service isolation, encryption and key management for sensitive identifiers, retention and access logs. |
| Statutory outputs | Portal-schema validation and payroll-specialist sign-off for each EPF, ESI, salary tax, and state output. Capture filing reference, challan, acknowledgement and corrections. |
| Payments | Bank-specific upload template, dual control, exact total reconciliation, rejection handling, and accounting entries. No direct transfer in the initial release. |
| Operations | India cloud region, production PostgreSQL, job queue, monitoring, backup/restore drill, incident runbook, dependency review and disaster recovery target. |
| Acceptance | 10,000-employee run within 15 minutes; web/mobile parity; every employee reconciles gross, deductions and net against two parallel cycles; employer signs off before cutover. |

## Suggested implementation order

1. Interview a pilot employer and payroll specialist; record policy decisions and state registrations.
2. Add effective-dated rule-pack tables, signed sources, calculation ledger and approved-case fixtures.
3. Replace demo identity and local data with production services, then implement protected employee documents and tax declaration evidence.
4. Build validated statutory and bank templates with corrections, reconciliation, and immutable approval snapshots.
5. Complete performance, privacy, security, backup and parallel-payroll gates before cutover.

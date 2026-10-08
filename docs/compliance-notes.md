# Compliance notes and production boundary

PayFlow is a portfolio project. It runs on **synthetic data only** and must not be used to pay real people,
produce statutory filings, or store real employee, salary, tax or bank details.

## What the calculation pack is (and is not)

The `@payflow/core` library is a **starter implementation** for Indian tax year 2026–27, not an approved rule set.

| Area | Implemented | Not yet modelled |
|---|---|---|
| Income tax (TDS) | New/old regime slabs, standard deduction, rebate, marginal relief above ₹12 lakh, surcharge with marginal relief, 4% cess, monthly TDS from annual projection | Full exemptions and declarations, proofs, prior-employer reconciliation, special-rate income |
| EPF / EPS / EDLI | Employee and employer split; wage ceiling change on 17 September 2026 (₹15,000 → ₹25,000) | Actual eligibility rules, voluntary PF, arrears |
| ESI | 0.75% / 3.25% under the ₹21,000 gross threshold | Contribution-period continuation |
| State deductions | Professional tax and labour welfare fields | Real state slabs: values are placeholders (₹200 PT, ₹0 LWF) |
| Other | Loss of pay, variable pay, other deductions, blocking exceptions | Minimum wages, labour-code wages, gratuity, mid-period joins/exits |

The tax and social-security starter values were based on the
[2026 Budget memorandum](https://www.indiabudget.gov.in/doc/memo.pdf),
[Income Tax Department Form 138 guidance](https://www.incometax.gov.in/iec/foportal/newformpage/forms/form138-um),
the [EPF ceiling announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2310973&lang=1&reg=3) and
[ESIC contribution guidance](https://www.esic.gov.in/attachments/publicationfile/6f673bcd3d6110170f790d2909767b4f.pdf).
A payroll specialist must verify effective rules, notifications and portal schemas before any live use.

## Exports

The CSV reports (salary register, EPF, ESI, Form 138, state deductions) are **preparation data**, not validated
government upload formats. The bank file uses fictional account references and is marked `DEMO ONLY`.

## What a live payroll service would still need

| Gate | Evidence required |
|---|---|
| Employer discovery | Signed salary structures, pay groups, active states, registrations, bank layout, approval matrix |
| Rules | Effective-dated, source-linked, reviewed test cases for both regimes, EPF/ESI, each state's PT/LWF and minimum wages, gratuity |
| Calculation | Explainable component ledger, prior-month comparison, retro adjustments, immutable approved results |
| Identity & privacy | SSO, MFA for approval/export, maker-checker, encryption of PAN/bank/UAN, retention and access logs |
| Statutory outputs | Portal-schema validation and specialist sign-off for EPF, ESI, TDS and state outputs |
| Payments | Bank-specific upload template, dual control, exact reconciliation, rejection handling |
| Operations | Managed PostgreSQL, backups and restore drill, monitoring, incident runbook |
| Acceptance | Two parallel payroll cycles reconciled against an existing system, employer sign-off |

As a safeguard, the API refuses to start with `NODE_ENV=production`.

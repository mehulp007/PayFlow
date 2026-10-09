# Compliance notes and production boundary

PayFlow is a portfolio project. It runs on **synthetic data only** and must not be used to pay real people,
produce statutory filings, or store real employee, salary, tax or bank details.

The calculation rules were **reviewed in October 2026** against the regulations below. Rule version:
`IN-TY2026-27-v2+IN-STATES-2026-10` (shown on every payroll line). Rules change by notification, so verify
against the official portals before relying on any figure.

## What the rule pack implements

### Income tax: Income-tax Act, 2025 (in force from 1 April 2026), tax year 2026-27

| Item                 | Rule                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New regime (default) | Nil to ₹4L · 5% to ₹8L · 10% to ₹12L · 15% to ₹16L · 20% to ₹20L · 25% to ₹24L · 30% above                                                                                                                                                                                                                                                                                                                                       |
| Old regime           | Nil to ₹2.5L (₹3L at 60+, ₹5L at 80+) · 5% to ₹5L · 20% to ₹10L · 30% above                                                                                                                                                                                                                                                                                                                                                      |
| Standard deduction   | ₹75,000 new regime, ₹50,000 old regime                                                                                                                                                                                                                                                                                                                                                                                           |
| Rebate               | New: up to ₹60,000 for taxable income up to ₹12L, with marginal relief just above. Old: up to ₹12,500 up to ₹5L                                                                                                                                                                                                                                                                                                                  |
| Surcharge and cess   | 10% / 15% / 25% / 37% (new regime capped at 25%) with marginal relief; 4% health and education cess                                                                                                                                                                                                                                                                                                                              |
| Monthly TDS (s. 392) | Annual tax is projected from salary actually paid earlier in the tax year (from approved runs), this month's actual pay and regular pay for the remaining months. TDS already deducted in those runs is subtracted and the balance is spread over the remaining months, so earlier under- or over-deduction is corrected going forward. Months before joining are not counted, and this month's loss of pay is not extrapolated. |
| Returns              | Quarterly salary TDS statement is **Form 138** (replaces 24Q); the annual certificate is **Form 130** (replaces Form 16)                                                                                                                                                                                                                                                                                                         |

### Wages: Code on Wages, 2019 and Code on Social Security, 2020 (in force from 21 November 2025)

- PF and ESI use statutory **wages**: basic plus special allowance. HRA and bonus/commission-type variable pay are
  excluded, but only up to **50% of total remuneration**; any excess is added back to wages.
- Special allowance is not an excluded head in s. 2(y), so it is treated as wages. This is an interpretation;
  some employers read it differently.
- A warning is raised when deductions exceed 50% of wages (s. 18).

### EPF, EPS and EDLI

| Item           | Rule                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Wage ceiling   | ₹15,000 until 16 Sep 2026; **₹25,000 from 17 Sep 2026** (S.O. 5109(E))                                         |
| September 2026 | Split by days per EPFO FAQs: 1–16 Sep on the ₹15,000 ceiling, 17–30 Sep on ₹25,000, reported in one ECR        |
| Employee       | 12% of PF wages (actual wages if the member contributes voluntarily above the ceiling)                         |
| Employer       | 8.33% EPS on wages within the ceiling (EPS members only); the rest of the 12% to EPF                           |
| EPS exit       | EPS stops on the 58th birthday (split by days that month); the full employer 12% then goes to EPF              |
| EDLI and admin | 0.5% each (EDLI on wages within the ceiling). The ₹500/month establishment minimum is not applied per employee |

### ESI

| Item     | Rule                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rates    | 0.75% employee, 3.25% employer, on statutory wages                                                                                                              |
| Ceiling  | ₹21,000 a month, decided at the start of each contribution period (April–September, October–March). Coverage continues until the period ends even if wages rise |
| Low wage | No employee share at an average daily wage up to ₹176                                                                                                           |
| Rounding | Each share is rounded up to the next rupee                                                                                                                      |

### State rules: professional tax and labour welfare fund

| State       | Professional tax                                                                               | Labour welfare fund (employee + employer)                        |
| ----------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Karnataka   | ₹200/month from ₹25,000 gross; ₹300 in February (2025 amendment)                               | ₹50 + ₹100, December                                             |
| Maharashtra | Men: ₹175 (₹7,501–10,000), ₹200 above; women exempt up to ₹25,000; ₹300 in February            | ₹25 + ₹75, June and December                                     |
| Tamil Nadu  | Greater Chennai Corporation half-yearly slab (₹180 to ₹1,250), deducted in September and March | ₹20 + ₹40, December                                              |
| West Bengal | ₹110 / ₹130 / ₹150 / ₹200 monthly slabs above ₹10,000                                          | ₹3 + ₹30, June and December                                      |
| Haryana     | Not levied                                                                                     | 0.2% of wages up to ₹35 (from Jan 2026), employer twice, monthly |

States without a reviewed rule are **blocked** until rules are added: branches can only be created in the five
states above, and each organization's compliance page lists the rules for its own states. The rule pack is
maintained centrally rather than edited per organization, so no tenant can drift from the reviewed rates.
Maharashtra employees without a recorded gender get a review warning, because the women's exemption cannot be
applied.

### Pay periods and employment events: Code on Wages, 2019, s. 17

| Item                  | Rule                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment deadline      | Monthly wages must be paid before the 7th day of the following month (s. 17(1)). A run's payment date must fall between the first day of the month and the 7th of the next, or it cannot be created. |
| One payment per month | A month cannot be paid twice for the same people: overlapping runs (same month, overlapping pay groups) are refused.                                                                                 |
| Joining and leaving   | Calendar days before joining or after the last working day are unpaid, so the month is pro-rated automatically.                                                                                      |
| Final settlement      | Wages due on exit, including on resignation, must be paid within two working days (s. 17(2)). Lines for a leaver carry a warning to settle separately from the monthly run.                          |
| Salary revisions      | Effective-dated, starting on the first of a month after the last approved period. Approved runs are never recalculated.                                                                              |
| Reviewed tax year     | Periods outside tax year 2026–27 carry a warning that rates must be verified for that year.                                                                                                          |

## Known limitations

- Tamil Nadu PT uses six times the current month's gross as the half-yearly income, and slabs vary by local
  body; the Chennai corporation slab is used.
- Year-to-date figures come from runs approved in PayFlow. For an organization without approved history in the tax
  year (for example a new organization starting mid-year), earlier months are assumed to have been paid at the
  regular salary with TDS deducted evenly. Salary from a previous employer is an input (Form 12B in practice).
- Mid-month salary revisions are not supported (revisions start on the first of a month), and arrears for approved
  months are not modelled.
- Final settlement within two working days is flagged, not computed: leave encashment, notice pay and gratuity on
  exit are outside the monthly run.
- Not yet modelled: HRA exemption and old-regime declarations in detail, perquisites, employer PF above ₹7.5L,
  gratuity accrual, minimum-wage checks, and the ESI disability ceiling (₹25,000).

## Sources

- [Code on Wages, 2019, s. 17: time limit for payment of wages](https://www.advocatekhoj.com/library/bareacts/codeonwages/17.php) · [Two-working-day final settlement](https://www.livelaw.in/articles/two-working-days-code-wages-employee-final-settlement-552780)
- [TDS on salary at the average rate under section 392](https://www.taxheal.com/tds-on-salary-under-section-392-of-income-tax-act.html)

- [Budget 2026-27 tax slabs (unchanged from 2025-26)](https://www.bankbazaar.com/tax/income-tax-slabs.html)
- [TDS on salary under section 392](https://www.taxheal.com/tds-on-salary-under-section-392-of-income-tax-act.html) · [Form 130 replaces Form 16](https://taxguru.in/income-tax/form-130-tds-certificate-salary-replacing-form-16.html)
- [EPFO FAQs: wage ceiling ₹25,000](https://www.sgcms.com/regulatory-updates/faqs-by-epfo-wage-ceiling-raised-to-25000/) · [September 2026 split calculation](https://www.caclubindia.com/articles/epf-wage-ceiling-increased-to-rs-25-000-from-rs-15-000-new-rules-from-17th-september-2026-56352.asp)
- [ESIC contribution rules](https://www.esic.gov.in/contribution) · [ESI ceiling unchanged at ₹21,000](https://www.indianhrm.com/payroll-compliance-updates/esi-ceiling-holds-21000)
- [Labour Codes in force from 21 November 2025](https://www.cyrilshroff.com/wp-content/uploads/2025/12/Guide-to-the-Labour-Codes.pdf) · [The 50% wage rule](https://ssrana.in/articles/understanding-the-50-wage-rule-under-the-code-on-wages-2019-a-cap-on-exclusions-not-a-ceiling-on-wages/)
- [Karnataka PT amendment 2025](https://lexplosion.in/karnataka-govt-notifies-revised-professional-tax-rate-under-karnataka-tax-on-profession-trades-callings-and-employments-amendment-act-2025/) · [Maharashtra PT amendment 2023](https://khaitanco.com/thought-leaderships/Maharashtra-Professional-Tax-Amendment-2023-Key-Takeaways) · [Chennai PT revision](https://ascent-hr.com/notification/professional-tax-slab-revision-chennai/)
- [Haryana LWF cap from 1 January 2026](https://www.sgcms.com/regulatory-updates/haryana-labour-welfare-board-revises-contribution-limits-effective-01-01-2026/) · [West Bengal LWF revision](https://www.zimyo.com/resources/insights/revised-contribution-rates-for-labour-welfare-fund-lwf-in-west-bengal/) · [State LWF overview](https://futurexsolutions.com/labour-welfare-fund-india-2026-state-wise-guide/)

## Exports

The CSV reports are **preparation data**. The EPF report follows the ECR column layout (EPF/EPS/EDLI wages,
shares, NCP days) but is not the portal's upload format. The bank file uses fictional account references and is
marked `DEMO ONLY`.

## What a live payroll service would still need

| Gate               | Evidence required                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Employer discovery | Signed salary structures, pay groups, active states, registrations, bank layout, approval matrix      |
| Rules              | Specialist sign-off on the interpretations above, plus minimum wages, gratuity and every active state |
| Calculation        | Component ledger, prior-month comparison, retro adjustments, immutable approved results               |
| Identity & privacy | SSO, MFA for approval/export, maker-checker, encryption of PAN/bank/UAN, access logs                  |
| Statutory outputs  | Portal-schema validation for ECR, ESI, Form 138 and state returns                                     |
| Payments           | Bank-specific upload template, dual control, exact reconciliation                                     |
| Operations         | Managed PostgreSQL, backups and restore drill, monitoring, incident runbook                           |
| Acceptance         | Two parallel payroll cycles reconciled against an existing system, employer sign-off                  |

As a safeguard, the API refuses to start with `NODE_ENV=production`.

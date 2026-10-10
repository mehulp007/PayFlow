# Compliance notes and production boundary

PayFlow is a portfolio project. It runs on **synthetic data only** and must not be used to pay real people,
produce statutory filings, or store real employee, salary, tax or bank details.

The calculation rules were **reviewed in October 2026** (rechecked on 10 October 2026, when West Bengal's new
professional tax schedule was added) against the regulations below. Rule version:
`IN-TY2026-27-v3+IN-STATES-2026-10b` (shown on every payroll line). Rules change by notification, so verify
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

### Old-regime declarations: Form 124 and the Income-tax Rules, 2026

Employees declare rent and savings to the employer on **Form 124** (it replaced Form 12BB from tax year 2026-27;
s. 392(5)(b) with rule 205). PayFlow uses the declaration for TDS only under the old regime, and HR marks it
verified once proofs are checked. Changing a declaration sends it back for verification.

| Deduction                | Rule applied                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| House rent allowance     | Least of HRA received, 50% of basic (40% outside the eight cities) and rent above 10% of basic. **Rule 279** adds Bengaluru, Hyderabad, Pune and Ahmedabad to the 50% list alongside Delhi, Mumbai, Kolkata and Chennai |
| Landlord PAN             | Required when rent is above ₹1,00,000 a year; the relationship with the landlord is asked for, as on Form 124                                                                                                           |
| Savings, s. 123 (ex-80C) | Schedule XV savings plus the employee's own PF, up to ₹1,50,000                                                                                                                                                         |
| Additional NPS, s. 124   | Up to ₹50,000 beyond s. 123                                                                                                                                                                                             |
| Health insurance, s. 126 | Self and family ₹25,000 (₹50,000 from age 60); parents ₹25,000 (₹50,000 if a parent is 60 or older)                                                                                                                     |
| Home loan interest       | Self-occupied home, up to ₹2,00,000                                                                                                                                                                                     |
| Professional tax         | Tax on employment actually deducted, up to ₹2,500 a year (Article 276)                                                                                                                                                  |
| New regime (s. 202)      | None of the above; only the ₹75,000 standard deduction                                                                                                                                                                  |

The regime calculator projects the year under both regimes with the same method as monthly TDS (salary paid so far,
then the regular salary to March) and recommends the cheaper one; the new regime is kept when they are equal.
Employees choose their regime while the month's run is a draft.

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

| State       | Professional tax                                                                                                                                                                   | Labour welfare fund (employee + employer)                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Karnataka   | ₹200/month from ₹25,000 gross; ₹300 in February (2025 amendment)                                                                                                                   | ₹50 + ₹100, December                                             |
| Maharashtra | Men: ₹175 (₹7,501–10,000), ₹200 above; women exempt up to ₹25,000; ₹300 in February                                                                                                | ₹25 + ₹75, June and December                                     |
| Tamil Nadu  | Greater Chennai Corporation half-yearly slab (₹180 to ₹1,250), deducted in September and March                                                                                     | ₹20 + ₹40, December                                              |
| West Bengal | From 1 Oct 2026 (Notification 1607-F.T.): nil to ₹20,000, ₹100 to ₹30,000, ₹140 to ₹50,000, ₹170 to ₹1,00,000, ₹208 above. Earlier months: ₹110 / ₹130 / ₹150 / ₹200 above ₹10,000 | ₹3 + ₹30, June and December                                      |
| Haryana     | Not levied                                                                                                                                                                         | 0.2% of wages up to ₹35 (from Jan 2026), employer twice, monthly |

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

### Wage slips: Code on Wages, 2019, s. 50(3)

Employers must give a wage slip, electronic or on paper, on or before paying wages. PayFlow makes payslips
available to employees as soon as Finance approves a run (always before the payment date), notifies employees with
an account, and offers each one as a PDF with earnings, deductions, employer contributions, statutory wages, days
paid and loss-of-pay days. Built-in PDF fonts have no rupee sign, so amounts are labelled INR.

### Leave: OSH Code, 2020, s. 32 (in force from 21 November 2025)

| Item                  | Rule applied                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Earned leave          | One day for every 20 days worked in the previous calendar year, for workers who worked 180 days or more in that year                 |
| Days worked           | Working days employed last year (Monday to Saturday); Sunday is the weekly rest day and is not counted in leave requests             |
| Carry forward         | Up to 30 days, recorded by HR per person and year                                                                                    |
| Sick and casual leave | 12 days a year, pro-rated by month for joiners. This is set by state shops and establishments rules, which differ                    |
| Leave without pay     | Approved days are added to the month's unpaid days and deducted as loss of pay; a calculated run goes back to draft when they change |
| Approved months       | Leave cannot be requested or approved for a month whose run is with Finance or approved                                              |
| Decisions             | HR decides any request; a manager with a PayFlow sign-in decides their direct reports'; nobody decides their own                     |

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
- The HRA exemption assumes rent for every month employed in the tax year; changes of address mid-year are not
  split. Declared amounts are taken at face value until HR verifies proofs.
- Leave encashment (including the s. 32 option to encash leave beyond the carry-forward limit), half days,
  holidays and state-specific leave rules are not modelled. Earned leave accrual uses days employed, not
  attendance records.
- Not yet modelled: perquisites, employer PF above ₹7.5L, gratuity accrual, minimum-wage checks, and the ESI
  disability ceiling (₹25,000).

## Sources

- [Form 124 replaces Form 12BB](https://taxguru.in/income-tax/income-tax-form-124-employee-statement-salary-declaration-tds-deduction.html) · [Section 123 (formerly 80C)](https://www.taxtmi.com/tmi_notes?id=1581) · [Old and new section mapping](https://taxgarden.in/blog/income-tax-act-2025-section-mapping-old-vs-new-india)
- [HRA 50% limit for eight cities under rule 279](https://taxguru.in/income-tax/hra-exemption-8-cities-qualify-50-percent-exemption-practical-guide.html) · [Income-tax Rules 2026 notified](https://www.caalley.com/news-updates/indian-news/new-tax-rules-notified-from-hra-to-company-car-to-meal-card-top-5-prominent-changes-which-will-impact-salaried-taxpayers)
- [Annual leave under the OSH Code](https://simpliance.in/blog/?p=915) · [Carry forward and encashment](https://www.outlookmoney.com/news/new-labour-codes-change-heres-how-you-earn-carry-and-encash-leave) · [OSH Central Rules 2026](https://trilegal.com/knowledge-repository/trilegal-update-labour-codes-move-closer-to-full-implementation-takeaways-from-the-newly-notified-central-rules/)
- [Wage slips under the Code on Wages](https://lexplosion.in/code-on-wages-2019-compliance-related-changes-state-rules-are-at-different-stages-of-finalisation/)

- [Code on Wages, 2019, s. 17: time limit for payment of wages](https://www.advocatekhoj.com/library/bareacts/codeonwages/17.php) · [Two-working-day final settlement](https://www.livelaw.in/articles/two-working-days-code-wages-employee-final-settlement-552780)
- [TDS on salary at the average rate under section 392](https://www.taxheal.com/tds-on-salary-under-section-392-of-income-tax-act.html)

- [Budget 2026-27 tax slabs (unchanged from 2025-26)](https://www.bankbazaar.com/tax/income-tax-slabs.html)
- [TDS on salary under section 392](https://www.taxheal.com/tds-on-salary-under-section-392-of-income-tax-act.html) · [Form 130 replaces Form 16](https://taxguru.in/income-tax/form-130-tds-certificate-salary-replacing-form-16.html)
- [EPFO FAQs: wage ceiling ₹25,000](https://www.sgcms.com/regulatory-updates/faqs-by-epfo-wage-ceiling-raised-to-25000/) · [September 2026 split calculation](https://www.caclubindia.com/articles/epf-wage-ceiling-increased-to-rs-25-000-from-rs-15-000-new-rules-from-17th-september-2026-56352.asp)
- [ESIC contribution rules](https://www.esic.gov.in/contribution) · [ESI ceiling unchanged at ₹21,000](https://www.indianhrm.com/payroll-compliance-updates/esi-ceiling-holds-21000)
- [Labour Codes in force from 21 November 2025](https://www.cyrilshroff.com/wp-content/uploads/2025/12/Guide-to-the-Labour-Codes.pdf) · [The 50% wage rule](https://ssrana.in/articles/understanding-the-50-wage-rule-under-the-code-on-wages-2019-a-cap-on-exclusions-not-a-ceiling-on-wages/)
- [Karnataka PT amendment 2025](https://lexplosion.in/karnataka-govt-notifies-revised-professional-tax-rate-under-karnataka-tax-on-profession-trades-callings-and-employments-amendment-act-2025/) · [Maharashtra PT amendment 2023](https://khaitanco.com/thought-leaderships/Maharashtra-Professional-Tax-Amendment-2023-Key-Takeaways) · [Chennai PT revision](https://ascent-hr.com/notification/professional-tax-slab-revision-chennai/)
- [West Bengal PT schedule 2026 (1407-F.T.)](https://wbxpress.com/schedule-rates-tax-professions-trades-callings-employments-2026/) · [Effective 1 October 2026](https://unitedconsultancy.com/revision-of-west-bengal-professional-tax-rates-effective-from-01st-october-2026/) · [Final notification 1607-F.T.](https://www.dcpsol.com/west-bengal-professional-tax-slabs-revised-2026-notification-1607-ft)
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

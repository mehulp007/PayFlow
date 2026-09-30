# Live service readiness — 28 September 2026

## Intended product

One public link where **any organization can register**. Each organization creates its own users, employee hierarchy, pay groups, payroll periods and settings. Its administrators invite HR, payroll, finance, auditors and employees. One organization's data must never be visible to another. Contractor records remain directory and attendance only until contractor payroll is explicitly built.

The live service must start empty. Fictional employees, example accounts, sample payroll runs and demonstration exports belong only in a **separate public demo environment** or local development. The demo and live service must have different hostnames, data stores, account stores and deployment settings. The demo can use the current prototype; the live service needs a new production-safe data model.

## Audit result

**Not ready for public use with real employees or payroll.** The current code is a working, single-organization prototype. Its type checks, three calculation unit tests and web/API build pass, but those checks do not verify live payroll or organization isolation.

| Requirement | Current code | Live release change |
|---|---|---|
| Public organization sign-up | No sign-up; one hard-coded Aster Group | Create an organization and its first admin through a verified, abuse-protected onboarding flow |
| Isolated organization data | No `organization_id` on employees, users, runs, inputs, results or audit events | Tenant keys, scoped queries, database constraints and cross-organization access tests |
| Individual access | Usernames and passwords exist, but six demo accounts are automatically created | No demo identities; organization-scoped accounts, verified recovery, MFA for approval/export, durable rate limiting and session controls |
| Employee hierarchy | Filtering and addition work in the prototype | Organization-owned hierarchy, position catalog, manager validation and employee lifecycle |
| Payroll periods | One hard-coded September 2026 run | Create, calculate, approve, correct and close arbitrary pay periods per organization and pay group |
| India payroll rules | Starter 2026–27 calculation and placeholder state deductions | Reviewed, effective-dated rule packs and full tested tax/statutory treatment by active state |
| Payments and filings | Fictional bank CSV and preparation reports | Bank-specific validated file, reconciliation and approved statutory output formats |
| Persistence | Local PGlite seeds 8,420 people; the public Render showcase uses Free PostgreSQL with 240 synthetic people | Paid managed PostgreSQL, migrations, backups, restore drill and encrypted sensitive fields |
| Deployment | API refuses `NODE_ENV=production` by design | Remove this safeguard only after all release gates are met |
| Android | Expo client points to local API unless configured | Tenant-aware production client, secure token storage, API configuration and release builds |

Code evidence: `apps/api/src/server.ts`, `apps/api/src/db.ts`, `apps/api/src/auth.ts`, `apps/web/src/PayrollPage.tsx`, `apps/mobile/App.tsx`, `packages/core/src/payroll.ts` and `docs/production-gates.md`.

## Hosting decision

The recommended live target is to keep the **payroll API and database in India**, consistent with the original product plan. A static web frontend may be delivered globally only after its data flows, logs and third-party services are reviewed. This is a product and trust recommendation, not a claim that every Indian payroll system is legally required to use India-only servers.

- **Render + Vercel:** Vercel can serve the web frontend; Render can run a Node API. Render currently has no India compute region (Singapore is closest). This combination is viable only if the product accepts processing payroll outside India. Render's free web instances sleep and lose local files, while free Render PostgreSQL expires after 30 days. Neither is an appropriate live payroll datastore. [Render regions](https://render.com/docs/regions), [Render free limits](https://render.com/docs/free).
- **Vercel plan:** Vercel Hobby is restricted to personal, non-commercial use. A business payroll service needs a suitable paid plan or another frontend host. Vercel's Pro billing FAQ says credit/debit card only, so the current no-card constraint blocks self-service Pro. [Hobby plan](https://vercel.com/docs/plans/hobby), [Pro billing](https://vercel.com/docs/plans/pro-plan/billing).
- **India-hosted alternative:** An India-region API and PostgreSQL service could meet the recommended data-location target. Supabase lists Mumbai for its database, but its free project is limited and may pause; paid Supabase normally takes a credit card. An India VPS provider that accepts UPI is a possible card-free route, subject to security, backup, support and provider review. [Supabase regions](https://supabase.com/docs/guides/platform/regions), [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase).

There is no safe **free forever** combination of Render, Vercel and a durable database for a public, multi-organization payroll service. The current demo **can** be published as a separate, clearly labeled showcase. Do not publish it as the live site or enter real employee details into it.

### Public demo deployment

The [Payroll Studio Demo](https://payroll-studio-demo.onrender.com) is deployed from the private `mehulp007/bharat-payroll-demo` repository. `render.yaml` provisions a Free Render web service and a separate Free Render PostgreSQL database in Singapore. The public sign-in screen gives one-click access to five sample roles and 240 fictional people. HR can reset the shared sample run from Settings. All visitors share the same database, so one visitor's changes affect others. Render Free may sleep and take time to wake. The database expires on **28 October 2026**; the link will stop working unless the sample database is replaced or upgraded. The demo remains separate from any live payroll data, and no real employee details should be entered.

## Build sequence

1. **Separate the prototype from the live service.** Create a clean production schema and migrations. Do not seed people, credentials or payroll runs. Keep the demo only for local evaluation.
2. **Build organization onboarding and isolation.** Verified sign-up, first admin, organization settings, organization-scoped user invitations, tenant keys on every business table and automated cross-tenant tests.
3. **Build employee and hierarchy workflows.** Add, filter, edit, activate/deactivate and import employees for the signed-in organization; preserve effective-dated work and pay history. Contractors remain outside employee payroll.
4. **Build real payroll periods and controls.** Configurable pay groups and dates, spreadsheet validation, immutable calculations, maker-checker, approvals, corrections and audit trails.
5. **Complete India payroll and output validation.** Obtain signed employer policies and specialist-reviewed statutory rule cases, bank template, reports, payment result reconciliation and parallel-cycle evidence.
6. **Harden and launch.** MFA, field encryption, recovery, logs, monitoring, backup/restore, load test, security review, Android build and release checklist. Choose a supported paid host and database before importing real records.

The first deployable milestone is **public sign-up plus isolated organization and employee records**, with payroll calculations disabled until their release gates pass. It can be shared for real account setup only after identity, isolation, privacy and operational checks pass.

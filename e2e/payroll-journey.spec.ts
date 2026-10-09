import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'E2E-Password-2026!';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(username);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function openOctoberRun(page: Page) {
  await page.getByRole('link', { name: 'Payroll Runs' }).click();
  await page.getByRole('row', { name: /October 2026/ }).click();
  await expect(page.getByRole('heading', { name: 'October 2026 payroll' })).toBeVisible();
}

/** Verifies every visible missing-bank exception, recalculating until none remain. */
async function clearBankExceptions(page: Page) {
  const panel = page.locator('.attention-panel');
  const metrics = page.locator('.attention-metrics');
  for (let round = 0; round < 5; round++) {
    const blocking = Number((await metrics.textContent())?.match(/(\d+) blocking/)?.[1] ?? 0);
    if (!blocking) return;
    // The panel lists a few exceptions at a time and refreshes only after recalculation.
    const verify = panel.getByRole('button', { name: 'Verify demo bank details' });
    const pending = await verify.count();
    for (let index = 0; index < pending; index++) {
      await verify.nth(index).click();
      await expect(page.locator('.toast')).toContainText('Synthetic bank verification added');
    }
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Payroll calculated');
    // Wait for the refreshed totals before reading the next round.
    await expect(metrics).toContainText(`${blocking - pending} blocking`);
  }
}

/** Each run of the journey starts from the freshly generated Aster Group sample. */
test.beforeEach(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } });
  const { token } = await login.json();
  const reset = await request.post('/api/organization/reset-sample', { headers: { authorization: `Bearer ${token}` } });
  expect(reset.status()).toBe(200);
});

test('prepare, send back, approve, pay and close a run across roles', async ({ page }) => {
  await signIn(page, 'hr');
  await expect(page.getByRole('heading', { name: 'Good morning, payroll team' })).toBeVisible();

  // HR prepares October: twelve new joiners have no bank details yet.
  await page.getByRole('button', { name: 'Open payroll run' }).click();
  await expect(page.getByRole('heading', { name: 'October 2026 payroll' })).toBeVisible();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.attention-metrics')).toContainText('12 blocking');

  // Each line explains its calculation and the rule pack used.
  await page.locator('tbody tr').first().click();
  await expect(page.locator('.calculation-meta')).toContainText('Rule IN-TY2026-27-v3');
  await page.keyboard.press('Escape');

  await clearBankExceptions(page);
  await expect(page.locator('.attention-metrics')).toContainText('0 blocking');
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('approval pending');
  await signOut(page);

  // Finance sends it back with a note; payroll resubmits.
  await signIn(page, 'finance');
  await openOctoberRun(page);
  await page.getByRole('button', { name: 'Send back with a note' }).click();
  await page.getByPlaceholder('e.g. Recheck the October bonus file').fill('Please confirm the new joiners');
  await page.getByRole('button', { name: 'Send back', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Please confirm the new joiners');
  await signOut(page);

  await signIn(page, 'payroll');
  await openOctoberRun(page);
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('approval pending');
  await signOut(page);

  // Finance approves, records payment and closes the period.
  await signIn(page, 'finance');
  await openOctoberRun(page);
  await page.getByRole('button', { name: 'Approve payroll' }).click();
  await page.getByPlaceholder('Optional note for the approval record').fill('Totals checked in end-to-end test');
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('approved');
  await page.getByRole('button', { name: 'Simulate reconciliation' }).click();
  await page.getByRole('button', { name: 'Close period' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('closed');
  await page.getByRole('button', { name: 'Audit trail' }).click();
  await expect(page.locator('.audit-list')).toContainText('payroll · sent_back');
  await page.keyboard.press('Escape');
  await signOut(page);

  // The employee sees only their own record and payslip.
  await signIn(page, 'employee');
  await expect(page).toHaveURL(/\/me$/);
  await page.getByRole('button', { name: 'View my payslip' }).click();
  await expect(page.locator('.overview-banner')).toContainText('Net pay ₹');
  await page.goto('/payroll');
  await expect(page).toHaveURL(/\/me$/);
});

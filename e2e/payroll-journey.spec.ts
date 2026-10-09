import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'E2E-Password-2026!';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Your username').fill(username);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Verifies every visible missing-bank exception, recalculating until none remain. */
async function clearBankExceptions(page: Page) {
  const panel = page.locator('.attention-panel');
  for (let round = 0; round < 5; round++) {
    const verify = panel.getByRole('button', { name: 'Verify demo bank details' });
    const pending = await verify.count();
    if (!pending) return;
    // The exception list refreshes only after recalculation, so verify each visible person in turn.
    for (let index = 0; index < pending; index++) {
      await verify.nth(index).click();
      await expect(page.locator('.toast')).toContainText('Synthetic bank verification added');
    }
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Payroll calculated');
  }
}

test('prepare, approve and pay a payroll run across roles', async ({ page }) => {
  await signIn(page, 'hr');
  await expect(page.getByRole('heading', { name: 'Good morning, payroll team' })).toBeVisible();

  // HR prepares the run.
  await page.getByRole('button', { name: 'Open payroll run' }).click();
  await expect(page).toHaveURL(/\/payroll/);
  await expect(page.getByRole('heading', { name: 'September 2026 payroll' })).toBeVisible();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.attention-metrics')).toContainText('12 blocking');
  await expect(page.locator('tbody tr').first()).toContainText('Blocking');

  // Each line explains its calculation, including the September 2026 EPF ceiling split.
  await page.locator('tbody tr').first().click();
  await expect(page.locator('.calculation-meta')).toContainText('EPF wage ceiling split for September 2026');
  await page.keyboard.press('Escape');

  await clearBankExceptions(page);
  await expect(page.locator('.attention-metrics')).toContainText('0 blocking');
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('approval pending');
  await signOut(page);

  // Finance approves and reconciles; HR could not.
  await signIn(page, 'finance');
  await page.getByRole('link', { name: 'Payroll Runs' }).click();
  await page.getByRole('button', { name: 'Approve payroll' }).click();
  await page.getByPlaceholder('Optional note for the approval record').fill('Totals checked in end-to-end test');
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('approved');
  await page.getByRole('button', { name: 'Simulate reconciliation' }).click();
  await expect(page.locator('.approved-box')).toContainText('Demo payroll reconciled');

  await page.getByRole('button', { name: 'Audit trail' }).click();
  await expect(page.locator('.audit-list')).toContainText('payroll · approved');
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

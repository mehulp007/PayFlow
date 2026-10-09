import { expect, test } from '@playwright/test';

test('sign up with a sample company and explore it in every role', async ({ page }) => {
  const email = `owner.${Date.now()}@neem.example`;
  await page.goto('/login');
  await page.getByRole('link', { name: 'Explore a sample company' }).click();

  // Step 1: organization and branches.
  await page.getByPlaceholder('e.g. Neem Foods Pvt Ltd').fill('Neem Foods');
  await page.getByRole('button', { name: 'Add branch' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: the first admin.
  await page.getByLabel('Your name').fill('Asha Rao');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Neem-Foods-2026!');
  await page.getByLabel('Confirm password').fill('Neem-Foods-2026!');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: a sample company with six months of approved payroll.
  await expect(page.getByRole('radio', { name: /Load a sample company/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.locator('.org-switch')).toContainText('Neem Foods');
  await expect(page.locator('.org-switch')).toContainText('2 branches');

  // History: April–September closed, October open.
  await page.getByRole('link', { name: 'Payroll Runs' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await page.getByRole('row', { name: /September 2026/ }).click();
  await expect(page.locator('.page-heading .pill')).toHaveText('closed');

  // "View as" switches to the sample's built-in Finance account.
  await page.getByLabel('View as role').selectOption('finance-approver');
  await expect(page.locator('.signed-in-label')).toContainText('Finance Approver');

  // And to the employee, who sees six approved payslips' worth of history behind "View my payslip".
  await page.getByLabel('View as role').selectOption('employee');
  await expect(page).toHaveURL(/\/me$/);
  await page.getByRole('button', { name: 'View my payslip' }).click();
  await expect(page.locator('.overview-banner')).toContainText('September pay');

  // Payslip history with PDF downloads, and the regime comparison.
  await page.getByRole('link', { name: 'Payslips' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download September 2026 payslip' }).click();
  expect((await download).suggestedFilename()).toBe('payslip-2026-09-EMP00001.pdf');
  await page.getByRole('link', { name: 'Tax & declarations' }).click();
  await expect(page.locator('.regime-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Declaration (Form 124)' })).toBeVisible();
});

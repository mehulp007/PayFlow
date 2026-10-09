import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'E2E-Password-2026!';

async function signIn(page: Page, username: string) {
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(username);
  await page.getByPlaceholder('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.beforeEach(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } });
  const { token } = await login.json();
  const reset = await request.post('/api/organization/reset-sample', { headers: { authorization: `Bearer ${token}` } });
  expect(reset.status()).toBe(200);
});

test('unpaid leave flows from the employee to HR, the notification bell and the pay run', async ({ page }) => {
  // The employee asks for two days without pay.
  await signIn(page, 'employee');
  await page.getByRole('link', { name: 'Leave' }).click();
  await page.getByLabel('Leave type').selectOption('unpaid');
  await page.getByLabel('From', { exact: true }).fill('2026-10-26');
  await page.getByLabel('To', { exact: true }).fill('2026-10-27');
  await page.getByRole('button', { name: 'Request 2 days' }).click();
  await expect(page.locator('.toast')).toContainText('Leave requested for 2 days');
  await expect(page.locator('.leave-table')).toContainText('pending');
  await signOut(page);

  // HR is notified, opens the request from the bell and approves it.
  await signIn(page, 'hr');
  await expect(page.locator('.bell-count')).toBeVisible();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await page.locator('.notifications li').filter({ hasText: 'Aarav Kumar requested 2 days' }).click();
  await expect(page).toHaveURL(/\/leave$/);
  const row = page.getByRole('row').filter({ hasText: 'Aarav Kumar' }).filter({ hasText: 'Leave without pay' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.toast')).toContainText('Leave approved');

  // Ctrl K finds the person; the calculated run deducts the two days.
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search people/).fill('Aarav');
  await expect(page.locator('[cmdk-item]').first()).toContainText('Aarav Kumar');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Aarav Kumar' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Payroll Runs' }).click();
  await page.getByRole('row', { name: /October 2026/ }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Payroll calculated');
  await page.getByPlaceholder('Search name, ID or branch').fill('EMP00001');
  await page.getByRole('row').filter({ hasText: 'EMP00001' }).click();
  await expect(page.getByRole('dialog')).toContainText('Includes 2 days of approved leave without pay');
  await page.keyboard.press('Escape');

  // Dark mode swaps the theme tokens.
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await signOut(page);

  // The employee hears back.
  await signIn(page, 'employee');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.locator('.notifications')).toContainText('Your leave from 2026-10-26 was approved');
});

test('the audit log filters by area and person', async ({ page }) => {
  await signIn(page, 'auditor');
  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByLabel('Area').selectOption('auth');
  await expect(page.locator('.audit-table tbody tr').first()).toContainText('Sign-in');
  await page.getByLabel('Person').selectOption('auditor');
  await expect(page.locator('.audit-table tbody tr').first()).toContainText('auditor');
});

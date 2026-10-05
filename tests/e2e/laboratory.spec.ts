import { expect, test } from '@playwright/test';
test.beforeEach(async ({ request }) => {
  const reset = await request.post('/api/admin/scenarios', {
    headers: { Authorization: 'Bearer e2e-isolated-admin-token-for-tests' },
    data: { originUnavailable: false, purgeUnavailable: false },
  });
  expect(reset.ok()).toBe(true);
});
test('read, revalidate, edit, and recover from origin failure', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The caching laboratory.' })).toBeVisible();
  await page.getByLabel('Request mode').selectOption('validator');
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Laptop', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.getByText('304 · reused data', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Laptop', exact: true })).toBeVisible();
  await page.getByLabel('Admin token').fill('e2e-isolated-admin-token-for-tests');
  await page.getByLabel('New price').fill('1575');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByText('$1,575', { exact: true })).toBeVisible();
  await expect(page.getByText('CDN: simulated · embedded-postgresql', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate origin failure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore origin', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.locator('.notice.error')).toContainText('Simulated origin failure');
  await page.getByRole('button', { name: 'Restore origin', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Simulate origin failure', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.locator('.notice.error')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/laboratory-desktop.png', fullPage: true });
});

test('mobile layout remains usable and private reads are not stored', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Request mode').selectOption('private');
  const response = page.waitForResponse(res => res.url().endsWith('/api/products') && res.request().method() === 'GET');
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  expect((await response).headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: 'Laptop', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/laboratory-mobile.png', fullPage: true });
});

test('native browser cache merges an origin 304 without another body read', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Laptop', exact: true })).toBeVisible();
  const snapshot = async () => (await (await request.get('/api/admin/status', {
    headers: { Authorization: 'Bearer e2e-isolated-admin-token-for-tests' },
  })).json()).metrics;
  const before = await snapshot();
  await page.getByRole('button', { name: 'Load catalog', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: '/api/products' })).toHaveCount(2);
  const after = await snapshot();
  expect(after.bodyReads).toBe(before.bodyReads);
  expect(after.notModified).toBe(before.notModified + 1);
  await expect(page.getByRole('heading', { name: 'Laptop', exact: true })).toBeVisible();
});

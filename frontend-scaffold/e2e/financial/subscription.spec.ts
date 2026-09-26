import { test, expect } from '@playwright/test';
import { injectFreighterConnected, injectFreighterNotConnected } from '../mocks/freighter';

const TEST_PUBLIC_KEY = 'GBVKN6YMDXP4FKXB26BWZJHXPGQPZLWXHKJM5YXJKTZRQPLTKLPXNQK';

test.describe('Subscription Lifecycle', () => {
  test('create subscription successfully', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');
    await expect(page.getByRole('heading', { name: /subscription|recurring/i })).toBeVisible({ timeout: 10000 });
    const createButton = page.getByRole('button', { name: /new|create.*subscription|set up/i });
    if (await createButton.isVisible()) { await createButton.click(); }
    await expect(page.getByText(/amount|creator|frequency/i)).toBeVisible({ timeout: 10000 });
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { id: 'sub-789', status: 'active' } }) }); });
    await page.getByRole('button', { name: /subscribe|confirm|save/i }).first().click();
    await expect(page.getByText(/success|created|subscribed/i)).toBeVisible({ timeout: 10000 });
  });
  test('cancel subscription succeeds', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');
    await expect(page.getByRole('heading', { name: /subscription|recurring/i })).toBeVisible({ timeout: 10000 });
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    if (await cancelButton.isVisible()) { await cancelButton.click(); }
    await expect(page.getByText(/cancel|confirm|are you sure/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /confirm.*cancel|yes.*cancel|cancel.*yes/i }).first().click();
    await expect(page.getByText(/cancelled|success|removed/i)).toBeVisible({ timeout: 10000 });
  });
  test('cancel subscription is denied', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Cannot cancel' }) }); });
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    if (await cancelButton.isVisible()) { await cancelButton.click(); }
    await page.getByRole('button', { name: /confirm.*cancel|yes.*cancel/i }).first().click();
    await expect(page.getByText(/failed|cannot|cannot be cancelled/i)).toBeVisible({ timeout: 10000 });
  });
  test('subscription next due date is displayed', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');
    await expect(page.getByText(/next payment|due|next due/i)).toBeVisible({ timeout: 10000 });
  });
  test('no active subscriptions message appears when empty', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');
    await expect(page.getByText(/no active|no subscriptions|none/i)).toBeVisible({ timeout: 10000 });
  });
});

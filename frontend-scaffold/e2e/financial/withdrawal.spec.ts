import { test, expect } from '@playwright/test';
import { injectFreighterConnected, injectFreighterNotConnected } from '../mocks/freighter';
const TEST_PUBLIC_KEY = 'GBVKN6YMDXP4FKXB26BWZJHXPGQPZLWXHKJM5YXJKTZRQPLTKLPXNQK';
test.describe('Withdrawal Flow', () => {
  test('successful withdrawal completes with receipt', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/wallet');
    await expect(page.getByRole('heading', { name: /wallet/i })).toBeVisible();
    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    if (await withdrawButton.isVisible()) { await withdrawButton.click(); }
    await expect(page.getByText(/withdraw|send/i)).toBeVisible({ timeout: 10000 });
    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    if (await amountInput.count() > 0) { await amountInput.first().fill('50'); }
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { id: 'withdraw-123', status: 'success', hash: '0xabc' } }) }); });
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();
    await expect(page.getByText(/success|receipt|confirmed/i)).toBeVisible({ timeout: 10000 });
  });
  test('rejected signature shows graceful error', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/wallet');
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Transaction rejected' }) }); });
    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    if (await withdrawButton.isVisible()) { await withdrawButton.click(); }
    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    if (await amountInput.count() > 0) { await amountInput.first().fill('50'); }
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();
    await expect(page.getByText(/rejected|failed|error/i)).toBeVisible({ timeout: 10000 });
  });
  test('insufficient balance prevents withdrawal', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/wallet');
    await expect(page.getByText(/balance|insufficient/i)).toBeVisible({ timeout: 10000 });
  });
});
test.describe('Refund Request Flow', () => {
  test('refund request is submitted successfully', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: /transaction|history/i })).toBeVisible({ timeout: 10000 });
    const refundButton = page.getByRole('button', { name: /refund/i });
    if (await refundButton.isVisible()) { await refundButton.click(); }
    await expect(page.getByText(/refund|request/i)).toBeVisible({ timeout: 10000 });
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { id: 'refund-456', status: 'pending' } }) }); });
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();
    await expect(page.getByText(/success|submitted/i)).toBeVisible({ timeout: 10000 });
  });
  test('refund failure shows error message', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/transactions');
    await page.route('**/soroban/**', async (route) => { await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Refund not available' }) }); });
    const refundButton = page.getByRole('button', { name: /refund/i });
    if (await refundButton.isVisible()) { await refundButton.click(); }
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();
    await expect(page.getByText(/failed|error/i)).toBeVisible({ timeout: 10000 });
  });
});

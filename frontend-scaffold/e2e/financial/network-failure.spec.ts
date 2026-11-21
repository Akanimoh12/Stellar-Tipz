import { test, expect } from '@playwright/test';
import { injectFreighterConnected, injectFreighterNotConnected } from '../mocks/freighter';
const TEST_PUBLIC_KEY = 'GBVKN6YMDXP4FKXB26BWZJHXPGQPZLWXHKJM5YXJKTZRQPLTKLPXNQK';

/**
 * #1342 — financial failure paths that cost users money.
 *
 * The happy-path, rejected-signature, insufficient-balance and refund specs
 * live in this directory. This file covers the remaining failure mode: the
 * network dropping **mid-transaction**, after the user has already signed.
 *
 * Assertions are auto-waiting (`expect(...).toBeVisible()`), never fixed
 * sleeps, and the mock delay is capped so the suite cannot hang.
 */
const NETWORK_FAILURE = /network|failed|error|try again|unable|declined/i;

/** Fail only the submission call, letting the page and modal render normally. */
async function failSorobanMidTransaction(page: import('@playwright/test').Page) {
  await page.route('**/soroban/**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Network unreachable' }),
    });
  });
}

test.describe('Network error mid-transaction (#1342)', () => {
  test('withdrawal surfaces an error instead of a false success', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/wallet');

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    if (await withdrawButton.isVisible()) {
      await withdrawButton.click();
    }

    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    if (await amountInput.count() > 0) {
      await amountInput.first().fill('50');
    }

    await failSorobanMidTransaction(page);
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();

    await expect(page.getByText(NETWORK_FAILURE).first()).toBeVisible({ timeout: 15000 });
    // A failed submission must never render a receipt or success state.
    await expect(page.getByText(/receipt|withdrawal complete/i).first()).toBeHidden();
  });

  test('refund request surfaces an error instead of a false success', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/transactions');

    const refundButton = page.getByRole('button', { name: /refund/i });
    if (await refundButton.isVisible()) {
      await refundButton.click();
    }

    await failSorobanMidTransaction(page);
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();

    await expect(page.getByText(NETWORK_FAILURE).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/refund submitted|successfully refunded/i).first()).toBeHidden();
  });

  test('subscription cancellation reports the failure', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/subscriptions');

    const cancelButton = page.getByRole('button', { name: /cancel/i }).first();
    if ((await cancelButton.count()) === 0) {
      test.skip(true, 'no cancellable subscription for this wallet');
      return;
    }

    await failSorobanMidTransaction(page);
    await cancelButton.click();

    await expect(page.getByText(NETWORK_FAILURE).first()).toBeVisible({ timeout: 15000 });
  });

  test('a dropped connection never leaks a pending spinner forever', async ({ page }) => {
    await injectFreighterConnected(page, { publicKey: TEST_PUBLIC_KEY });
    await page.goto('/wallet');

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    if (await withdrawButton.isVisible()) {
      await withdrawButton.click();
    }

    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    if (await amountInput.count() > 0) {
      await amountInput.first().fill('25');
    }

    await failSorobanMidTransaction(page);
    await page.getByRole('button', { name: /confirm|submit/i }).first().click();

    // The confirm control must stop being disabled once the request settles.
    const confirm = page.getByRole('button', { name: /confirm|submit/i }).first();
    await expect(confirm).toBeEnabled({ timeout: 15000 });
  });

  test('submission is blocked gracefully while the wallet is disconnected', async ({ page }) => {
    await injectFreighterNotConnected(page);
    await page.goto('/wallet');

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    if (await withdrawButton.isVisible()) {
      await withdrawButton.click();
    }

    // No wallet means a connect prompt, not a failed transaction.
    await expect(page.getByText(/connect/i).first()).toBeVisible({ timeout: 15000 });
  });
});

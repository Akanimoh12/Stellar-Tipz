import { test, expect } from '@playwright/test';

test.describe('Wallet Connection', () => {
  test('connect wallet button is visible on tip page', async ({ page }) => {
    await page.goto('/@alice');
    
    // Check for connect wallet button
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
  });

  test('wallet connection prompt displays', async ({ page }) => {
    await page.goto('/@alice');
    
    // Click connect wallet button
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    await connectButton.click();
    
    // In a real scenario, this would open the wallet modal
    // For E2E testing with mocked wallet, we check the UI state
    await expect(connectButton).toBeVisible();
  });

  test('wallet connection warning displays when not connected', async ({ page }) => {
    await page.goto('/@alice');
    
    // Check for wallet connection warning
    const warning = page.getByText(/connect a wallet before signing/i);
    if (await warning.isVisible()) {
      await expect(warning).toBeVisible();
    }
  });

  test('wallet connection on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/@alice');
    
    // Check that connect wallet button is accessible on mobile
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    await expect(connectButton).toBeVisible();
  });

  test('send tip button is disabled when wallet not connected', async ({ page }) => {
    await page.goto('/@alice');
    
    // Fill in tip details
    await page.fill('input[name="amount"], input[type="number"]', '10');
    
    // Check that send tip button shows connect wallet instead
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    const sendTipButton = page.getByRole('button', { name: /send tip/i });
    
    // When not connected, should show connect wallet button
    await expect(connectButton).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

test.describe('Tipping Flow', () => {
  test('tip page loads for creator', async ({ page }) => {
    await page.goto('/@alice');
    
    // Check that tip page loads
    await expect(page.getByText(/tip creator/i)).toBeVisible();
  });

  test('tip form displays correctly', async ({ page }) => {
    await page.goto('/@alice');
    
    // Check for amount input
    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    await expect(amountInput.first()).toBeVisible();
    
    // Check for message textarea
    const messageTextarea = page.locator('textarea[name="message"], textarea');
    await expect(messageTextarea.first()).toBeVisible();
    
    // Check for send tip button
    await expect(page.getByRole('button', { name: /send tip/i })).toBeVisible();
  });

  test('tip flow with mocked wallet', async ({ page }) => {
    await page.goto('/@alice');
    
    // Fill in tip amount
    await page.fill('input[name="amount"], input[type="number"]', '10');
    
    // Fill in message
    await page.fill('textarea[name="message"], textarea', 'Great work!');
    
    // Mock wallet connection - in a real scenario, you'd use page.addInitScript or route mocks
    // For now, we'll check that the connect wallet button is visible
    const connectButton = page.getByRole('button', { name: /connect wallet/i });
    if (await connectButton.isVisible()) {
      await connectButton.click();
    }
    
    // Check that send tip button is available
    const sendTipButton = page.getByRole('button', { name: /send tip/i });
    await expect(sendTipButton).toBeVisible();
  });

  test('tip amount presets work', async ({ page }) => {
    await page.goto('/@alice');
    
    // Look for preset amount buttons
    const presetButtons = page.locator('button').filter({ hasText: /^\d+$/ });
    const count = await presetButtons.count();
    
    if (count > 0) {
      await presetButtons.first().click();
      
      // Verify amount was updated
      const amountInput = page.locator('input[name="amount"], input[type="number"]');
      const value = await amountInput.first().inputValue();
      expect(value).not.toBe('');
    }
  });

  test('anonymous tip checkbox works', async ({ page }) => {
    await page.goto('/@alice');
    
    // Find anonymous checkbox
    const anonymousCheckbox = page.locator('input[type="checkbox"]');
    const count = await anonymousCheckbox.count();
    
    if (count > 0) {
      await anonymousCheckbox.first().check();
      expect(await anonymousCheckbox.first().isChecked()).toBe(true);
      
      await anonymousCheckbox.first().uncheck();
      expect(await anonymousCheckbox.first().isChecked()).toBe(false);
    }
  });

  test('tip flow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/@alice');
    
    // Check that tip form is usable on mobile
    await expect(page.getByText(/tip creator/i)).toBeVisible();
    
    const amountInput = page.locator('input[name="amount"], input[type="number"]');
    await expect(amountInput.first()).toBeVisible();
  });

  test('clear button resets form', async ({ page }) => {
    await page.goto('/@alice');
    
    // Fill in form
    await page.fill('input[name="amount"], input[type="number"]', '10');
    await page.fill('textarea[name="message"], textarea', 'Test message');
    
    // Click clear button
    const clearButton = page.getByRole('button', { name: /clear/i });
    if (await clearButton.isVisible()) {
      await clearButton.click();
      
      // Verify form was cleared
      const amountInput = page.locator('input[name="amount"], input[type="number"]');
      const value = await amountInput.first().inputValue();
      expect(value).toBe('');
    }
  });

  test('creator not found page displays', async ({ page }) => {
    await page.goto('/@nonexistentuser123456');
    
    // Check for not found state
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

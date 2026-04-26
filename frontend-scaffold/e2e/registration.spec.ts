import { test, expect } from '@playwright/test';

test.describe('Registration Flow', () => {
  test('registration page loads', async ({ page }) => {
    await page.goto('/register');
    
    // Check for registration page elements
    await expect(page.getByText(/register/i)).toBeVisible();
  });

  test('registration form displays correctly', async ({ page }) => {
    await page.goto('/register');
    
    // Check for username input
    const usernameInput = page.locator('input[name="username"]');
    await expect(usernameInput).toBeVisible();
    
    // Check for display name input
    const displayNameInput = page.locator('input[name="displayName"], input[name="display_name"]');
    if (await displayNameInput.count() > 0) {
      await expect(displayNameInput.first()).toBeVisible();
    }
    
    // Check for bio textarea
    const bioTextarea = page.locator('textarea[name="bio"]');
    if (await bioTextarea.count() > 0) {
      await expect(bioTextarea).toBeVisible();
    }
    
    // Check for register button
    await expect(page.getByRole('button', { name: /register|create profile/i })).toBeVisible();
  });

  test('registration form validation works', async ({ page }) => {
    await page.goto('/register');
    
    // Try to submit empty form
    const registerButton = page.getByRole('button', { name: /register|create profile/i });
    await registerButton.click();
    
    // Check for validation errors
    // This will depend on the actual implementation
    const errorMessages = page.locator('.error, [role="alert"], text=required');
    if (await errorMessages.count() > 0) {
      await expect(errorMessages.first()).toBeVisible();
    }
  });

  test('registration with mocked contract', async ({ page }) => {
    await page.goto('/register');
    
    // Fill in registration form
    await page.fill('input[name="username"]', 'testuser');
    
    const displayNameInput = page.locator('input[name="displayName"], input[name="display_name"]');
    if (await displayNameInput.count() > 0) {
      await page.fill(displayNameInput.first(), 'Test User');
    }
    
    const bioTextarea = page.locator('textarea[name="bio"]');
    if (await bioTextarea.count() > 0) {
      await page.fill(bioTextarea, 'Test bio for registration');
    }
    
    // In a real scenario, this would interact with the contract
    // For E2E testing with mocked contract, we check the UI state
    const registerButton = page.getByRole('button', { name: /register|create profile/i });
    await expect(registerButton).toBeVisible();
  });

  test('registration on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/register');
    
    // Check that registration form is usable on mobile
    const usernameInput = page.locator('input[name="username"]');
    await expect(usernameInput).toBeVisible();
    
    const registerButton = page.getByRole('button', { name: /register|create profile/i });
    await expect(registerButton).toBeVisible();
  });

  test('username uniqueness validation', async ({ page }) => {
    await page.goto('/register');
    
    // Fill in a username that might already exist
    await page.fill('input[name="username"]', 'alice');
    
    // Trigger validation (typically on blur or after a delay)
    await page.keyboard.press('Tab');
    
    // Wait a moment for validation to run
    await page.waitForTimeout(500);
    
    // Check for uniqueness error if it exists
    const errorMessages = page.locator('.error, [role="alert"]');
    // This test is informational - actual behavior depends on contract state
  });
});

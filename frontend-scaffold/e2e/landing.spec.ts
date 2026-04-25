import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('landing page loads successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check for Stellar Tipz branding
    await expect(page.getByText(/stellar tipz/i)).toBeVisible();
    
    // Check for key sections
    await expect(page.getByText(/get started/i)).toBeVisible();
  });

  test('all landing page sections are visible', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check Hero section
    await expect(page.locator('h1')).toBeVisible();
    
    // Check Features section
    await expect(page.getByText(/features/i)).toBeVisible();
    
    // Check How It Works section
    const howItWorksSection = page.locator('#how-it-works');
    await expect(howItWorksSection).toBeVisible();
    
    // Check Stats section
    await expect(page.getByText(/stats/i)).toBeVisible();
    
    // Check CTA section
    await expect(page.getByText(/start tipping/i)).toBeVisible();
  });

  test('landing page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Mobile-specific checks
    await expect(page.getByText(/stellar tipz/i)).toBeVisible();
    
    // Check that sections stack properly on mobile
    const hero = page.locator('h1');
    await expect(hero).toBeVisible();
  });

  test('landing page navigation links work', async ({ page }) => {
    await page.goto('/');
    
    // Find and click leaderboard link
    const leaderboardLink = page.getByRole('link', { name: /leaderboard/i });
    if (await leaderboardLink.isVisible()) {
      await leaderboardLink.click();
      await expect(page).toHaveURL(/\/leaderboard/);
    }
  });
});

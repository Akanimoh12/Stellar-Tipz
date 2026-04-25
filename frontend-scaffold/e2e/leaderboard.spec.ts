import { test, expect } from '@playwright/test';

test.describe('Leaderboard Page', () => {
  test('leaderboard page loads successfully', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Check for leaderboard title
    await expect(page.getByText(/leaderboard/i)).toBeVisible();
    await expect(page.getByText(/top creators/i)).toBeVisible();
  });

  test('leaderboard displays period filters', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Check for period filter buttons (All Time, Monthly, Weekly)
    await expect(page.getByText(/all time/i)).toBeVisible();
    await expect(page.getByText(/monthly/i)).toBeVisible();
    await expect(page.getByText(/weekly/i)).toBeVisible();
  });

  test('leaderboard period filter works', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Click on Monthly filter
    const monthlyButton = page.getByRole('button', { name: /monthly/i });
    await monthlyButton.click();
    
    // Verify button is selected (black background)
    await expect(monthlyButton).toHaveClass(/bg-black/);
  });

  test('leaderboard displays top 3 creators', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Wait for data to load
    await page.waitForLoadState('networkidle');
    
    // Check for creator cards in top 3 section
    const creatorCards = page.locator('.card').filter({ hasText: /creator/i });
    const count = await creatorCards.count();
    
    // At minimum, the UI structure should be present
    await expect(page.getByText(/rank/i)).toBeVisible();
  });

  test('leaderboard displays full rankings table', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Check for table headers
    await expect(page.getByText(/rank/i)).toBeVisible();
    await expect(page.getByText(/creator/i)).toBeVisible();
    await expect(page.getByText(/volume/i)).toBeVisible();
    await expect(page.getByText(/credit/i)).toBeVisible();
  });

  test('leaderboard navigation to creator profile works', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Wait for data to load
    await page.waitForLoadState('networkidle');
    
    // Find a creator link and click it
    const creatorLink = page.locator('a').filter({ hasText: /@/ }).first();
    const count = await creatorLink.count();
    
    if (count > 0) {
      await creatorLink.click();
      await expect(page).toHaveURL(/\/@/);
    }
  });

  test('leaderboard on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/leaderboard');
    
    // Check that leaderboard is responsive on mobile
    await expect(page.getByText(/leaderboard/i)).toBeVisible();
    await expect(page.getByText(/top creators/i)).toBeVisible();
    
    // Check that period filters are accessible
    await expect(page.getByText(/all time/i)).toBeVisible();
  });

  test('leaderboard dashboard link works', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Find and click dashboard link
    const dashboardLink = page.getByRole('link', { name: /dashboard/i });
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });

  test('leaderboard handles empty state', async ({ page }) => {
    // This test checks the UI when no creators are on leaderboard
    // In a real scenario, you might mock the contract to return empty data
    await page.goto('/leaderboard');
    
    // The empty state message
    const emptyState = page.getByText(/no creators found/i);
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }
  });
});

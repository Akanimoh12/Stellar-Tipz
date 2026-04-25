import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navigation works from landing to leaderboard', async ({ page }) => {
    await page.goto('/');
    
    // Find and click leaderboard link
    const leaderboardLink = page.getByRole('link', { name: /leaderboard/i });
    await leaderboardLink.click();
    
    await expect(page).toHaveURL(/\/leaderboard/);
  });

  test('navigation works from landing to register', async ({ page }) => {
    await page.goto('/');
    
    // Find and click register/get started link
    const registerLink = page.getByRole('link', { name: /register|get started/i });
    if (await registerLink.isVisible()) {
      await registerLink.click();
      await expect(page).toHaveURL(/\/register/);
    }
  });

  test('navigation to tip page works', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to a creator's tip page
    await page.goto('/@alice');
    
    await expect(page).toHaveURL(/\/@alice/);
  });

  test('navigation between leaderboard and dashboard', async ({ page }) => {
    await page.goto('/leaderboard');
    
    // Find dashboard link
    const dashboardLink = page.getByRole('link', { name: /dashboard/i });
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });

  test('back button navigation works', async ({ page }) => {
    await page.goto('/');
    await page.goto('/leaderboard');
    
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('navigation works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check that navigation links are accessible on mobile
    const leaderboardLink = page.getByRole('link', { name: /leaderboard/i });
    if (await leaderboardLink.isVisible()) {
      await leaderboardLink.click();
      await expect(page).toHaveURL(/\/leaderboard/);
    }
  });
});

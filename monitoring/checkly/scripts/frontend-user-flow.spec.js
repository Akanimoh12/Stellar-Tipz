const { test, expect } = require('@playwright/test');

const frontendUrl = __FRONTEND_URL__;

test.use({ actionTimeout: 10_000, navigationTimeout: 20_000 });

test('a visitor can load Stellar Tipz and reach the public leaderboard', async ({ page }) => {
  const landing = await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  expect(landing?.status(), 'landing page responds successfully').toBeLessThan(400);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText(/stellar tipz/i).first()).toBeVisible();

  const leaderboard = await page.goto(new URL('/leaderboard', frontendUrl).toString(), {
    waitUntil: 'networkidle',
  });
  expect(leaderboard?.status(), 'leaderboard route responds successfully').toBeLessThan(400);
  await expect(page.getByRole('heading', { name: /top creators/i })).toBeVisible();
});

import { test, expect } from './fixtures';
test('visual smoke test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
});

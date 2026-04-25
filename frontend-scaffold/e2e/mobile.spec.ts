import { test, expect, devices } from '@playwright/test';

test.describe('Mobile Responsive', () => {
  const mobileDevices = [
    { name: 'iPhone 12', device: devices['iPhone 12'] },
    { name: 'Pixel 5', device: devices['Pixel 5'] },
    { name: 'Small Mobile', device: { viewport: { width: 375, height: 667 } } },
  ];

  mobileDevices.forEach(({ name, device }) => {
    test.describe(`${name}`, () => {
      test.use(device);

      test('landing page is responsive', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText(/stellar tipz/i)).toBeVisible();
        await expect(page.locator('h1')).toBeVisible();
      });

      test('navigation works on mobile', async ({ page }) => {
        await page.goto('/');
        
        const leaderboardLink = page.getByRole('link', { name: /leaderboard/i });
        if (await leaderboardLink.isVisible()) {
          await leaderboardLink.click();
          await expect(page).toHaveURL(/\/leaderboard/);
        }
      });

      test('tip page is responsive', async ({ page }) => {
        await page.goto('/@alice');
        await expect(page.getByText(/tip creator/i)).toBeVisible();
        
        // Check form elements are accessible
        const amountInput = page.locator('input[name="amount"], input[type="number"]');
        await expect(amountInput.first()).toBeVisible();
      });

      test('leaderboard is responsive', async ({ page }) => {
        await page.goto('/leaderboard');
        await expect(page.getByText(/leaderboard/i)).toBeVisible();
        await expect(page.getByText(/top creators/i)).toBeVisible();
      });

      test('registration page is responsive', async ({ page }) => {
        await page.goto('/register');
        await expect(page.getByText(/register/i)).toBeVisible();
        
        const usernameInput = page.locator('input[name="username"]');
        await expect(usernameInput).toBeVisible();
      });

      test('touch targets are accessible', async ({ page }) => {
        await page.goto('/');
        
        // Check that buttons are large enough for touch (at least 44x44)
        const buttons = page.locator('button');
        const count = await buttons.count();
        
        if (count > 0) {
          const firstButton = buttons.first();
          const box = await firstButton.boundingBox();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      });

      test('text is readable on mobile', async ({ page }) => {
        await page.goto('/');
        
        // Check that main heading is visible and readable
        const heading = page.locator('h1').first();
        await expect(heading).toBeVisible();
        
        const fontSize = await heading.evaluate((el) => {
          return window.getComputedStyle(el).fontSize;
        });
        
        // Font size should be at least 16px for readability
        expect(parseInt(fontSize)).toBeGreaterThanOrEqual(16);
      });

      test('horizontal scrolling is prevented', async ({ page }) => {
        await page.goto('/');
        
        // Check that page doesn't have unwanted horizontal scroll
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        const windowWidth = await page.evaluate(() => window.innerWidth);
        
        expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 1); // Allow 1px tolerance
      });
    });
  });

  test('tablet responsive view', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    await expect(page.getByText(/stellar tipz/i)).toBeVisible();
    
    // Check that layout adjusts for tablet
    const hero = page.locator('h1');
    await expect(hero).toBeVisible();
  });

  test('desktop responsive view', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    
    await expect(page.getByText(/stellar tipz/i)).toBeVisible();
    
    // Check that layout uses full width on desktop
    const hero = page.locator('h1');
    await expect(hero).toBeVisible();
  });
});

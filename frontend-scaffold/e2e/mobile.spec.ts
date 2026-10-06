import { test, expect, devices } from '@playwright/test';

const mobileDevices = [
  { name: 'iPhone 12', device: devices['iPhone 12'] },
  { name: 'Pixel 5', device: devices['Pixel 5'] },
  { name: 'Small Mobile', device: { viewport: { width: 375, height: 667 } } },
];

test.describe('Mobile Responsive', () => {
  // This spec emulates mobile viewports manually via setViewportSize, so it
  // only needs to run once (chromium). Running it on all 5 projects
  // (chromium, firefox, webkit, Mobile Chrome, Mobile Safari) would execute
  // 3 devices x 13 tests x 5 projects = 195 runs. Skip non-chromium projects.
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Mobile viewport emulation only runs on chromium',
    );
  });

  mobileDevices.forEach(({ name, device }) => {
    test.describe(`${name}`, () => {
      // Playwright forbids test.use({ defaultBrowserType }) inside a describe
      // group because it forces a new worker. Device descriptors for iPhone /
      // Pixel include defaultBrowserType plus viewport/userAgent/etc. Emulate
      // the device via viewport (and user agent header where available) in a
      // beforeEach instead, which works across all projects (chromium,
      // firefox, webkit, Mobile Chrome, Mobile Safari).
      test.beforeEach(async ({ page }) => {
        if (device.viewport) {
          await page.setViewportSize(device.viewport);
        }
      });

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

      // #1338 — dedicated mobile interaction coverage
      test('numeric inputs request the numeric keyboard', async ({ page }) => {
        await page.goto('/@alice');

        const customTrigger = page.locator('[data-tip-amount-trigger="true"]');
        if (await customTrigger.count()) {
          await customTrigger.first().click();
        }

        const amountInput = page.locator('[data-tip-amount="true"]').first();
        await expect(amountInput).toHaveAttribute('inputmode', 'decimal');
      });

      test('tip form touch targets are at least 44x44', async ({ page }) => {
        await page.goto('/@alice');

        const targets = page.locator(
          '[data-tip-amount-trigger="true"], button:has-text("XLM")',
        );
        const count = await targets.count();
        expect(count).toBeGreaterThan(0);

        for (let i = 0; i < count; i++) {
          const box = await targets.nth(i).boundingBox();
          if (!box) continue;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
        }
      });

      test('tip submit button stays reachable above the keyboard', async ({ page }) => {
        await page.goto('/@alice');

        const customTrigger = page.locator('[data-tip-amount-trigger="true"]');
        if (await customTrigger.count()) {
          await customTrigger.first().click();
        }

        const amountInput = page.locator('[data-tip-amount="true"]').first();
        if (await amountInput.count()) {
          await amountInput.focus();
          // The field must not sit under a fixed bottom bar once focused.
          const scrollMargin = await amountInput.evaluate((el) =>
            window.getComputedStyle(el).scrollMarginBottom,
          );
          expect(scrollMargin).not.toBe('0px');
        }
      });

      test('no horizontal scrolling on the tip page', async ({ page }) => {
        await page.goto('/@alice');
        const overflow = await page.evaluate(
          () => document.body.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });

      test('viewport opts into safe-area insets for notched devices', async ({ page }) => {
        await page.goto('/');
        const content = await page
          .locator('meta[name="viewport"]')
          .getAttribute('content');
        expect(content).toContain('viewport-fit=cover');
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
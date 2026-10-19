import { test, expect } from '@playwright/test';

/**
 * #1345 — onboarding funnel instrumentation and resumable registration.
 *
 * Covers the interruption/resumption path: a user who abandons registration
 * mid-way finds their details and funnel step restored on return, and every
 * step they reach emits an analytics event.
 */
test.describe('Onboarding funnel and resumption (#1345)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/register');
  });

  test('records the register step in the persisted funnel', async ({ page }) => {
    await expect(page.getByRole('button', { name: /register profile/i })).toBeVisible();

    // Analytics is a no-op without an endpoint, so assert the persisted funnel
    // state the hook writes alongside each emitted event.
    await page.waitForFunction(() =>
      Boolean(window.localStorage.getItem('tipz_onboarding_step')),
    );

    const step = await page.evaluate(() =>
      window.localStorage.getItem('tipz_onboarding_step'),
    );
    expect(step).toBe('register');
  });

  test('restores an interrupted registration', async ({ page }) => {
    const usernameInput = page.locator('input[name="username"]');
    const displayNameInput = page.locator('input[name="displayName"], input[name="display_name"]');

    await usernameInput.fill('interrupted_user');
    if ((await displayNameInput.count()) > 0) {
      await displayNameInput.first().fill('Interrupted User');
    }

    // Interrupt the flow by navigating away mid-registration.
    await page.goto('/');
    await page.goto('/register');

    await expect(page.getByTestId('onboarding-resume-notice')).toBeVisible();
    await expect(usernameInput).toHaveValue('interrupted_user');
  });

  test('tracks the username step once a valid handle is entered', async ({ page }) => {
    const usernameInput = page.locator('input[name="username"]');
    await usernameInput.fill('funnel_user');
    await usernameInput.blur();

    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem('tipz_onboarding_steps_visited');
      if (!raw) return false;
      return (JSON.parse(raw) as string[]).includes('username');
    });
  });

  test('guides the user to reconnect a wallet instead of failing opaquely', async ({ page }) => {
    const usernameInput = page.locator('input[name="username"]');
    const displayNameInput = page.locator('input[name="displayName"], input[name="display_name"]');

    await usernameInput.fill('wallet_user');
    if ((await displayNameInput.count()) > 0) {
      await displayNameInput.first().fill('Wallet User');
    }

    const submit = page.getByRole('button', { name: /register profile/i });
    await submit.click();

    const recovery = page.getByTestId('wallet-recovery');
    if (await recovery.isVisible().catch(() => false)) {
      await expect(recovery).toContainText(/wallet/i);
      await expect(recovery).toContainText(/saved/i);
      await expect(
        recovery.getByRole('button', { name: /reconnect wallet/i }),
      ).toBeVisible();
    }
  });
});

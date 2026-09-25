import { DYNAMIC_SELECTOR, expect, openForScreenshot, test, type VisualOptions } from './fixtures';

/**
 * Visual regression suite (issue #1343).
 *
 * Baselines live in tests/visual/__screenshots__ and are rendered by the CI
 * container only (see docs/CONTRIBUTING.md, "Visual regression baselines").
 * Every scenario goes through `openForScreenshot`, which pins time, randomness,
 * theme, motion, language and network before the page loads.
 */
interface Scenario {
  name: string;
  path: string;
  options?: VisualOptions;
}

const SCENARIOS: Scenario[] = [
  { name: 'landing-desktop-light', path: '/' },
  { name: 'landing-desktop-dark', path: '/', options: { theme: 'dark' } },
  { name: 'landing-tablet', path: '/', options: { viewport: 'tablet' } },
  { name: 'landing-mobile', path: '/', options: { viewport: 'mobile' } },
  { name: 'leaderboard-desktop-light', path: '/leaderboard' },
  { name: 'leaderboard-mobile', path: '/leaderboard', options: { viewport: 'mobile' } },
  { name: 'help-desktop-light', path: '/help' },
  { name: 'help-mobile', path: '/help', options: { viewport: 'mobile' } },
  { name: 'register-desktop-light', path: '/register' },
  { name: 'register-mobile', path: '/register', options: { viewport: 'mobile' } },
  { name: '404-desktop-light', path: '/this-page-does-not-exist' },
];

for (const scenario of SCENARIOS) {
  test(scenario.name, async ({ page }) => {
    await openForScreenshot(page, scenario.path, scenario.options);
    await expect(page).toHaveScreenshot(`${scenario.name}.png`, {
      fullPage: true,
      mask: [page.locator(DYNAMIC_SELECTOR)],
    });
  });
}

import { expect, test as base, type Page } from '@playwright/test';

/**
 * Determinism fixtures for visual regression tests (issue #1343).
 *
 * Every source of run-to-run variation the audit identified is neutralised
 * before the page loads:
 *  - time: `Date.now()` / `new Date()` are pinned to FIXED_TIME
 *  - randomness: `Math.random` is a seeded generator
 *  - theme, motion and onboarding: localStorage keys the app reads are pre-set
 *    (theme, reduced motion, tour completed) and the reduced-motion media
 *    query is emulated, so framer-motion and CSS transitions render their
 *    final state
 *  - language: pinned to English through the i18n storage key
 *  - network: only the app origin and Google Fonts are reachable; every
 *    backend call answers with a fixed 503 body so components render their
 *    error/empty states instead of live data; RPC, Horizon, analytics and
 *    Sentry are blocked
 *  - service worker: disabled so a cached shell from a previous run can
 *    never be served
 *  - fonts: screenshots wait for the web fonts to be loaded and fail loudly
 *    if they are not, instead of silently diffing against fallback glyphs
 */
export const FIXED_TIME = new Date('2026-01-15T12:00:00.000Z');
export const RANDOM_SEED = 20260115;

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

export type Theme = 'light' | 'dark';

/** Hosts other than the app origin that a visual test may reach. */
const THIRD_PARTY_ALLOWLIST = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/** Elements whose content is inherently dynamic; masked with a solid box in every screenshot. */
export const DYNAMIC_SELECTOR = [
  "[data-testid='timestamp']",
  "[data-testid='random-value']",
  "[data-testid='wallet-address']",
  '.recharts-wrapper',
  'time',
].join(', ');

function isAppOrigin(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

export async function freezeEnvironment(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ theme: pinnedTheme, seed }) => {
      // mulberry32: small, fast, deterministic.
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      window.localStorage.setItem('tipz_theme', pinnedTheme);
      window.localStorage.setItem('tipz_lang', 'en');
      window.localStorage.setItem('tipz_settings', JSON.stringify({ reduceMotion: 'always' }));
      // The first-visit product tour would otherwise cover the hero on every landing screenshot.
      window.localStorage.setItem('tipz_onboarding', 'completed');
      Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true });
    },
    { theme, seed: RANDOM_SEED },
  );
  await page.clock.setFixedTime(FIXED_TIME);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });

  // Routes are matched last-registered-first: the API stub below wins over the catch-all.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (isAppOrigin(url) || THIRD_PARTY_ALLOWLIST.has(url.hostname)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'VISUAL_FIXTURE', message: 'Backend calls are stubbed in visual tests' } }),
    }),
  );
}

/** Waits until the page is stable enough to screenshot deterministically. */
export async function settle(page: Page): Promise<void> {
  await page.locator('#root > *').first().waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const fontsLoaded = await page.evaluate(() =>
    Array.from(document.fonts).some((face) => face.family.replace(/["']/g, '') === 'Inter' && face.status === 'loaded'),
  );
  expect(fontsLoaded, 'Inter must be loaded before a screenshot; check the Google Fonts allowlist in tests/visual/fixtures.ts').toBe(true);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        animation.cancel();
      }
    }
    window.scrollTo(0, 0);
  });
}

export interface VisualOptions {
  theme?: Theme;
  viewport?: keyof typeof VIEWPORTS;
}

/** Navigates with the frozen environment and returns once the page has settled. */
export async function openForScreenshot(page: Page, path: string, options: VisualOptions = {}): Promise<void> {
  const { theme = 'light', viewport = 'desktop' } = options;
  await page.setViewportSize(VIEWPORTS[viewport]);
  await freezeEnvironment(page, theme);
  await page.goto(path);
  await settle(page);
}

export const test = base;
export { expect };

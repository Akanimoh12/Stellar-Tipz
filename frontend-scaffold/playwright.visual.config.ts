import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression configuration (issue #1343).
 *
 * Everything that can vary between runs is pinned here or in
 * tests/visual/fixtures.ts:
 *  - the app is built with `--mode visual` (.env.visual: mock data, no network)
 *  - one browser project only; baselines are rendered inside the Playwright
 *    Docker image pinned in .github/workflows/visual-regression.yml, so the
 *    snapshot path carries no platform suffix
 *  - fixed viewport, device scale factor, locale, timezone, colour scheme and
 *    reduced motion
 *  - no retries: a snapshot that only passes on retry is flaky and must be
 *    fixed or removed, never retried into green
 *
 * Run `npm run test:visual`; regenerate baselines with the
 * `visual-baselines:update` label or `npm run test:visual:update` inside the
 * pinned container (see docs/CONTRIBUTING.md).
 */
export const VISUAL_PORT = 3100;
export const VISUAL_BASE_URL = `http://localhost:${VISUAL_PORT}`;

export default defineConfig({
  testDir: './tests/visual',
  testMatch: ['**/*.spec.ts'],
  outputDir: 'test-results/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/visual/results.json' }],
    ...(process.env.CI ? ([['github']] as const) : []),
  ],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.005,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: VISUAL_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'visual-chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `npx vite build --mode visual --outDir dist-visual && npx vite preview --outDir dist-visual --port ${VISUAL_PORT} --strictPort`,
    url: VISUAL_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});

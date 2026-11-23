import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Stellar Tipz E2E tests.
 * Covers both e2e (./e2e) and visual regression (./tests/visual) suites.
 * Configured to work with Vite dev server on port 3000.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/visual/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: '**/e2e/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: '**/e2e/mobile.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: '**/e2e/mobile.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      testIgnore: '**/e2e/mobile.spec.ts',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      testIgnore: '**/e2e/mobile.spec.ts',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'mobile',
      testMatch: '**/e2e/mobile.spec.ts',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: process.env.CI ? 'npm run build && npx vite preview --port 3000' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion/dist/cjs/index.js')
    }
  },
  test: {
    coverage: {
      provider: 'v8',
      // `json-summary` feeds the ratchet totals; `json` feeds the critical-path
      // line report; `lcov` feeds Codecov.
      reporter: process.env.CI
        ? ['json', 'json-summary', 'lcov']
        : ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: ['node_modules/', 'src/test/'],
      // The suite currently has failing tests (see docs/COVERAGE.md). Without
      // this, Vitest skips writing any coverage output when a run fails, which
      // would leave the ratchet with no data to check. Enforced thresholds live
      // in scripts/check-coverage.mjs, not here.
      reportOnFailure: true,
    },
    projects: [{
      extends: true,
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        server: {
          deps: {
            inline: ['@stellar/stellar-sdk', '@stellar/stellar-base']
          }
        }
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});

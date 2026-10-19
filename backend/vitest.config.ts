import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    env: { TEST_JWT_SECRET: process.env.TEST_JWT_SECRET ?? randomBytes(32).toString('hex') },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['vitest.setup.ts', 'tests/setup.ts'],
    coverage: {
      provider: 'v8',
      // `json-summary` feeds the ratchet totals; `json` feeds the critical-path
      // line report; `lcov` feeds Codecov. `text` is omitted in CI to keep the
      // log short.
      reporter: process.env.CI
        ? ['json', 'json-summary', 'lcov']
        : ['text', 'json', 'json-summary', 'html', 'lcov'],
      // The suite currently has failing tests (see docs/COVERAGE.md). Without
      // this, Vitest skips writing any coverage output when a run fails, which
      // would leave the ratchet with no data to check. Enforced thresholds live
      // in scripts/check-coverage.mjs, not here.
      reportOnFailure: true,
    },
  },
});

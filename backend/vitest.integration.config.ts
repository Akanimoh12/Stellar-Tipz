import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for integration tests.
 * Integration tests run against a real Postgres database and verify:
 * - Migration validity
 * - Constraint enforcement
 * - Transaction behavior
 * - Database state consistency
 */
export default defineConfig({
  test: {
    globals: true,
    // Only run files in tests/integration directory
    include: ['tests/integration/**/*.integration.test.ts'],
    // Setup file that runs migrations and prepares test database
    setupFiles: ['tests/integration/setup.ts'],
    // Run tests serially to avoid database conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Longer timeout for integration tests (database operations)
    testTimeout: 30000,
    hookTimeout: 60000,
    // Useful for debugging integration test failures
    reporters: ['verbose'],
  },
});

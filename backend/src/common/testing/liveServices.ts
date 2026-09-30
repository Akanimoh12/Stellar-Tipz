/**
 * Opt-in "live" tests against a real Postgres and/or Redis.
 *
 * `npm test` stays hermetic: `*.db.test.ts` files skip unless
 * `TEST_DATABASE_URL` is set and `*.redis.test.ts` files skip unless
 * `TEST_REDIS_URL` is set. They cover what mocks cannot: the raw SQL (keyset
 * pagination, bucketing, fencing locks) and the Lua scripts.
 *
 *   docker compose -f docker-compose.test.yml up -d
 *   TEST_DATABASE_URL=postgresql://tipz_test:<password>@localhost:5433/tipz_test \
 *   TEST_REDIS_URL=redis://localhost:6380 \
 *   npx vitest run --no-file-parallelism .db.test .redis.test
 *
 * Point them only at disposable databases: the database suites push the Prisma
 * schema and truncate the tables they use.
 */
import { execSync } from 'node:child_process';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL;

/**
 * Points the app's Prisma/Redis singletons at the live services. Call before
 * dynamically importing any app module.
 */
export function useLiveServices(): void {
  if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
  if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
}

/** Syncs the Prisma schema into the (disposable) live test database. */
export function pushSchema(): void {
  if (!TEST_DATABASE_URL) return;
  const database = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!database.includes('test')) {
    throw new Error(`Refusing to reset "${database}": live database tests need a database named *test*`);
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'ignore',
  });
}

import { Prisma } from '@prisma/client';

/**
 * A `Date` as a raw-SQL `timestamp` in UTC.
 *
 * Prisma stores `DateTime` columns as `timestamp(3)` holding UTC wall time, but
 * `$queryRaw` sends a JS `Date` as `timestamptz`. Comparing the two converts the
 * column through the session `TimeZone`, which silently shifts range filters on
 * any database not running in UTC. Pinning the parameter to UTC keeps raw
 * queries consistent with Prisma's own model queries.
 */
export function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`(${date}::timestamptz AT TIME ZONE 'UTC')`;
}

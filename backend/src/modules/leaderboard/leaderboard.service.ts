import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { utcTimestamp } from '../../db/sql.js';
import { NotFoundError } from '../../common/errors/AppError.js';
import {
  createCursorScope,
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../../common/pagination/cursor.js';
import type { SnapshotPeriod, TimeWindow } from './leaderboard.schema.js';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardSnapshotResult,
} from './leaderboard.types.js';

const WINDOW_MS: Record<Exclude<TimeWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const SNAPSHOT_WINDOW_MS: Record<Exclude<SnapshotPeriod, 'ALL_TIME'>, number> = {
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
};

function getSince(window: TimeWindow, now = new Date()): Date | undefined {
  if (window === 'all') return undefined;
  return new Date(now.getTime() - WINDOW_MS[window]);
}

function getSnapshotSince(period: SnapshotPeriod, now = new Date()): Date | undefined {
  if (period === 'ALL_TIME') return undefined;
  return new Date(now.getTime() - SNAPSHOT_WINDOW_MS[period]);
}

/**
 * Leaderboard ordering (issue #1269). The sort is total, so keyset pagination
 * can never duplicate or skip an entry:
 *
 *   1. confirmed volume, descending;
 *   2. the ledger of the creator's latest counted tip, ascending — the creator
 *      who *reached* their total first ranks higher, which is the on-chain rule
 *      in `contracts/tipz/src/leaderboard.rs` (stable insert after equal amounts);
 *   3. `toAddress` in byte order (`COLLATE "C"`), ascending — unique, so two
 *      creators can never compare equal. On-chain, a same-ledger tie is decided
 *      by transaction order, which the Tip table does not record.
 */
const RANKED_ORDER = Prisma.sql`"total" DESC, "reachedAtLedger" ASC, "toAddress" COLLATE "C" ASC`;
const RANKED_ORDER_AGGREGATE = Prisma.sql`SUM("amountStroops") DESC, MAX("ledger") ASC, "toAddress" COLLATE "C" ASC`;

/** Position of the last entry on a page; the next page starts strictly after it. */
const leaderboardKeysetSchema = z.object({
  total: z.string().regex(/^\d+$/),
  ledger: z.number().int(),
  address: z.string().min(1),
  rank: z.number().int().min(1),
});

type LeaderboardKeyset = z.infer<typeof leaderboardKeysetSchema>;

interface RankedRow {
  toAddress: string;
  total: bigint;
  reachedAtLedger: number;
}

function confirmedTipsFilter(since: Date | undefined): Prisma.Sql {
  return since
    ? Prisma.sql`"status" = 'CONFIRMED' AND "createdAt" >= ${utcTimestamp(since)}`
    : Prisma.sql`"status" = 'CONFIRMED'`;
}

async function getRankedRows(
  since: Date | undefined,
  page: { limit?: number; offset?: number; after?: LeaderboardKeyset } = {},
): Promise<RankedRow[]> {
  // (-total, ledger, address) ascending is exactly the ranked order, so one
  // row comparison expresses "strictly after the cursor".
  const after = page.after
    ? Prisma.sql`HAVING (-SUM("amountStroops"), MAX("ledger"), "toAddress" COLLATE "C") > (${-BigInt(page.after.total)}, ${page.after.ledger}, ${page.after.address} COLLATE "C")`
    : Prisma.empty;
  const limit = page.limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${page.limit}`;
  const offset = page.offset ? Prisma.sql`OFFSET ${page.offset}` : Prisma.empty;

  return prisma.$queryRaw<RankedRow[]>`
    SELECT "toAddress", SUM("amountStroops")::bigint AS "total", MAX("ledger") AS "reachedAtLedger"
    FROM "Tip"
    WHERE ${confirmedTipsFilter(since)}
    GROUP BY "toAddress"
    ${after}
    ORDER BY ${RANKED_ORDER}
    ${limit}
    ${offset}
  `;
}

async function countRankedRows(since: Date | undefined): Promise<number> {
  // A hashed GROUP BY avoids COUNT(DISTINCT)'s sort of every tip.
  const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS "count" FROM (
      SELECT 1 FROM "Tip" WHERE ${confirmedTipsFilter(since)} GROUP BY "toAddress"
    ) AS "creators"
  `;
  return Number(row?.count ?? 0);
}

async function hydrateEntries(rows: RankedRow[], firstRank: number): Promise<LeaderboardEntry[]> {
  const addresses = rows.map((row) => row.toAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, username: true, stellarAddress: true },
  });
  const userMap = new Map(users.map((user) => [user.stellarAddress, user]));

  return rows.map((row, index) => {
    const user = userMap.get(row.toAddress);
    return {
      rank: firstRank + index,
      userId: user?.id ?? '',
      username: user?.username ?? null,
      stellarAddress: row.toAddress,
      totalTips: row.total.toString(),
    };
  });
}

/**
 * Returns creators ranked by confirmed tip volume. Pages with an opaque
 * `cursor` (keyset, stable under ties); `offset` is still accepted for
 * existing clients but deprecated.
 */
export async function getLeaderboard(
  window: TimeWindow,
  limit: number,
  offset: number,
  cursor?: string,
): Promise<LeaderboardResponse> {
  const since = getSince(window);
  const scope = createCursorScope('leaderboard', { window });
  const after = cursor ? decodeKeysetCursor(cursor, scope, leaderboardKeysetSchema) : undefined;
  const startOffset = after ? after.rank : offset;

  const [rows, total] = await Promise.all([
    getRankedRows(since, { limit: limit + 1, offset: after ? undefined : offset, after }),
    countRankedRows(since),
  ]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const data = await hydrateEntries(pageRows, startOffset + 1);
  const last = pageRows[pageRows.length - 1];

  return {
    data,
    window,
    pagination: {
      limit,
      offset: startOffset,
      total,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeKeysetCursor(
              {
                total: last.total.toString(),
                ledger: last.reachedAtLedger,
                address: last.toAddress,
                rank: startOffset + pageRows.length,
              },
              scope,
            )
          : null,
    },
  };
}

/** Returns a single user's rank for the requested leaderboard window, using the leaderboard's total order. */
export async function getUserRank(
  userId: string,
  window: TimeWindow,
): Promise<{ rank: number; totalTips: string; window: TimeWindow }> {
  const since = getSince(window);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stellarAddress: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const [ranked] = await prisma.$queryRaw<Array<{ rank: bigint; total: bigint }>>`
    SELECT "rank", "total" FROM (
      SELECT "toAddress",
             SUM("amountStroops")::bigint AS "total",
             ROW_NUMBER() OVER (ORDER BY ${RANKED_ORDER_AGGREGATE}) AS "rank"
      FROM "Tip"
      WHERE ${confirmedTipsFilter(since)}
      GROUP BY "toAddress"
    ) AS "ranked"
    WHERE "toAddress" = ${user.stellarAddress}
  `;

  if (!ranked) {
    throw new NotFoundError('User not found on the leaderboard for this window');
  }

  return {
    rank: Number(ranked.rank),
    totalTips: ranked.total.toString(),
    window,
  };
}

/** Rebuilds stored leaderboard snapshots for a period from confirmed tip volume. */
export async function createLeaderboardSnapshot(
  period: SnapshotPeriod,
  now = new Date(),
): Promise<LeaderboardSnapshotResult> {
  const since = getSnapshotSince(period, now);
  const rows = await getRankedRows(since);
  const addresses = rows.map((row) => row.toAddress);
  const users = await prisma.user.findMany({
    where: { stellarAddress: { in: addresses } },
    select: { id: true, stellarAddress: true },
  });
  const userMap = new Map(users.map((user) => [user.stellarAddress, user]));

  const data = rows.flatMap((row, index) => {
    const user = userMap.get(row.toAddress);
    if (!user) return [];
    return {
      period,
      rank: index + 1,
      userId: user.id,
      totalTips: row.total,
    };
  });

  await prisma.$transaction([
    prisma.leaderboardSnapshot.deleteMany({ where: { period } }),
    ...(data.length > 0 ? [prisma.leaderboardSnapshot.createMany({ data })] : []),
  ]);

  return { period, entriesCreated: data.length };
}

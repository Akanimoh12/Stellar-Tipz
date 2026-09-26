/**
 * Live Postgres tests for leaderboard ordering and pagination (issue #1269).
 * Skipped unless TEST_DATABASE_URL is set — see common/testing/liveServices.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, pushSchema, useLiveServices } from '../../common/testing/liveServices.js';

useLiveServices();
// One pooled connection, so a session-level SET TIME ZONE applies to every query.
process.env.DATABASE_POOL_SIZE = '1';
const { prisma } = await import('../../db/prisma.js');
const { getLeaderboard, getUserRank, createLeaderboardSnapshot } = await import('./leaderboard.service.js');

/** Stellar-like address; the index is zero-padded so byte order follows it. */
const address = (i: number) => `G${String(i).padStart(4, '0')}${'A'.repeat(51)}`;

async function seedTip(to: string, amount: bigint, ledger: number, status: 'CONFIRMED' | 'PENDING' = 'CONFIRMED') {
  await prisma.tip.create({
    data: {
      txHash: `tx-${to}-${ledger}-${amount}-${status}`,
      ledger,
      fromAddress: 'GTIPPER',
      toAddress: to,
      amountStroops: amount,
      status,
    },
  });
}

describe.skipIf(!TEST_DATABASE_URL)('leaderboard on Postgres (live)', () => {
  beforeAll(() => pushSchema(), 120_000);
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Tip", "LeaderboardSnapshot", "User" CASCADE');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('pages through 40 all-equal scores by cursor with no duplicates or gaps', async () => {
    // Every creator has the same volume; several also reached it on the same
    // ledger, so the address is the only thing separating them.
    const creators = Array.from({ length: 40 }, (_, i) => address(i));
    for (const [i, creator] of [...creators].reverse().entries()) {
      await seedTip(creator, 1_000n, 500 + (i % 4));
    }
    await seedTip(address(99), 1n, 1, 'PENDING'); // never ranked

    const seen: string[] = [];
    const ranks: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await getLeaderboard('all', 7, 0, cursor);
      expect(page.pagination.total).toBe(40);
      seen.push(...page.data.map((entry) => entry.stellarAddress));
      ranks.push(...page.data.map((entry) => entry.rank));
      cursor = page.pagination.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(40);
    expect(ranks).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));

    // Order: reached-first ledger ascending, then address.
    const ledgerOf = new Map([...creators].reverse().map((creator, i) => [creator, 500 + (i % 4)]));
    const expected = [...creators].sort(
      (a, b) => ledgerOf.get(a)! - ledgerOf.get(b)! || (a < b ? -1 : 1),
    );
    expect(seen).toEqual(expected);
  });

  it('ranks the creator who reached an equal total first higher (the on-chain rule)', async () => {
    const early = address(1);
    const late = address(2);
    await seedTip(early, 30n, 100);
    await seedTip(late, 20n, 110);
    await seedTip(late, 10n, 120); // late reaches 30 at ledger 120
    await seedTip(address(3), 50n, 130);

    const page = await getLeaderboard('all', 10, 0);

    expect(page.data.map((entry) => [entry.stellarAddress, entry.totalTips])).toEqual([
      [address(3), '50'],
      [early, '30'],
      [late, '30'],
    ]);
  });

  it('agrees with pagination ranks for a single user and for snapshots', async () => {
    for (let i = 0; i < 12; i++) await seedTip(address(i), 100n, 10);
    const user = await prisma.user.create({ data: { stellarAddress: address(7) } });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        i === 7 ? null : prisma.user.create({ data: { stellarAddress: address(i) } }),
      ),
    );

    const { data } = await getLeaderboard('all', 20, 0);
    const listed = data.find((entry) => entry.stellarAddress === address(7))!;
    const single = await getUserRank(user.id, 'all');
    expect(single.rank).toBe(listed.rank);

    await createLeaderboardSnapshot('ALL_TIME');
    const snapshot = await prisma.leaderboardSnapshot.findFirst({ where: { userId: user.id } });
    expect(snapshot?.rank).toBe(listed.rank);
  });

  it('keeps deprecated offset pages consistent with the total order', async () => {
    for (let i = 0; i < 15; i++) await seedTip(address(i), 5n, 42);

    const byOffset: string[] = [];
    for (let offset = 0; offset < 15; offset += 4) {
      byOffset.push(...(await getLeaderboard('all', 4, offset)).data.map((entry) => entry.stellarAddress));
    }
    expect(byOffset).toEqual(Array.from({ length: 15 }, (_, i) => address(i)));
  });

  it('applies time windows in UTC regardless of the session time zone', async () => {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
    const inWindow = address(1);
    const outOfWindow = address(2);
    for (const [to, createdAt, ledger] of [
      [inWindow, hoursAgo(23.5), 1],
      [outOfWindow, hoursAgo(24.5), 2],
    ] as const) {
      await prisma.tip.create({
        data: { txHash: `tx-${ledger}`, ledger, fromAddress: 'GTIPPER', toAddress: to, amountStroops: 10n, status: 'CONFIRMED', createdAt },
      });
    }

    await prisma.$executeRawUnsafe(`SET TIME ZONE 'Pacific/Kiritimati'`); // UTC+14
    try {
      const page = await getLeaderboard('24h', 10, 0);
      expect(page.data.map((entry) => entry.stellarAddress)).toEqual([inWindow]);
    } finally {
      await prisma.$executeRawUnsafe(`SET TIME ZONE 'UTC'`);
    }
  });
});

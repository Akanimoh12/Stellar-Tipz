/**
 * Live Postgres tests for the indexer cursor fence (issue #1263): the row lock
 * and epoch check that stop a deposed leader from committing. Skipped unless
 * TEST_DATABASE_URL is set — see common/testing/liveServices.ts.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL, pushSchema, useLiveServices } from '../common/testing/liveServices.js';

useLiveServices();
const { prisma } = await import('../db/prisma.js');
const { CursorFencedError, claimCursorFence, getMaxLeaderEpoch, setCursorLedger } = await import('./cursor.js');
const { rollbackToLedger } = await import('./reorg.js');

const TOPIC = 'tip_events';

describe.skipIf(!TEST_DATABASE_URL)('indexer cursor fencing on Postgres (live)', () => {
  beforeAll(async () => {
    pushSchema();
    // LedgerCheckpoint is created by its migration only (no Prisma model), so
    // `db push` does not create it; the reorg rollback needs it.
    const [{ exists }] = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT to_regclass('"LedgerCheckpoint"') IS NOT NULL AS "exists"`,
    );
    if (!exists) {
      const sql = readFileSync('prisma/migrations/20260830130000_add_ledger_checkpoint/migration.sql', 'utf8');
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  }, 120_000);
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "IndexerCursor", "Tip", "EventLog", "LedgerCheckpoint" CASCADE');
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts the current leader and rejects a deposed one', async () => {
    await setCursorLedger(TOPIC, 100, 1);
    await setCursorLedger(TOPIC, 120, 2); // new leader

    await expect(setCursorLedger(TOPIC, 110, 1)).rejects.toBeInstanceOf(CursorFencedError);

    expect(await prisma.indexerCursor.findUnique({ where: { topic: TOPIC } })).toMatchObject({
      lastLedger: 120,
      leaderEpoch: 2,
    });
    expect(await getMaxLeaderEpoch()).toBe(2);
  });

  it('serialises a stale commit behind the new leader holding the row lock', async () => {
    await setCursorLedger(TOPIC, 100, 1);

    let releaseNewLeader!: () => void;
    const newLeaderHolds = new Promise<void>((resolve) => (releaseNewLeader = resolve));
    const newLeader = prisma.$transaction(async (tx) => {
      await claimCursorFence(tx, TOPIC, 2);
      await newLeaderHolds;
      await tx.indexerCursor.update({ where: { topic: TOPIC }, data: { lastLedger: 150, leaderEpoch: 2 } });
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const stale = setCursorLedger(TOPIC, 130, 1); // blocks on FOR UPDATE
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseNewLeader();

    await newLeader;
    await expect(stale).rejects.toBeInstanceOf(CursorFencedError);
    expect((await prisma.indexerCursor.findUnique({ where: { topic: TOPIC } }))?.lastLedger).toBe(150);
  });

  it('a deposed leader cannot roll back projections', async () => {
    await setCursorLedger(TOPIC, 200, 3);
    await prisma.tip.create({
      data: { txHash: 'kept', ledger: 190, fromAddress: 'GA', toAddress: 'GB', amountStroops: 1n, status: 'CONFIRMED' },
    });

    await expect(rollbackToLedger(TOPIC, 150, 2)).rejects.toBeInstanceOf(CursorFencedError);

    expect(await prisma.tip.count()).toBe(1);
    expect((await prisma.indexerCursor.findUnique({ where: { topic: TOPIC } }))?.lastLedger).toBe(200);
  });
});

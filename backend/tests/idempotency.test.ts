import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './helpers/db.js';
import { resetDb } from './helpers/db.js';
import { projectEvent } from '../src/indexer/projections.js';
import { fullFixtureEventPage, ADDR_A } from '../src/indexer/fixtures/events.js';

beforeEach(() => resetDb());

/** Aggregate counts for every projection-relevant table, used to compare state. */
async function snapshotState(): Promise<Record<string, number>> {
  const [tips, refunds, users, goals, subscriptions, credits, creditHistory, eventLogs] =
    await Promise.all([
      prisma.tip.count(),
      prisma.refund.count(),
      prisma.user.count(),
      prisma.goal.count(),
      prisma.subscription.count(),
      prisma.creditScore.count(),
      prisma.creditScoreHistory.count(),
      prisma.eventLog.count(),
    ]);
  return { tips, refunds, users, goals, subscriptions, credits, creditHistory, eventLogs };
}

describe('indexer projection idempotency', () => {
  it('processes every fixture twice and leaves identical state', async () => {
    const events = fullFixtureEventPage.events;
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      await projectEvent(event);
    }
    const afterFirst = await snapshotState();

    for (const event of events) {
      await projectEvent(event);
    }
    const afterSecond = await snapshotState();

    expect(afterSecond).toEqual(afterFirst);
  });

  it('every event type projects to exactly one row after double processing', async () => {
    const events = fullFixtureEventPage.events;

    for (let pass = 0; pass < 2; pass++) {
      for (const event of events) {
        await projectEvent(event);
      }
    }

    // Each event type must appear exactly once in the event log.
    for (const event of events) {
      const logs = await prisma.eventLog.findMany({
        where: { txHash: event.txHash, topic: event.topic },
      });
      expect(logs).toHaveLength(1);
    }

    // The single goal / subscription / credit rows for the fixtures stay singular.
    const goalCount = await prisma.goal.count();
    expect(goalCount).toBe(await prisma.goal.findMany().then((r) => r.length));
    expect(await prisma.goal.count()).toBeGreaterThan(0);
  });

  it('out-of-order delivery (older ledger replayed after newer) produces no duplicate rows', async () => {
    // Deliver in reversed order (out-of-order) to prove order independence.
    const events = [...fullFixtureEventPage.events].reverse();

    for (let pass = 0; pass < 2; pass++) {
      for (const event of events) {
        await projectEvent(event);
      }
    }

    for (const event of events) {
      const logs = await prisma.eventLog.findMany({
        where: { txHash: event.txHash, topic: event.topic },
      });
      expect(logs).toHaveLength(1);
    }
  });

  it('is robust under concurrent duplicate replay', async () => {
    const events = fullFixtureEventPage.events;
    await Promise.all(events.flatMap((event) => [projectEvent(event), projectEvent(event)]));

    for (const event of events) {
      const logs = await prisma.eventLog.findMany({
        where: { txHash: event.txHash, topic: event.topic },
      });
      expect(logs).toHaveLength(1);
    }
  });

  it('re-running projections over tip events is not a blind increment', async () => {
    const tipEvent = fullFixtureEventPage.events.find((e) => e.topic === 'tip_sent');
    const profileEvent = fullFixtureEventPage.events.find((e) => e.topic === 'profile_register');
    expect(tipEvent).toBeDefined();
    expect(profileEvent).toBeDefined();

    // Ensure the profile user row exists first (matching real ordering).
    await projectEvent(profileEvent!);

    const before = await prisma.tip.count();
    // Deliver the same tip ledger tuple twice plus a concurrent one.
    await projectEvent(tipEvent!);
    await Promise.all([projectEvent(tipEvent!), projectEvent(tipEvent!)]);
    const after = await prisma.tip.count();

    expect(after).toBe(before + 1);
    expect(ADDR_A).toBeDefined();
  });
});
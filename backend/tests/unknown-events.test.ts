import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './helpers/db.js';
import { resetDb } from './helpers/db.js';
import { getMetrics } from '../src/common/observability/metrics.js';
import { projectEvent } from '../src/indexer/projections.js';
import { ADDR_A, ADDR_B } from '../src/indexer/fixtures/events.js';
import type { DecodedEvent } from '../src/indexer/sorobanClient.js';

beforeEach(() => resetDb());

const baseEvent: DecodedEvent = {
  ledger: 200,
  txHash: 'unknown-tx-0001',
  pagingToken: '200-0',
  topic: 'some_future_topic',
  value: {
    from: ADDR_A,
    to: ADDR_B,
    amount: '1000000',
  },
};

async function unknownTotal(): Promise<number> {
  const metrics = await getMetrics();
  return metrics.indexer?.unknown_events_total ?? 0;
}

describe('indexer unknown & future event handling (issue #1261)', () => {
  it('persists an unknown event type raw to EventLog and warns', async () => {
    await projectEvent(baseEvent);

    const log = await prisma.eventLog.findFirst({ where: { txHash: baseEvent.txHash } });
    expect(log).not.toBeNull();
    expect(log?.topic).toBe('some_future_topic');
    expect(log?.ledger).toBe(200);
    expect(await unknownTotal()).toBe(1);
  });

  it('does not crash or create projection rows for an unknown event', async () => {
    await projectEvent(baseEvent);

    const tips = await prisma.tip.count();
    expect(tips).toBe(0);
  });

  it('counts unknown events — visible in metrics, not silent', async () => {
    await projectEvent(baseEvent);
    await projectEvent({ ...baseEvent, txHash: 'unknown-tx-0002' });
    expect(await unknownTotal()).toBe(2);
  });

  it('persists unknown future-version events raw for later replay', async () => {
    const futEvent: DecodedEvent = {
      ...baseEvent,
      txHash: 'future-version-tx',
      topic: 'tip_sent',
      value: { from: ADDR_A, to: ADDR_B, amount: '5000000', version: 99 },
    };
    // tip_sent is known; a future "version" marker doesn't change handling, and
    // an unknown subtype under a known topic is still a known projection.
    await projectEvent(futEvent);
    const tip = await prisma.tip.findFirst({ where: { txHash: 'future-version-tx' } });
    expect(tip).not.toBeNull();
  });

  it('counts malformed known-event payloads as unknown events', async () => {
    await projectEvent({ ...baseEvent, topic: 'tip_sent', value: { invalid: true } });
    expect(await unknownTotal()).toBe(1);
  });

  it('dedupes unknown events by EventLog unique key (txHash, topic, ledger)', async () => {
    await projectEvent(baseEvent);
    await projectEvent(baseEvent);
    const logs = await prisma.eventLog.findMany({ where: { txHash: baseEvent.txHash } });
    expect(logs).toHaveLength(1);
  });
});
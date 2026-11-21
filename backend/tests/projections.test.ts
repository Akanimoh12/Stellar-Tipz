import { describe, expect, it, beforeEach } from 'vitest';
import { resetDb } from './helpers/db.js';
import { projectEvent } from '../src/indexer/projections.js';
import type { DecodedEvent } from '../src/indexer/sorobanClient.js';
import { prisma } from '../src/db/prisma.js';

beforeEach(() => resetDb());

const mockDecodedEvent = (overrides: Partial<DecodedEvent> = {}): DecodedEvent => ({
  ledger: 100,
  txHash: 'abc123def456',
  pagingToken: '100-1',
  topic: 'tip_sent',
  value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000', message: 'Thanks!' },
  ...overrides,
});

describe('projectEvent', () => {
  it('projects a tip_sent event idempotently', async () => {
    const event = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'tip-txhash-1',
      value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
    });

    await projectEvent(event);

    const tip = await prisma.tip.findUnique({ where: { txHash: 'tip-txhash-1' } });
    expect(tip).not.toBeNull();
    expect(tip?.fromAddress).toBe('GABC12345678901234567890123456789012345678901234567');
    expect(tip?.toAddress).toBe('GDEF12345678901234567890123456789012345678901234567');
    expect(tip?.amountStroops).toBe(1000000n);

    await projectEvent(event);

    const tips = await prisma.tip.findMany({ where: { txHash: 'tip-txhash-1' } });
    expect(tips).toHaveLength(1);
  });

  it('does not advance cursor when event projection fails', async () => {
    const event = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'tip-txhash-invalid',
      value: { invalid: 'data' },
    });

    await projectEvent(event);

    const tip = await prisma.tip.findUnique({ where: { txHash: 'tip-txhash-invalid' } });
    expect(tip).toBeNull();
  });
});

describe('refund projection', () => {
  it('projects a refund event and creates refund record', async () => {
    const tipEvent = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'original-tip-txhash',
      value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
    });
    await projectEvent(tipEvent);

    const tip = await prisma.tip.findUnique({ where: { txHash: 'original-tip-txhash' } });
    expect(tip).not.toBeNull();

    const refundEvent = mockDecodedEvent({
      topic: 'refund',
      txHash: 'refund-txhash',
      value: { tipTxHash: 'original-tip-txhash', amount: '1000000', reason: 'Test refund reason' },
    });
    await projectEvent(refundEvent);

    const refund = await prisma.refund.findFirst({ where: { tipId: tip!.id } });
    expect(refund).not.toBeNull();
    expect(refund?.amount).toBe(1000000n);
    expect(refund?.reason).toBe('Test refund reason');
    expect(refund?.txHash).toBe('refund-txhash');

    const updatedTip = await prisma.tip.findUnique({ where: { id: tip!.id } });
    expect(updatedTip?.status).toBe('REFUNDED');
  });

  it('projects refund event as tuple', async () => {
    const tipEvent = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'tuple-tip-txhash',
      value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
    });
    await projectEvent(tipEvent);

    const refundEvent = mockDecodedEvent({
      topic: 'refund',
      txHash: 'tuple-refund-txhash',
      value: ['tuple-tip-txhash', '1000000', 'Tuple reason'],
    });
    await projectEvent(refundEvent);

    const tip = await prisma.tip.findUnique({ where: { txHash: 'tuple-tip-txhash' } });
    const refund = await prisma.refund.findFirst({ where: { tipId: tip!.id } });
    expect(refund?.reason).toBe('Tuple reason');
  });

  it('handles refund for unknown tip gracefully', async () => {
    const refundEvent = mockDecodedEvent({
      topic: 'refund',
      txHash: 'orphan-refund-txhash',
      value: { tipTxHash: 'nonexistent-tip', amount: '1000000', reason: 'Orphan refund' },
    });

    await projectEvent(refundEvent);

    const refund = await prisma.refund.findFirst({ where: { txHash: 'orphan-refund-txhash' } });
    expect(refund).toBeNull();
  });
});

describe('idempotency', () => {
  it('re-running over same events produces no duplicates', async () => {
    const event = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'idempotent-tip',
      ledger: 100,
      value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
    });

    await projectEvent(event);
    await projectEvent(event);
    await projectEvent(event);

    const tips = await prisma.tip.findMany({ where: { txHash: 'idempotent-tip' } });
    expect(tips).toHaveLength(1);

    const logs = await prisma.eventLog.findMany({ where: { txHash: 'idempotent-tip' } });
    expect(logs).toHaveLength(1);
  });

  it('handles concurrent duplicate insert gracefully', async () => {
    const event = mockDecodedEvent({
      topic: 'tip_sent',
      txHash: 'concurrent-tip',
      value: { from: 'GABC12345678901234567890123456789012345678901234567', to: 'GDEF12345678901234567890123456789012345678901234567', amount: '1000000' },
    });

    await Promise.all([
      projectEvent(event),
      projectEvent(event),
    ]);

    const tips = await prisma.tip.findMany({ where: { txHash: 'concurrent-tip' } });
    expect(tips).toHaveLength(1);
  });
});
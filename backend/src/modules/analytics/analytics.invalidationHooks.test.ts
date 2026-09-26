/**
 * A creator's cached analytics must be invalidated whenever one of their tips
 * becomes (or stops being) CONFIRMED (issue #1265). These tests drive the real
 * write paths and assert the invalidation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvalidate, db } = vi.hoisted(() => ({
  mockInvalidate: vi.fn(),
  db: {
    tip: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    refund: { upsert: vi.fn() },
    eventLog: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./analytics.cache.js', () => ({ invalidateCreatorAnalytics: mockInvalidate }));
vi.mock('../../db/prisma.js', () => ({ prisma: db }));
vi.mock('../../db/redis.js', () => ({ redis: { on: vi.fn() } }));
vi.mock('../../indexer/realtime-publisher.js', () => ({ publishProjection: vi.fn() }));

const { confirmTip } = await import('../tips/tips.service.js');
const { projectEvent } = await import('../../indexer/projections.js');

const pendingTip = {
  id: 'tip-1',
  txHash: 'tx-1',
  ledger: 10,
  fromAddress: 'GFROM',
  toAddress: 'GCREATOR',
  amountStroops: 5_000_000n,
  networkFee: 0n,
  tokenCode: 'XLM',
  isAnonymous: false,
  status: 'PENDING',
  message: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.eventLog.findFirst.mockResolvedValue(null);
  db.eventLog.create.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue(null);
});

describe('tip writes invalidate the creator analytics cache', () => {
  it('confirming a pending tip invalidates the recipient, after the commit', async () => {
    db.tip.findUnique.mockResolvedValue(pendingTip);
    db.tip.update.mockResolvedValue({ ...pendingTip, status: 'CONFIRMED' });

    await confirmTip('tx-1');

    expect(mockInvalidate).toHaveBeenCalledWith('GCREATOR');
    expect(db.$transaction.mock.invocationCallOrder[0]).toBeLessThan(mockInvalidate.mock.invocationCallOrder[0]);
  });

  it('re-confirming an already confirmed tip changes nothing and invalidates nothing', async () => {
    db.tip.findUnique.mockResolvedValue({ ...pendingTip, status: 'CONFIRMED' });

    await confirmTip('tx-1');

    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('an indexed tip invalidates its recipient; a replay does not', async () => {
    db.tip.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingTip);
    db.tip.create.mockResolvedValue({});
    const event = {
      topic: 'tip_sent',
      ledger: 10,
      txHash: 'tx-new',
      pagingToken: '10-1',
      value: { from: 'GFROM', to: 'GCREATOR', amount: '5000000' },
    };

    await projectEvent(event);
    expect(mockInvalidate).toHaveBeenCalledWith('GCREATOR');

    mockInvalidate.mockClear();
    db.eventLog.findFirst.mockResolvedValue({ id: 'seen' });
    await projectEvent(event); // replay: tip already exists
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('an indexed refund invalidates the refunded tip recipient', async () => {
    db.tip.findUnique.mockResolvedValue({ ...pendingTip, status: 'CONFIRMED' });
    db.refund.upsert.mockResolvedValue({});
    db.tip.update.mockResolvedValue({});

    await projectEvent({
      topic: 'tip_refund',
      ledger: 11,
      txHash: 'refund-tx',
      pagingToken: '11-1',
      value: { tipTxHash: 'tx-1', amount: '5000000', reason: 'duplicate' },
    });

    expect(mockInvalidate).toHaveBeenCalledWith('GCREATOR');
  });
});

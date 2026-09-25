import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  seen: vi.fn(),
  createEvent: vi.fn(),
  user: vi.fn(),
  find: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('../db/prisma.js', () => ({
  prisma: {
    eventLog: { findFirst: mocks.seen, create: mocks.createEvent },
    user: { upsert: mocks.user },
    subscription: { findUnique: mocks.find, upsert: mocks.upsert, updateMany: mocks.update },
  },
}));
vi.mock('./realtime-publisher.js', () => ({ publishProjection: vi.fn() }));
vi.mock('../realtime/index.js', () => ({ emitNotificationCreated: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({
  createNotification: mocks.notify,
}));
vi.mock('../common/observability/metrics.js', () => ({
  recordUnknownEvent: vi.fn(),
  recordIndexerLedgerProcessed: vi.fn(),
}));
import { projectEvent } from './projections.js';

const boundary = new Date('2026-10-01T00:00:00Z');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.seen.mockResolvedValue(null);
  mocks.user.mockImplementation(({ where }) =>
    Promise.resolve({ id: where.stellarAddress === 'GTIPPER' ? 'tipper' : 'creator' }),
  );
  mocks.find.mockResolvedValue({
    interval: 'WEEKLY',
    nextChargeAt: boundary,
    pendingInterval: 'MONTHLY',
  });
});
async function event(topic: string, value: unknown) {
  return projectEvent({ topic, value, ledger: 100, txHash: 'tx1', pagingToken: '100-1' });
}
describe('subscription period projections', () => {
  it('records versioned scheduled terms separately from current billing terms', async () => {
    await event('sub_change', [1, 'GTIPPER', 'GCREATOR', '20000000', 30, boundary.getTime() / 1000]);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'sub_tipper_creator', status: 'ACTIVE' },
      data: {
        pendingAmountStroops: 20000000n,
        pendingInterval: 'MONTHLY',
        changeEffectiveAt: boundary,
      },
    });
  });
  it('applies new interval on confirmed execution and clears pending terms', async () => {
    await event('sub_exec', [1, 'GTIPPER', 'GCREATOR', '20000000']);
    expect(mocks.upsert.mock.calls[0][0].update).toEqual({
      amountStroops: 20000000n,
      status: 'ACTIVE',
      interval: 'MONTHLY',
      chargeFailureCount: 0,
      dunningStartedAt: null,
      lastChargeFailureReason: null,
      nextChargeAt: new Date('2026-10-31T00:00:00Z'),
      pendingAmountStroops: null,
      pendingInterval: null,
      changeEffectiveAt: null,
      nextChargeRetryAt: null,
      chargeAttemptStartedAt: null,
    });
  });
  it('does not apply a repeated execution twice', async () => {
    mocks.seen.mockResolvedValue({ id: 'already-indexed' });
    await event('sub_exec', [1, 'GTIPPER', 'GCREATOR', '20000000']);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('cancels pending terms on a confirmed cancellation', async () => {
    await event('sub_cancel', [1, 'GTIPPER', 'GCREATOR']);
    expect(mocks.update.mock.calls[0][0].data).toEqual({
      status: 'CANCELLED',
      pendingAmountStroops: null,
      pendingInterval: null,
      changeEffectiveAt: null,
      nextChargeRetryAt: null,
      chargeAttemptStartedAt: null,
    });
  });
});

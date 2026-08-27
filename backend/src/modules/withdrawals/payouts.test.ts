import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPayoutFindUnique,
  mockPayoutUpsert,
  mockPayoutUpdate,
  mockPayoutFindMany,
  mockTipAggregate,
  mockWithdrawalAggregate,
  mockUserFindUnique,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockPayoutFindUnique: vi.fn(),
  mockPayoutUpsert: vi.fn(),
  mockPayoutUpdate: vi.fn(),
  mockPayoutFindMany: vi.fn(),
  mockTipAggregate: vi.fn(),
  mockWithdrawalAggregate: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    payoutSchedule: {
      findUnique: mockPayoutFindUnique,
      upsert: mockPayoutUpsert,
      update: mockPayoutUpdate,
      findMany: mockPayoutFindMany,
    },
    user: { findUnique: mockUserFindUnique },
    tip: { aggregate: mockTipAggregate },
    withdrawal: { aggregate: mockWithdrawalAggregate },
  },
}));

vi.mock('../../modules/notifications/notifications.service.js', () => ({
  createNotification: mockCreateNotification,
}));

import {
  advanceScheduleAfterSuccess,
  backoffNextRun,
  shouldPauseAfterFailures,
  attemptPayout,
  upsertPayoutSchedule,
  listEligiblePayouts,
} from './payouts.service.js';

const baseSchedule = {
  id: 'ps-1',
  userId: 'user-1',
  thresholdStroops: BigInt(10_000_000),
  cadence: 'MANUAL' as const,
  consecutiveFailures: 0,
  user: { id: 'user-1', stellarAddress: 'GA1' },
};

const now = new Date('2026-01-01T00:00:00Z');

describe('schedule helpers', () => {
  it('advances by cadence after success', () => {
    expect(advanceScheduleAfterSuccess('DAILY', now).getUTCDate()).toBe(2);
    expect(advanceScheduleAfterSuccess('WEEKLY', now).getUTCDate()).toBe(8);
    expect(advanceScheduleAfterSuccess('MONTHLY', now).getUTCMonth()).toBe(1);
    // MANUAL uses a 1-day cooldown
    expect(advanceScheduleAfterSuccess('MANUAL', now).getUTCDate()).toBe(2);
  });

  it('applies exponential backoff on failure', () => {
    const base = 60;
    const f1 = backoffNextRun(1, now, base).getTime();
    const f2 = backoffNextRun(2, now, base).getTime();
    const f3 = backoffNextRun(3, now, base).getTime();
    expect(f1 - now.getTime()).toBe(60_000);
    expect(f2 - now.getTime()).toBe(120_000);
    expect(f3 - now.getTime()).toBe(240_000);
    expect(f2 - f1).toBeLessThan(f3 - f2);
  });

  it('pauses only after max attempts', () => {
    expect(shouldPauseAfterFailures(4, 5)).toBe(false);
    expect(shouldPauseAfterFailures(5, 5)).toBe(true);
  });
});

describe('attemptPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTipAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(50_000_000) } });
    mockWithdrawalAggregate.mockResolvedValue({ _sum: { amount: BigInt(0) } });
    mockCreateNotification.mockResolvedValue(null);
  });

  it('skips when balance is below threshold', async () => {
    mockTipAggregate.mockResolvedValue({ _sum: { amountStroops: BigInt(1_000_000) } });
    const result = await attemptPayout({ ...baseSchedule });
    expect(result.status).toBe('SKIPPED');
    expect(mockPayoutUpdate).toHaveBeenCalled();
  });

  it('succeeds and resets failures when submit works', async () => {
    const submit = vi.fn().mockResolvedValue({ txHash: 'tx1', netAmountStroops: '49000000' });
    const result = await attemptPayout({ ...baseSchedule }, now, submit);
    expect(result.status).toBe('SUCCESS');
    expect(result.txHash).toBe('tx1');
    expect(mockPayoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 0, lastStatus: 'SUCCESS' }) }),
    );
  });

  it('retries with backoff on failure', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await attemptPayout({ ...baseSchedule, consecutiveFailures: 0 }, now, submit);
    expect(result.status).toBe('FAILED');
    expect(result.paused).toBe(false);
    expect(mockPayoutUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 1 }) }),
    );
  });

  it('pauses and notifies the creator after repeated failure', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await attemptPayout({ ...baseSchedule, consecutiveFailures: 4 }, now, submit);
    expect(result.status).toBe('FAILED');
    expect(result.paused).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith('user-1', 'payout_failed', expect.any(Object));
  });
});

describe('upsertPayoutSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' });
    mockPayoutFindUnique.mockResolvedValue(null);
    mockPayoutUpsert.mockImplementation(async (args: any) => ({
      ...(args.create ?? args.update),
    }));
  });

  it('creates a schedule and resets failures when enabling', async () => {
    mockPayoutFindUnique.mockResolvedValue(null);
    const res = await upsertPayoutSchedule('user-1', { enabled: true, thresholdStroops: '20000000', cadence: 'WEEKLY' });
    expect(res.enabled).toBe(true);
    expect(res.paused).toBe(false);
    expect(res.consecutiveFailures).toBe(0);
  });

  it('opts out by disabling without throwing', async () => {
    mockPayoutFindUnique.mockResolvedValue({ id: 'ps-1', userId: 'user-1', enabled: true });
    const res = await upsertPayoutSchedule('user-1', { enabled: false });
    expect(res.enabled).toBe(false);
  });
});

describe('listEligiblePayouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only returns enabled, non-paused, due schedules of active creators', async () => {
    mockPayoutFindMany.mockResolvedValue([{ id: 'ps-1', user: { id: 'u1', stellarAddress: 'GA1' } }]);
    const res = await listEligiblePayouts(now);
    expect(res).toHaveLength(1);
    expect(mockPayoutFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          paused: false,
          nextRunAt: { lte: now },
          user: expect.objectContaining({ deletedAt: null, deactivatedAt: null, blockedAt: null, flaggedUnverified: false }),
        }),
      }),
    );
  });
});

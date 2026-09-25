import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindMany, mockUpdateMany, mockCharge, mockSystemNotification } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockCharge: vi.fn(),
  mockSystemNotification: vi.fn(),
}));

vi.mock('../db/prisma.js', () => ({
  prisma: {
    subscription: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock('../db/redis.js', () => ({ redis: {} }));
vi.mock('../common/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../modules/subscriptions/subscriptions.service.js', () => ({
  chargeSubscriptionOnChain: mockCharge,
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({
  createSystemNotification: mockSystemNotification,
}));

import {
  getNextDunningRetryAt,
  processDueSubscriptions,
} from './subscriptionCharge.worker.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DUE = new Date('2026-09-20T12:00:00.000Z');

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_01',
    tipperId: 'tipper-id',
    creatorId: 'creator-id',
    interval: 'WEEKLY',
    nextChargeAt: DUE,
    status: 'ACTIVE',
    chargeFailureCount: 0,
    dunningStartedAt: null,
    nextChargeRetryAt: null,
    chargeAttemptStartedAt: null,
    tipper: { stellarAddress: 'GSUBSCRIBER' },
    creator: { stellarAddress: 'GCREATOR' },
    ...overrides,
  };
}

function persistedData() {
  return mockUpdateMany.mock.calls.at(-1)?.[0].data;
}

describe('subscription dunning schedule', () => {
  it('uses exact day 1, day 3, and day 7 retry dates from dunning start', () => {
    const start = new Date('2026-09-01T08:30:00.000Z');
    expect(getNextDunningRetryAt(start, 1)?.toISOString()).toBe('2026-09-02T08:30:00.000Z');
    expect(getNextDunningRetryAt(start, 2)?.toISOString()).toBe('2026-09-04T08:30:00.000Z');
    expect(getNextDunningRetryAt(start, 3)?.toISOString()).toBe('2026-09-08T08:30:00.000Z');
    expect(getNextDunningRetryAt(start, 4)).toBeNull();
  });


});

describe('processDueSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockCharge.mockResolvedValue(undefined);
    mockSystemNotification.mockResolvedValue({});
  });

  it('returns zero when no subscriptions are due and queries only actionable states', async () => {
    await expect(processDueSubscriptions({ now: NOW })).resolves.toEqual({
      processed: 0,
      failed: 0,
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        AND: [
          {
            OR: [
              { status: 'ACTIVE', nextChargeAt: { lte: NOW } },
              { status: 'PAST_DUE', nextChargeRetryAt: { lte: NOW } },
            ],
          },
          {
            OR: [
              { chargeAttemptStartedAt: null },
              { chargeAttemptStartedAt: { lte: new Date('2026-09-25T11:45:00.000Z') } },
            ],
          },
        ],
      },
      include: {
        tipper: { select: { stellarAddress: true } },
        creator: { select: { stellarAddress: true } },
      },
    });
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('confirms on-chain without advancing periods before the indexer', async () => {
    mockFindMany.mockResolvedValue([subscription()]);

    await expect(processDueSubscriptions({ now: NOW })).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(mockCharge).toHaveBeenCalledWith('GSUBSCRIBER', 'GCREATOR');
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(persistedData()).toEqual({ chargeAttemptStartedAt: NOW });
    expect(mockSystemNotification).not.toHaveBeenCalled();
  });

  it.each([
    {
      priorFailures: 0,
      dunningStartedAt: null,
      expectedRetry: '2026-09-26T12:00:00.000Z',
      label: 'first',
    },
    {
      priorFailures: 1,
      dunningStartedAt: new Date('2026-09-20T12:00:00.000Z'),
      expectedRetry: '2026-09-23T12:00:00.000Z',
      label: 'second',
    },
    {
      priorFailures: 2,
      dunningStartedAt: new Date('2026-09-20T12:00:00.000Z'),
      expectedRetry: '2026-09-27T12:00:00.000Z',
      label: 'third',
    },
  ])(
    'persists and notifies the $label retryable failure',
    async ({ priorFailures, dunningStartedAt, expectedRetry }) => {
      mockFindMany.mockResolvedValue([
        subscription({
          status: priorFailures === 0 ? 'ACTIVE' : 'PAST_DUE',
          chargeFailureCount: priorFailures,
          dunningStartedAt,
          nextChargeRetryAt: priorFailures === 0 ? null : NOW,
        }),
      ]);
      mockCharge.mockRejectedValue(new Error('Error(Contract, #14)'));

      await processDueSubscriptions({ now: NOW });

      expect(persistedData()).toEqual({
        status: 'PAST_DUE',
        chargeFailureCount: priorFailures + 1,
        dunningStartedAt: dunningStartedAt ?? NOW,
        nextChargeRetryAt: new Date(expectedRetry),
        lastChargeFailureReason: 'There is not enough balance for this subscription charge.',
        chargeAttemptStartedAt: null,
      });
      expect(mockSystemNotification).toHaveBeenCalledTimes(1);
      expect(mockSystemNotification).toHaveBeenCalledWith(
        'tipper-id',
        'subscription_charge_failed',
        expect.objectContaining({
          reason: 'There is not enough balance for this subscription charge.',
          failureCount: priorFailures + 1,
          nextRetryAt: expectedRetry,
          terminal: false,
        }),
      );
    },
  );

  it('transitions to FAILED and notifies both parties after the day-7 retry fails', async () => {
    const start = new Date('2026-09-18T12:00:00.000Z');
    mockFindMany.mockResolvedValue([
      subscription({
        status: 'PAST_DUE',
        chargeFailureCount: 3,
        dunningStartedAt: start,
        nextChargeRetryAt: NOW,
      }),
    ]);
    mockCharge.mockRejectedValue(new Error('Error(Contract, #14)'));

    await expect(processDueSubscriptions({ now: NOW })).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    expect(persistedData()).toMatchObject({
      status: 'FAILED',
      chargeFailureCount: 4,
      dunningStartedAt: start,
      nextChargeRetryAt: null,
    });
    expect(mockSystemNotification).toHaveBeenNthCalledWith(
      1,
      'tipper-id',
      'subscription_charge_failed',
      expect.objectContaining({ failureCount: 4, terminal: true, nextRetryAt: null }),
    );
    expect(mockSystemNotification).toHaveBeenNthCalledWith(
      2,
      'creator-id',
      'subscription_failed',
      expect.objectContaining({ failureCount: 4, terminal: true, nextRetryAt: null }),
    );
  });

  it('makes a permanent not-found failure terminal immediately without a retry', async () => {
    mockFindMany.mockResolvedValue([subscription()]);
    mockCharge.mockRejectedValue(new Error('HostError: Error(Contract, #17)'));

    await processDueSubscriptions({ now: NOW });

    expect(persistedData()).toMatchObject({
      status: 'FAILED',
      chargeFailureCount: 1,
      nextChargeRetryAt: null,
      lastChargeFailureReason: 'The subscription authorization no longer exists.',
    });
    expect(mockSystemNotification).toHaveBeenCalledTimes(2);
  });

  it.each([
    { priorFailures: 1, label: 'day-1' },
    { priorFailures: 2, label: 'later' },
  ])('retains the claim until the indexer projects a successful $label retry', async ({ priorFailures }) => {
    mockFindMany.mockResolvedValue([
      subscription({
        status: 'PAST_DUE',
        chargeFailureCount: priorFailures,
        dunningStartedAt: new Date('2026-09-24T12:00:00.000Z'),
        nextChargeRetryAt: NOW,
      }),
    ]);

    await processDueSubscriptions({ now: NOW });

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(persistedData()).toEqual({ chargeAttemptStartedAt: NOW });
    expect(mockSystemNotification).not.toHaveBeenCalled();
  });

  it('does not select FAILED, CANCELLED, PAUSED, or EXPIRED subscriptions', async () => {
    mockFindMany.mockResolvedValue([]);
    await processDueSubscriptions({ now: NOW });
    const query = mockFindMany.mock.calls[0][0];
    expect(JSON.stringify(query.where)).not.toContain('FAILED');
    expect(JSON.stringify(query.where)).not.toContain('CANCELLED');
    expect(JSON.stringify(query.where)).not.toContain('PAUSED');
    expect(JSON.stringify(query.where)).not.toContain('EXPIRED');
  });

  it('keeps notification payloads safe when raw failures contain secrets or XDR', async () => {
    mockFindMany.mockResolvedValue([subscription()]);
    mockCharge.mockRejectedValue(new Error('keeper=SSECRET rawXdr=AAAA rpc exploded'));

    await processDueSubscriptions({ now: NOW });

    const payload = mockSystemNotification.mock.calls[0][2];
    expect(payload.reason).toBe('A temporary network error prevented the subscription charge.');
    expect(JSON.stringify(payload)).not.toMatch(/SSECRET|AAAA|keeper|rawXdr/i);
  });

  it('continues processing after another subscription fails', async () => {
    mockFindMany.mockResolvedValue([
      subscription({ id: 'sub_fail' }),
      subscription({ id: 'sub_ok', tipper: { stellarAddress: 'GSECOND' } }),
    ]);
    mockCharge.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(undefined);

    await expect(processDueSubscriptions({ now: NOW })).resolves.toEqual({
      processed: 1,
      failed: 1,
    });
    expect(mockCharge).toHaveBeenCalledTimes(2);
  });

  it('uses the persisted claim to avoid duplicate charges in one sweep', async () => {
    const sub = subscription();
    mockFindMany.mockResolvedValue([sub, sub]);
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await processDueSubscriptions({ now: NOW });

    expect(mockCharge).toHaveBeenCalledTimes(1);
  });

  it('persists financial state even when notification delivery fails', async () => {
    mockFindMany.mockResolvedValue([subscription()]);
    mockCharge.mockRejectedValue(new Error('Error(Contract, #14)'));
    mockSystemNotification.mockRejectedValue(new Error('notification store unavailable'));

    await expect(processDueSubscriptions({ now: NOW })).resolves.toEqual({
      processed: 0,
      failed: 1,
    });
    expect(persistedData()).toMatchObject({ status: 'PAST_DUE', chargeFailureCount: 1 });
  });
});

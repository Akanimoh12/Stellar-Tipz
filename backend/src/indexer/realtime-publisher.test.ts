import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockPublish, mockLoggerError } = vi.hoisted(() => ({
  mockPublish: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('../db/redis.js', () => ({
  redis: { publish: mockPublish },
}));

vi.mock('../common/utils/logger.js', () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

import { publishProjection, REALTIME_PROJECTION_CHANNEL } from './realtime-publisher.js';
import type { DecodedEvent } from './sorobanClient.js';

const tipEvent: DecodedEvent = {
  ledger: 100,
  txHash: 'fixture-tip-tx-001',
  pagingToken: '100-0',
  topic: 'tip_sent',
  value: { from: 'GAAA', to: 'GBBB', amount: '1000000', message: 'Thanks!' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishProjection', () => {
  it('publishes a JSON-encoded message to the realtime channel', async () => {
    mockPublish.mockResolvedValue(1);

    await publishProjection(tipEvent);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const [channel, payload] = mockPublish.mock.calls[0] as [string, string];
    expect(channel).toBe(REALTIME_PROJECTION_CHANNEL);

    const parsed = JSON.parse(payload);
    expect(parsed).toMatchObject({
      topic: 'tip_sent',
      ledger: 100,
      txHash: 'fixture-tip-tx-001',
      data: tipEvent.value,
    });
    expect(typeof parsed.publishedAt).toBe('number');
  });

  it('falls back to null data when the event value is nullish', async () => {
    mockPublish.mockResolvedValue(1);

    await publishProjection({ ...tipEvent, value: undefined });

    const [, payload] = mockPublish.mock.calls[0] as [string, string];
    expect(JSON.parse(payload).data).toBeNull();
  });

  it('swallows redis errors instead of throwing, and logs them', async () => {
    mockPublish.mockRejectedValue(new Error('redis connection lost'));

    await expect(publishProjection(tipEvent)).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledOnce();
  });

  it('publishes a fresh message (independent publishedAt) on every call, even for the same event', async () => {
    mockPublish.mockResolvedValue(1);

    await publishProjection(tipEvent);
    await publishProjection(tipEvent);

    expect(mockPublish).toHaveBeenCalledTimes(2);
  });
});
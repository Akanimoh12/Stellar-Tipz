import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  attemptUpsert: vi.fn(),
  deliveryUpdate: vi.fn(),
  transaction: vi.fn(),
  disableAndNotify: vi.fn(),
  recordDeadLetter: vi.fn(),
  safeWebhookFetch: vi.fn(),
}));

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: class {
      add = mocks.queueAdd;
    },
    Worker: class {
      on = vi.fn();
    },
  };
});

vi.mock('../db/redis.js', () => ({ redis: {} }));
vi.mock('../db/prisma.js', () => ({
  prisma: {
    webhookDeliveryAttempt: { upsert: mocks.attemptUpsert },
    webhookDelivery: { update: mocks.deliveryUpdate },
    $transaction: mocks.transaction,
  },
}));
vi.mock('../common/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../modules/webhooks/webhooks.url-safety.js', () => ({
  safeWebhookFetch: mocks.safeWebhookFetch,
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({
  disableWebhookSubscriptionAndNotify: mocks.disableAndNotify,
}));
vi.mock('./deadLetter.js', () => ({
  attachDeadLetterHandler: vi.fn(),
  recordDeadLetter: mocks.recordDeadLetter,
}));

import { UnrecoverableError } from 'bullmq';
import {
  WEBHOOK_DELIVERY_TIMEOUT_MS,
  WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES,
  calculateWebhookRetryDelay,
  classifyWebhookResponse,
  processWebhookDelivery,
  readResponseBodyExcerpt,
  scheduleWebhookDelivery,
  webhookBackoffStrategy,
  type WebhookDeliveryPayload,
} from './webhookDelivery.js';

function job(attemptsMade = 0, attempts = 5) {
  return {
    id: 'job-1',
    name: 'deliver',
    attemptsMade,
    opts: { attempts },
    data: {
      url: 'https://example.com/hook',
      payload: { event: 'tip.received', tipId: 'tip-1' },
      secret: 'test-secret',
      deliveryId: 'delivery-1',
      subscriptionId: 'subscription-1',
    },
  } as never;
}

function latestAggregateUpdate() {
  return mocks.deliveryUpdate.mock.calls.at(-1)?.[0].data;
}

describe('webhook delivery retry policy (issue #1278)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attemptUpsert.mockResolvedValue({});
    mocks.deliveryUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    mocks.disableAndNotify.mockResolvedValue(true);
    mocks.recordDeadLetter.mockResolvedValue(undefined);
    mocks.safeWebhookFetch.mockImplementation((url, init) => fetch(url, init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('persists one successful attempt and clears retry state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('accepted', { status: 200 })));

    await processWebhookDelivery(job());

    expect(mocks.attemptUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.attemptUpsert.mock.calls[0][0].create).toMatchObject({
      deliveryId: 'delivery-1',
      attemptNumber: 1,
      responseCode: 200,
      responseBodyExcerpt: 'accepted',
      errorReason: null,
    });
    expect(latestAggregateUpdate()).toMatchObject({
      status: 'SUCCESS',
      responseCode: 200,
      attempts: 1,
      nextAttemptAt: null,
    });
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'invalid payload'],
    [404, 'not found'],
  ])('treats HTTP %i as permanent, records its body, and stops retries', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));

    const result = processWebhookDelivery(job());

    await expect(result).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.attemptUpsert.mock.calls[0][0].create).toMatchObject({
      attemptNumber: 1,
      responseCode: status,
      responseBodyExcerpt: body,
    });
    expect(latestAggregateUpdate()).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      nextAttemptAt: null,
    });
    expect(mocks.disableAndNotify).toHaveBeenCalledTimes(1);
    expect(mocks.recordDeadLetter).not.toHaveBeenCalled();
  });

  it('never retries and dead-letters a known permanent 4xx when state persistence fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('invalid', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(processWebhookDelivery(job())).rejects.toBeInstanceOf(UnrecoverableError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
    expect(mocks.recordDeadLetter).toHaveBeenCalledTimes(1);
    const [queue, deadLetterJob, deadLetterError] = mocks.recordDeadLetter.mock.calls[0];
    expect(queue).toBe('webhook-delivery');
    expect(deadLetterJob).toMatchObject({
      id: 'job-1',
      data: {
        deliveryId: 'delivery-1',
        subscriptionId: 'subscription-1',
        failureKind: 'permanent-webhook-state-persistence',
        httpFailure: 'HTTP 400',
      },
      attemptsMade: 1,
    });
    expect(JSON.stringify(deadLetterJob)).not.toContain('test-secret');
    expect(JSON.stringify(deadLetterJob)).not.toContain('https://example.com/hook');
    expect(deadLetterError).toMatchObject({
      message: expect.stringContaining('state persistence failed: database unavailable'),
    });
  });

  it('keeps HTTP 429 retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })));

    const result = processWebhookDelivery(job());

    await expect(result).rejects.toThrow('HTTP 429');
    await expect(result).rejects.not.toBeInstanceOf(UnrecoverableError);
    expect(latestAggregateUpdate()).toMatchObject({
      status: 'PENDING',
      responseCode: 429,
      attempts: 1,
    });
    expect(latestAggregateUpdate().nextAttemptAt).toBeInstanceOf(Date);
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
  });

  it.each([500, 503])('keeps HTTP %i retryable while attempts remain', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('temporary', { status })));

    await expect(processWebhookDelivery(job())).rejects.toThrow(`HTTP ${status}`);

    expect(latestAggregateUpdate()).toMatchObject({
      status: 'PENDING',
      responseCode: status,
      attempts: 1,
    });
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
  });

  it('keeps network failures retryable and records their reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection reset')));

    await expect(processWebhookDelivery(job())).rejects.toThrow('connection reset');

    expect(mocks.attemptUpsert.mock.calls[0][0].create).toMatchObject({
      responseCode: null,
      responseBodyExcerpt: null,
      errorReason: 'connection reset',
    });
    expect(latestAggregateUpdate().status).toBe('PENDING');
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
  });

  it('enforces the timeout, records it as retryable, and clears the timer', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ),
    );

    const delivery = processWebhookDelivery(job());
    const rejection = expect(delivery).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(WEBHOOK_DELIVERY_TIMEOUT_MS);
    await rejection;

    expect(mocks.attemptUpsert.mock.calls[0][0].create).toMatchObject({
      responseCode: null,
      responseBodyExcerpt: null,
      errorReason: `Delivery timed out after ${WEBHOOK_DELIVERY_TIMEOUT_MS}ms`,
    });
    expect(latestAggregateUpdate().status).toBe('PENDING');
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses deterministic exponential backoff with 50% subtractive jitter', () => {
    expect([1, 2, 3, 4].map((retry) => calculateWebhookRetryDelay(retry, 0))).toEqual([
      1_000, 2_000, 4_000, 8_000,
    ]);
    expect([1, 2, 3, 4].map((retry) => calculateWebhookRetryDelay(retry, 1))).toEqual([
      1_999, 3_999, 7_999, 15_999,
    ]);

    const first = webhookBackoffStrategy(2, 'webhook-exponential-jitter', new Error(), job());
    const second = webhookBackoffStrategy(2, 'webhook-exponential-jitter', new Error(), job());
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(2_000);
    expect(first).toBeLessThan(4_000);
  });

  it('stores each failed and recovered attempt separately without disabling the subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    await expect(processWebhookDelivery(job(0))).rejects.toThrow('HTTP 503');
    await processWebhookDelivery(job(1));

    expect(mocks.attemptUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.attemptUpsert.mock.calls[0][0].create).toMatchObject({
      attemptNumber: 1,
      responseCode: 503,
      responseBodyExcerpt: 'unavailable',
    });
    expect(mocks.attemptUpsert.mock.calls[1][0].create).toMatchObject({
      attemptNumber: 2,
      responseCode: 204,
    });
    expect(latestAggregateUpdate()).toMatchObject({
      status: 'SUCCESS',
      responseCode: 204,
      attempts: 2,
      nextAttemptAt: null,
    });
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();
  });

  it('auto-disables and notifies once only when a retryable failure exhausts attempts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));

    await expect(processWebhookDelivery(job(3))).rejects.toThrow('HTTP 503');
    expect(latestAggregateUpdate().status).toBe('PENDING');
    expect(mocks.disableAndNotify).not.toHaveBeenCalled();

    await expect(processWebhookDelivery(job(4))).rejects.toThrow('HTTP 503');
    expect(latestAggregateUpdate()).toMatchObject({
      status: 'FAILED',
      attempts: 5,
      nextAttemptAt: null,
    });
    expect(mocks.disableAndNotify).toHaveBeenCalledTimes(1);
    expect(mocks.disableAndNotify).toHaveBeenCalledWith('subscription-1', 'delivery-1', 'HTTP 503');
  });

  it('truncates response excerpts to the configured byte limit', async () => {
    const excerpt = await readResponseBodyExcerpt(
      new Response('x'.repeat(WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES * 2)),
    );
    const multibyteExcerpt = await readResponseBodyExcerpt(
      new Response('€'.repeat(WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES)),
    );

    expect(Buffer.byteLength(excerpt ?? '')).toBe(WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES);
    expect(Buffer.byteLength(multibyteExcerpt ?? '')).toBeLessThanOrEqual(
      WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES,
    );
  });

  it('preserves HMAC signing and does not persist the secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await processWebhookDelivery(job());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Stellar-Tipz-Signature': expect.stringMatching(/^sha256=[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(JSON.stringify(mocks.attemptUpsert.mock.calls)).not.toContain('test-secret');
  });

  it('requires and schedules the persistent delivery identity with the queue job', async () => {
    expectTypeOf<WebhookDeliveryPayload>().toMatchTypeOf<{
      deliveryId: string;
      subscriptionId: string;
    }>();

    await scheduleWebhookDelivery(
      'https://example.com/hook',
      { event: 'tip.received' },
      {
        deliveryId: 'delivery-1',
        subscriptionId: 'subscription-1',
      },
      'secret',
    );

    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'deliver',
      {
        url: 'https://example.com/hook',
        payload: { event: 'tip.received' },
        secret: 'secret',
        deliveryId: 'delivery-1',
        subscriptionId: 'subscription-1',
      },
      { jobId: 'delivery-1' },
    );
  });

  it('classifies the permanent/retryable boundary explicitly', () => {
    expect(classifyWebhookResponse(200)).toBe('success');
    expect(classifyWebhookResponse(400)).toBe('permanent');
    expect(classifyWebhookResponse(404)).toBe('permanent');
    expect(classifyWebhookResponse(429)).toBe('retryable');
    expect(classifyWebhookResponse(500)).toBe('retryable');
  });
});

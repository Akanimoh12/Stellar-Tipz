import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { 
  webhookDeliveryQueue, 
  webhookDeliveryWorker, 
  scheduleWebhookDelivery 
} from '../../src/jobs/webhookDelivery.js';
import { redis } from '../../src/db/redis.js';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Webhook Delivery Job', () => {
  beforeAll(async () => {
    // Wait for worker to be ready
    await webhookDeliveryWorker.waitUntilReady();
  });

  afterAll(async () => {
    await webhookDeliveryQueue.close();
    await webhookDeliveryWorker.close();
    await redis.quit();
  });

  beforeEach(async () => {
    fetchMock.mockReset();
    // Clear the queue before each test
    await webhookDeliveryQueue.drain();
  });

  it('successfully delivers a webhook and processes the job', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const url = 'https://example.com/webhook';
    const payload = { event: 'test_event', data: { id: 123 } };

    // Schedule the delivery
    await scheduleWebhookDelivery(url, payload);

    // Wait for the job to complete
    const completedJob = await new Promise((resolve) => {
      webhookDeliveryWorker.once('completed', (job) => {
        resolve(job);
      });
    });

    expect(completedJob).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'Stellar-Tipz-Webhook-Bot/1.0',
        }),
      })
    );
  });

  it('includes an HMAC signature when a secret is provided', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const url = 'https://example.com/webhook-secure';
    const payload = { event: 'secure_event' };
    const secret = 'my-super-secret';

    await scheduleWebhookDelivery(url, payload, secret);

    await new Promise((resolve) => {
      webhookDeliveryWorker.once('completed', (job) => {
        resolve(job);
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Signature': expect.stringMatching(/^sha256=[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('fails the job and triggers a retry when the webhook endpoint returns a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const url = 'https://example.com/webhook-fail';
    const payload = { event: 'fail_event' };

    await scheduleWebhookDelivery(url, payload);

    // Wait for the job to fail
    const failedJob = await new Promise((resolve) => {
      webhookDeliveryWorker.once('failed', (job) => {
        resolve(job);
      });
    });

    expect(failedJob).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

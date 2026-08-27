import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../db/redis.js';
import { logger } from '../common/utils/logger.js';
import crypto from 'node:crypto';
import { attachDeadLetterHandler } from './deadLetter.js';

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export interface WebhookDeliveryPayload {
  url: string;
  payload: Record<string, unknown>;
  secret?: string; // Optional secret to sign the payload (HMAC)
}

/**
 * Queue instance for dispatching webhook deliveries.
 */
export const webhookDeliveryQueue = new Queue<WebhookDeliveryPayload>(WEBHOOK_DELIVERY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // keep completed jobs for 1 hour
      count: 1000, // keep at most 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // keep failed jobs for 24 hours
    },
  },
});

/**
 * Helper to schedule a webhook delivery.
 */
export async function scheduleWebhookDelivery(
  url: string,
  payload: Record<string, unknown>,
  secret?: string
): Promise<void> {
  await webhookDeliveryQueue.add('deliver', { url, payload, secret });
}

/**
 * Worker to process webhook deliveries.
 */
export const webhookDeliveryWorker = new Worker<WebhookDeliveryPayload>(
  WEBHOOK_DELIVERY_QUEUE,
  async (job: Job<WebhookDeliveryPayload>) => {
    const { url, payload, secret } = job.data;
    
    logger.info({ jobId: job.id, url }, 'Starting webhook delivery');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Stellar-Tipz-Webhook-Bot/1.0',
    };

    const body = JSON.stringify(payload);

    // If a secret is provided, sign the payload with HMAC SHA256
    if (secret) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(body);
      headers['X-Signature'] = `sha256=${hmac.digest('hex')}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10 second timeout

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // Throwing an error automatically triggers BullMQ backoff retry
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      logger.info({ jobId: job.id, url, status: response.status }, 'Webhook delivered successfully');
    } catch (error: unknown) {
      logger.warn({ jobId: job.id, url, error: error instanceof Error ? error.message : error }, 'Webhook delivery failed');
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process up to 5 webhooks concurrently
  }
);

webhookDeliveryWorker.on('failed', (job: Job<WebhookDeliveryPayload> | undefined, err: Error) => {
  if (job) {
    logger.error({ jobId: job.id, url: job.data.url, err: err.message }, 'Webhook job failed permanently or retrying');
  } else {
    logger.error({ err: err.message }, 'Webhook worker error');
  }
});

attachDeadLetterHandler(webhookDeliveryWorker, WEBHOOK_DELIVERY_QUEUE);

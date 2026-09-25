import crypto from 'node:crypto';
import { Job, Queue, UnrecoverableError, Worker, type BackoffStrategy } from 'bullmq';
import { logger } from '../common/utils/logger.js';
import { prisma } from '../db/prisma.js';
import { redis } from '../db/redis.js';
import { disableWebhookSubscriptionAndNotify } from '../modules/notifications/notifications.service.js';
import { createWebhookSigningHeaders } from '../modules/webhooks/webhooks.signing.js';
import { safeWebhookFetch } from '../modules/webhooks/webhooks.url-safety.js';
import { attachDeadLetterHandler, recordDeadLetter } from './deadLetter.js';

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';
export const WEBHOOK_MAX_ATTEMPTS = 5;
export const WEBHOOK_BACKOFF_BASE_MS = 2_000;
export const WEBHOOK_BACKOFF_JITTER = 0.5;
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 10_000;
export const WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES = 1_024;
export const WEBHOOK_BACKOFF_TYPE = 'webhook-exponential-jitter';

export interface WebhookDeliveryPayload {
  url: string;
  payload: unknown;
  secret?: string;
  deliveryId: string;
  subscriptionId: string;
}

export interface WebhookDeliveryIdentity {
  deliveryId: string;
  subscriptionId: string;
}

export type WebhookResponseClassification = 'success' | 'permanent' | 'retryable';

/** Classifies an HTTP response without treating rate limiting as permanent. */
export function classifyWebhookResponse(status: number): WebhookResponseClassification {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400 && status < 500 && status !== 429) return 'permanent';
  return 'retryable';
}

/**
 * Exponential retry delay with subtractive jitter. `retryNumber` starts at 1;
 * jitterUnit is in [0, 1), producing 50%-100% of the 2s/4s/8s/16s base.
 */
export function calculateWebhookRetryDelay(retryNumber: number, jitterUnit: number): number {
  const normalizedUnit = Math.min(Math.max(jitterUnit, 0), 1 - Number.EPSILON);
  const baseDelay = WEBHOOK_BACKOFF_BASE_MS * 2 ** Math.max(0, retryNumber - 1);
  return Math.floor(
    baseDelay * (1 - WEBHOOK_BACKOFF_JITTER + WEBHOOK_BACKOFF_JITTER * normalizedUnit),
  );
}

function deterministicJitterUnit(identity: string, retryNumber: number): number {
  const digest = crypto.createHash('sha256').update(`${identity}:${retryNumber}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

/** BullMQ 5.12-compatible custom backoff strategy. */
export const webhookBackoffStrategy: BackoffStrategy = (attemptsMade, type, _error, job) => {
  if (type !== WEBHOOK_BACKOFF_TYPE) {
    throw new Error(`Unsupported webhook backoff strategy: ${type}`);
  }
  const data = job?.data as WebhookDeliveryPayload | undefined;
  const identity = data?.deliveryId ?? job?.id ?? 'webhook-delivery';
  return calculateWebhookRetryDelay(
    attemptsMade,
    deterministicJitterUnit(String(identity), attemptsMade),
  );
};

/** Reads and then cancels at most 1 KiB of a response body. */
export async function readResponseBodyExcerpt(
  response: Response,
  maxBytes = WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES,
): Promise<string | null> {
  if (!response.body || maxBytes <= 0) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      bytesRead += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (bytesRead === 0) return null;
  const combined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeWithinByteLimit(combined, maxBytes);
}

function decodeWithinByteLimit(bytes: Uint8Array, maxBytes: number): string {
  let decoded = new TextDecoder().decode(bytes.subarray(0, maxBytes));
  while (Buffer.byteLength(decoded) > maxBytes) {
    decoded = decoded.slice(0, -1);
  }
  return decoded;
}

function boundedReason(reason: string): string {
  return decodeWithinByteLimit(Buffer.from(reason), WEBHOOK_RESPONSE_EXCERPT_MAX_BYTES);
}

interface AttemptState {
  attemptNumber: number;
  responseCode: number | null;
  responseBodyExcerpt: string | null;
  errorReason: string | null;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  nextAttemptAt: Date | null;
}

async function persistAttempt(data: WebhookDeliveryPayload, state: AttemptState): Promise<void> {
  await prisma.$transaction([
    prisma.webhookDeliveryAttempt.upsert({
      where: {
        deliveryId_attemptNumber: {
          deliveryId: data.deliveryId,
          attemptNumber: state.attemptNumber,
        },
      },
      create: {
        deliveryId: data.deliveryId,
        attemptNumber: state.attemptNumber,
        responseCode: state.responseCode,
        responseBodyExcerpt: state.responseBodyExcerpt,
        errorReason: state.errorReason,
      },
      update: {
        responseCode: state.responseCode,
        responseBodyExcerpt: state.responseBodyExcerpt,
        errorReason: state.errorReason,
      },
    }),
    prisma.webhookDelivery.update({
      where: { id: data.deliveryId },
      data: {
        status: state.status,
        responseCode: state.responseCode,
        attempts: state.attemptNumber,
        nextAttemptAt: state.nextAttemptAt,
      },
    }),
  ]);
}

async function disableAfterTerminalFailure(
  data: WebhookDeliveryPayload,
  reason: string,
): Promise<void> {
  await disableWebhookSubscriptionAndNotify(
    data.subscriptionId,
    data.deliveryId,
    boundedReason(reason),
  );
}

async function recordPermanentFailure(
  job: Job<WebhookDeliveryPayload>,
  state: AttemptState,
  reason: string,
): Promise<never> {
  try {
    await persistAttempt(job.data, state);
    await disableAfterTerminalFailure(job.data, reason);
  } catch (error: unknown) {
    const persistenceReason = error instanceof Error ? error.message : 'Unknown persistence error';
    logger.error(
      {
        jobId: job.id,
        deliveryId: job.data.deliveryId,
        err: persistenceReason,
      },
      'Failed to persist permanent webhook failure state',
    );

    const sanitizedJob = {
      id: job.id,
      name: job.name,
      data: {
        deliveryId: job.data.deliveryId,
        subscriptionId: job.data.subscriptionId,
        failureKind: 'permanent-webhook-state-persistence',
        httpFailure: reason,
      },
      attemptsMade: state.attemptNumber,
    } as unknown as Job;
    const deadLetterError = new Error(
      `Permanent webhook ${reason}; state persistence failed: ${boundedReason(persistenceReason)}`,
    );

    try {
      await recordDeadLetter(WEBHOOK_DELIVERY_QUEUE, sanitizedJob, deadLetterError);
    } catch (deadLetterError: unknown) {
      logger.error(
        {
          jobId: job.id,
          deliveryId: job.data.deliveryId,
          err: deadLetterError instanceof Error ? deadLetterError.message : deadLetterError,
        },
        'Failed to record permanent webhook state failure in dead letter storage',
      );
    }
  }
  throw new UnrecoverableError(reason);
}

function attemptDetails(job: Job<WebhookDeliveryPayload>): {
  attemptNumber: number;
  maxAttempts: number;
  retryDelay: number;
} {
  const attemptNumber = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;
  const identity = job.data.deliveryId;
  const retryDelay = calculateWebhookRetryDelay(
    attemptNumber,
    deterministicJitterUnit(String(identity), attemptNumber),
  );
  return { attemptNumber, maxAttempts, retryDelay };
}

/** Executes one delivery attempt and persists its aggregate and diagnostic state. */
export async function processWebhookDelivery(job: Job<WebhookDeliveryPayload>): Promise<void> {
  const { url, payload, secret } = job.data;
  const { attemptNumber, maxAttempts, retryDelay } = attemptDetails(job);
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Stellar-Tipz-Webhook-Bot/1.0',
  };

  if (secret) {
    Object.assign(
      headers,
      createWebhookSigningHeaders(secret, body, job.data.deliveryId),
    );
  }

  logger.info(
    { jobId: job.id, deliveryId: job.data.deliveryId, attemptNumber, url },
    'Starting webhook delivery',
  );

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, WEBHOOK_DELIVERY_TIMEOUT_MS);

  let response: Response | undefined;
  let excerpt: string | null = null;
  let transportError: unknown;
  try {
    response = await safeWebhookFetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    excerpt = await readResponseBodyExcerpt(response);
  } catch (error: unknown) {
    transportError = error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response || transportError) {
    const reason = timedOut
      ? `Delivery timed out after ${WEBHOOK_DELIVERY_TIMEOUT_MS}ms`
      : transportError instanceof Error
        ? transportError.message
        : 'Webhook transport failure';
    const classification = response ? classifyWebhookResponse(response.status) : 'retryable';
    const terminal = classification === 'permanent' || attemptNumber >= maxAttempts;
    const state: AttemptState = {
      attemptNumber,
      responseCode: response?.status ?? null,
      responseBodyExcerpt: excerpt,
      errorReason: boundedReason(reason),
      status: terminal ? 'FAILED' : 'PENDING',
      nextAttemptAt: terminal ? null : new Date(Date.now() + retryDelay),
    };
    if (classification === 'permanent') {
      return recordPermanentFailure(job, state, `HTTP ${response?.status}: ${reason}`);
    }
    await persistAttempt(job.data, state);
    if (terminal) await disableAfterTerminalFailure(job.data, reason);
    logger.warn(
      { jobId: job.id, deliveryId: job.data.deliveryId, attemptNumber, err: reason },
      'Webhook delivery failed',
    );
    throw transportError instanceof Error ? transportError : new Error(reason);
  }

  const classification = classifyWebhookResponse(response.status);
  const httpReason = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

  if (classification === 'success') {
    await persistAttempt(job.data, {
      attemptNumber,
      responseCode: response.status,
      responseBodyExcerpt: excerpt,
      errorReason: null,
      status: 'SUCCESS',
      nextAttemptAt: null,
    });
    logger.info(
      {
        jobId: job.id,
        deliveryId: job.data.deliveryId,
        attemptNumber,
        url,
        status: response.status,
      },
      'Webhook delivered successfully',
    );
    return;
  }

  const terminal = classification === 'permanent' || attemptNumber >= maxAttempts;
  const state: AttemptState = {
    attemptNumber,
    responseCode: response.status,
    responseBodyExcerpt: excerpt,
    errorReason: httpReason,
    status: terminal ? 'FAILED' : 'PENDING',
    nextAttemptAt: terminal ? null : new Date(Date.now() + retryDelay),
  };

  if (classification === 'permanent') {
    return recordPermanentFailure(job, state, httpReason);
  }

  await persistAttempt(job.data, state);

  if (terminal) await disableAfterTerminalFailure(job.data, httpReason);
  logger.warn(
    { jobId: job.id, deliveryId: job.data.deliveryId, attemptNumber, status: response.status },
    'Webhook delivery failed',
  );
  throw new Error(httpReason);
}

/** Queue instance for dispatching webhook deliveries. */
export const webhookDeliveryQueue = new Queue<WebhookDeliveryPayload>(WEBHOOK_DELIVERY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: WEBHOOK_MAX_ATTEMPTS,
    backoff: { type: WEBHOOK_BACKOFF_TYPE, delay: WEBHOOK_BACKOFF_BASE_MS },
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 24 * 3_600 },
  },
});

/** Schedules a webhook delivery, including its persistent identity in production. */
export async function scheduleWebhookDelivery(
  url: string,
  payload: unknown,
  identity: WebhookDeliveryIdentity,
  secret?: string,
): Promise<void> {
  await webhookDeliveryQueue.add(
    'deliver',
    { url, payload, secret, ...identity },
    { jobId: identity.deliveryId },
  );
}

export const webhookDeliveryWorker = new Worker<WebhookDeliveryPayload>(
  WEBHOOK_DELIVERY_QUEUE,
  processWebhookDelivery,
  {
    connection: redis,
    concurrency: 5,
    settings: { backoffStrategy: webhookBackoffStrategy },
  },
);

webhookDeliveryWorker.on('failed', (job: Job<WebhookDeliveryPayload> | undefined, err: Error) => {
  if (job) {
    logger.error(
      { jobId: job.id, deliveryId: job.data.deliveryId, url: job.data.url, err: err.message },
      'Webhook job failed permanently or will retry',
    );
  } else {
    logger.error({ err: err.message }, 'Webhook worker error');
  }
});

attachDeadLetterHandler(webhookDeliveryWorker, WEBHOOK_DELIVERY_QUEUE, {
  skipUnrecoverable: true,
  sanitizeData: (data) => {
    const webhook = data as WebhookDeliveryPayload;

    return {
      deliveryId: webhook.deliveryId,
      subscriptionId: webhook.subscriptionId,
      failureKind: 'exhausted-webhook-delivery',
    };
  },
});

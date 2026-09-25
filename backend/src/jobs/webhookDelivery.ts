import { Queue, Worker, Job } from 'bullmq'
import { redis } from '../db/redis.js'
import { logger } from '../common/utils/logger.js'
import { attachDeadLetterHandler } from './deadLetter.js'
import { createWebhookSigningHeaders } from '../modules/webhooks/webhooks.signing.js'
import { safeWebhookFetch } from '../modules/webhooks/webhooks.url-safety.js'

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery'

export interface WebhookDeliveryPayload {
  url: string
  payload: Record<string, unknown>
  secret?: string
  /** Stable id for receiver-side deduplication across retries. */
  deliveryId: string
}

/** Queue instance for dispatching webhook deliveries. */
export const webhookDeliveryQueue = new Queue<WebhookDeliveryPayload>(WEBHOOK_DELIVERY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
})

/** Helper to schedule a webhook delivery. */
export async function scheduleWebhookDelivery(
  url: string,
  payload: Record<string, unknown>,
  secret: string | undefined,
  deliveryId: string,
): Promise<void> {
  await webhookDeliveryQueue.add(
    'deliver',
    { url, payload, secret, deliveryId },
    // The delivery id is also the BullMQ id, preventing accidental duplicate
    // enqueue calls from creating concurrent deliveries.
    { jobId: deliveryId },
  )
}

/** Performs a single outbound delivery; exported for security-focused tests. */
export async function deliverWebhook(
  input: WebhookDeliveryPayload,
  options: { fetchFn?: typeof fetch } = {},
): Promise<Response> {
  const { url, payload, secret, deliveryId } = input
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Stellar-Tipz-Webhook-Bot/1.0',
  }
  const body = JSON.stringify(payload)

  if (secret) {
    Object.assign(headers, createWebhookSigningHeaders(secret, body, deliveryId))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await safeWebhookFetch(
      url,
      { method: 'POST', headers, body, signal: controller.signal },
      { fetchFn: options.fetchFn },
    )

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

/** Worker to process webhook deliveries. */
export const webhookDeliveryWorker = new Worker<WebhookDeliveryPayload>(
  WEBHOOK_DELIVERY_QUEUE,
  async (job: Job<WebhookDeliveryPayload>) => {
    const { url, deliveryId } = job.data
    logger.info({ jobId: job.id, deliveryId, url }, 'Starting webhook delivery')

    try {
      const response = await deliverWebhook(job.data)
      logger.info(
        { jobId: job.id, deliveryId, url, status: response.status },
        'Webhook delivered successfully',
      )
    } catch (error: unknown) {
      logger.warn(
        {
          jobId: job.id,
          deliveryId,
          url,
          error: error instanceof Error ? error.message : error,
        },
        'Webhook delivery failed',
      )
      throw error
    }
  },
  { connection: redis, concurrency: 5 },
)

webhookDeliveryWorker.on('failed', (job: Job<WebhookDeliveryPayload> | undefined, err: Error) => {
  if (job) {
    logger.error(
      { jobId: job.id, deliveryId: job.data.deliveryId, url: job.data.url, err: err.message },
      'Webhook job failed permanently or retrying',
    )
  } else {
    logger.error({ err: err.message }, 'Webhook worker error')
  }
})

attachDeadLetterHandler(webhookDeliveryWorker, WEBHOOK_DELIVERY_QUEUE)

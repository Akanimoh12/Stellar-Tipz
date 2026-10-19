import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300

/** Generates a new random signing secret for a webhook subscription. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

/** Each delivery has a stable receiver-visible id for deduplication. */
export function generateWebhookDeliveryId(): string {
  return randomUUID()
}

function signingInput(timestamp: string | number, deliveryId: string, payload: string): string {
  return `${timestamp}.${deliveryId}.${payload}`
}

/**
 * Computes the HMAC-SHA256 signature over timestamp, delivery id, and payload.
 * Binding all three values prevents replaying a captured body under a fresh
 * timestamp or delivery id.
 */
export function signWebhookPayload(
  secret: string,
  payload: string,
  timestamp?: string | number,
  deliveryId?: string,
): string {
  const input =
    timestamp === undefined || deliveryId === undefined
      ? payload
      : signingInput(timestamp, deliveryId, payload)
  return createHmac('sha256', secret).update(input).digest('hex')
}

function equalHex(expectedHex: string, received: string): boolean {
  const normalized = received.startsWith('sha256=') ? received.slice(7) : received
  if (!/^[0-9a-f]{64}$/i.test(normalized)) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const given = Buffer.from(normalized, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * Backward-compatible signature verifier. New integrations should use
 * verifyTimestampedWebhookSignature below.
 */
export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  return equalHex(signWebhookPayload(secret, payload), signature)
}

export interface TimestampedWebhookVerification {
  payload: string
  timestamp: string | number
  deliveryId: string
  signature: string
  /** Current secret followed by any still-valid rotation-overlap secrets. */
  secrets: readonly string[]
  nowMs?: number
  toleranceSeconds?: number
}

/**
 * Receiver-side verifier for replay-protected webhook signatures.
 * Returns false for stale/future timestamps, tampered bodies, malformed
 * signatures, or a signature that matches none of the overlap secrets.
 */
export function verifyTimestampedWebhookSignature(input: TimestampedWebhookVerification): boolean {
  const timestampSeconds = Number(input.timestamp)
  if (!Number.isFinite(timestampSeconds)) return false
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS
  if (Math.abs(nowSeconds - timestampSeconds) > tolerance) return false
  if (!input.deliveryId.trim()) return false

  return input.secrets.some((secret) =>
    equalHex(
      signWebhookPayload(secret, input.payload, timestampSeconds, input.deliveryId),
      input.signature,
    ),
  )
}

export interface WebhookSigningHeaders {
  'X-Stellar-Tipz-Timestamp': string
  'X-Stellar-Tipz-Delivery-Id': string
  'X-Stellar-Tipz-Signature': string
}

/** Builds the replay-protected headers emitted with each delivery. */
export function createWebhookSigningHeaders(
  secret: string,
  payload: string,
  deliveryId: string = generateWebhookDeliveryId(),
  timestampSeconds: number = Math.floor(Date.now() / 1_000),
): WebhookSigningHeaders {
  return {
    'X-Stellar-Tipz-Timestamp': String(timestampSeconds),
    'X-Stellar-Tipz-Delivery-Id': deliveryId,
    'X-Stellar-Tipz-Signature': `sha256=${signWebhookPayload(
      secret,
      payload,
      timestampSeconds,
      deliveryId,
    )}`,
  }
}

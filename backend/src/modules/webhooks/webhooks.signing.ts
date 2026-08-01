import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Generates a new random signing secret for a webhook subscription. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Computes the HMAC-SHA256 signature of `payload` using `secret`, hex-encoded. */
export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verifies a webhook signature using a constant-time comparison to avoid
 * leaking the expected signature via timing side-channels.
 */
export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhookPayload(secret, payload), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

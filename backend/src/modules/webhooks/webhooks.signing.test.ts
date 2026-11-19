import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
  verifyTimestampedWebhookSignature,
  createWebhookSigningHeaders,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
} from "./webhooks.signing.js";

describe("generateWebhookSecret", () => {
  it("returns a 64-char hex string", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different secret on each call", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("signWebhookPayload", () => {
  it("produces a deterministic hex-encoded HMAC-SHA256 signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ event: "tip.received", tipId: "tip_1" });

    const signature = signWebhookPayload(secret, payload);

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).toBe(signWebhookPayload(secret, payload));
  });

  it("produces different signatures for different payloads", () => {
    const secret = "test-secret";
    const sigA = signWebhookPayload(secret, JSON.stringify({ a: 1 }));
    const sigB = signWebhookPayload(secret, JSON.stringify({ a: 2 }));
    expect(sigA).not.toBe(sigB);
  });

  it("produces different signatures for different secrets", () => {
    const payload = JSON.stringify({ a: 1 });
    expect(signWebhookPayload("secret-a", payload)).not.toBe(
      signWebhookPayload("secret-b", payload),
    );
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ event: "tip.received" });
    const signature = signWebhookPayload(secret, payload);

    expect(verifyWebhookSignature(secret, payload, signature)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const payload = JSON.stringify({ event: "tip.received" });
    const signature = signWebhookPayload("wrong-secret", payload);

    expect(verifyWebhookSignature("test-secret", payload, signature)).toBe(false);
  });

  it("rejects a signature for a tampered payload", () => {
    const secret = "test-secret";
    const signature = signWebhookPayload(secret, JSON.stringify({ amount: 100 }));

    expect(
      verifyWebhookSignature(secret, JSON.stringify({ amount: 999 }), signature),
    ).toBe(false);
  });

  it("rejects a malformed (non-hex) signature without throwing", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ event: "tip.received" });

    expect(verifyWebhookSignature(secret, payload, "not-hex-!!")).toBe(false);
  });
});

describe("verifyTimestampedWebhookSignature (issue #1642 — secret rotation)", () => {
  const payload = JSON.stringify({ event: "tip.received", tipId: "tip_001" });
  const deliveryId = "del_12345";
  const timestampSeconds = 1693056000;
  const nowMs = timestampSeconds * 1000;

  it("accepts a valid signature with current secret", () => {
    const secret = "current-secret-key";
    const signature = signWebhookPayload(secret, payload, timestampSeconds, deliveryId);

    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: timestampSeconds,
      deliveryId,
      signature,
      secrets: [secret],
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(true);
  });

  it("accepts a valid signature with old secret during overlap window (issue #1642)", () => {
    const oldSecret = "previous-secret-key";
    const newSecret = "current-secret-key";
    const signature = signWebhookPayload(oldSecret, payload, timestampSeconds, deliveryId);

    // During rotation grace period, both secrets are valid
    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: timestampSeconds,
      deliveryId,
      signature,
      secrets: [newSecret, oldSecret], // Current secret first, then overlapping old secret
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(true);
  });

  it("rejects a signature with old secret after overlap expires (issue #1642)", () => {
    const oldSecret = "expired-secret-key";
    const newSecret = "current-secret-key";
    const signature = signWebhookPayload(oldSecret, payload, timestampSeconds, deliveryId);

    // After rotation grace period, old secret is no longer in the secrets array
    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: timestampSeconds,
      deliveryId,
      signature,
      secrets: [newSecret], // Only current secret, old one expired
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(false);
  });

  it("rejects a stale timestamp outside tolerance window", () => {
    const secret = "test-secret";
    const staleTimestamp = timestampSeconds - (DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 60);
    const signature = signWebhookPayload(secret, payload, staleTimestamp, deliveryId);

    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: staleTimestamp,
      deliveryId,
      signature,
      secrets: [secret],
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(false);
  });

  it("rejects a future timestamp outside tolerance window", () => {
    const secret = "test-secret";
    const futureTimestamp = timestampSeconds + (DEFAULT_WEBHOOK_TOLERANCE_SECONDS + 60);
    const signature = signWebhookPayload(secret, payload, futureTimestamp, deliveryId);

    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: futureTimestamp,
      deliveryId,
      signature,
      secrets: [secret],
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(false);
  });

  it("rejects a replay of the same delivery with tampered timestamp", () => {
    const secret = "test-secret";
    const originalSignature = signWebhookPayload(secret, payload, timestampSeconds, deliveryId);

    // Try to replay with a different timestamp
    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: timestampSeconds + 100,
      deliveryId,
      signature: originalSignature, // Using original signature with new timestamp
      secrets: [secret],
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(false);
  });

  it("requires all three elements (timestamp, deliveryId, payload) for signature match", () => {
    const secret = "test-secret";
    const correctSignature = signWebhookPayload(secret, payload, timestampSeconds, deliveryId);

    // Try different deliveryId with same timestamp and payload
    const result = verifyTimestampedWebhookSignature({
      payload,
      timestamp: timestampSeconds,
      deliveryId: "different-delivery-id",
      signature: correctSignature,
      secrets: [secret],
      nowMs,
      toleranceSeconds: DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
    });

    expect(result).toBe(false);
  });
});

describe("createWebhookSigningHeaders", () => {
  it("creates properly formatted signing headers", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ event: "test" });

    const headers = createWebhookSigningHeaders(secret, payload);

    expect(headers).toHaveProperty("X-Stellar-Tipz-Timestamp");
    expect(headers).toHaveProperty("X-Stellar-Tipz-Delivery-Id");
    expect(headers).toHaveProperty("X-Stellar-Tipz-Signature");
    expect(headers["X-Stellar-Tipz-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("produces consistent headers for the same inputs", () => {
    const secret = "test-secret";
    const payload = JSON.stringify({ event: "test" });
    const deliveryId = "del_fixed";
    const timestamp = 1693056000;

    const headers1 = createWebhookSigningHeaders(secret, payload, deliveryId, timestamp);
    const headers2 = createWebhookSigningHeaders(secret, payload, deliveryId, timestamp);

    expect(headers1).toEqual(headers2);
  });
});

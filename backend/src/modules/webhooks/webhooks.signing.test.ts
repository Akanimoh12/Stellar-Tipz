import { describe, it, expect } from "vitest";
import {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
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

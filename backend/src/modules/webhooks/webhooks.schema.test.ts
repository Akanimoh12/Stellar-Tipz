import { describe, expect, it } from "vitest";
import {
  WEBHOOK_EVENT_TYPES,
  createWebhookSubscriptionSchema,
} from "./webhooks.schema.js";

describe("webhook subscription event validation (issue #1280)", () => {
  it("accepts every documented event type during creation", () => {
    expect(
      createWebhookSubscriptionSchema.parse({
        url: "https://example.com/webhooks",
        events: [...WEBHOOK_EVENT_TYPES],
      }).events,
    ).toEqual(WEBHOOK_EVENT_TYPES);
  });

  it("rejects an unknown event type during creation", () => {
    const result = createWebhookSubscriptionSchema.safeParse({
      url: "https://example.com/webhooks",
      events: ["tip.received", "user.private_data"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty event selection during creation", () => {
    const result = createWebhookSubscriptionSchema.safeParse({
      url: "https://example.com/webhooks",
      events: [],
    });

    expect(result.success).toBe(false);
  });
});

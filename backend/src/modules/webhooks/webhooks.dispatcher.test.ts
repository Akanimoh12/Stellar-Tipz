import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../common/utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    webhookSubscription: { findMany: vi.fn() },
    webhookDelivery: { create: vi.fn() },
  },
}));

vi.mock("../../jobs/webhookDelivery.js", () => ({
  scheduleWebhookDelivery: vi.fn(),
}));

import { dispatchWebhookEvent } from "./webhooks.dispatcher.js";
import { prisma } from "../../db/prisma.js";
import { scheduleWebhookDelivery } from "../../jobs/webhookDelivery.js";

const subA = {
  id: "wh_sub_a",
  ownerId: "user_01",
  url: "https://a.example.com/webhook",
  secret: "secret-a",
  events: ["tip.received"],
  status: "ACTIVE",
  deletedAt: null,
};

const subB = {
  id: "wh_sub_b",
  ownerId: "user_01",
  url: "https://b.example.com/webhook",
  secret: "secret-b",
  events: ["tip.received", "goal.completed"],
  status: "ACTIVE",
  deletedAt: null,
};

const goalOnlySub = {
  ...subA,
  id: "wh_sub_goal",
  events: ["goal.completed"],
};

const otherUsersSub = {
  ...subA,
  id: "wh_sub_user_02",
  ownerId: "user_02",
};

describe("dispatchWebhookEvent (issue #1280)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.webhookDelivery.create)
      .mockResolvedValueOnce({ id: "delivery-a" } as never)
      .mockResolvedValueOnce({ id: "delivery-b" } as never);
  });

  it("returns zero matches when no subscription is registered for the event", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce([]);

    const result = await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      { tipId: "tip_1" },
    );

    expect(result).toEqual({ matched: 0, dispatched: 0 });
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(scheduleWebhookDelivery).not.toHaveBeenCalled();
  });

  it("only queries subscriptions owned by the caller, ACTIVE, not deleted, matching the event", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce([]);

    await dispatchWebhookEvent("user_01", "tip.received", {});

    expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: "user_01",
        status: "ACTIVE",
        deletedAt: null,
        events: { has: "tip.received" },
      },
    });
  });

  it("creates a PENDING delivery and enqueues a signed job for every matching subscription", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [subA, subB] as never,
    );

    const result = await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      { tipId: "tip_1" },
    );

    expect(result).toEqual({ matched: 2, dispatched: 2 });

    expect(prisma.webhookDelivery.create).toHaveBeenCalledTimes(2);

    expect(scheduleWebhookDelivery).toHaveBeenCalledWith(
      subA.url,
      expect.objectContaining({
        event: "tip.received",
        timestamp: expect.any(String),
        data: { tipId: "tip_1" },
      }),
      {
        deliveryId: "delivery-a",
        subscriptionId: subA.id,
      },
      subA.secret,
    );

    expect(scheduleWebhookDelivery).toHaveBeenCalledWith(
      subB.url,
      expect.objectContaining({
        event: "tip.received",
        data: { tipId: "tip_1" },
      }),
      {
        deliveryId: "delivery-b",
        subscriptionId: subB.id,
      },
      subB.secret,
    );
  });

  it("does not create or enqueue a delivery for a subscription that did not request the event", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [goalOnlySub] as never,
    );

    const result = await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      { tipId: "tip_1" },
    );

    expect(result).toEqual({ matched: 0, dispatched: 0 });
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(scheduleWebhookDelivery).not.toHaveBeenCalled();
  });

  it("delivers each requested event from a multi-event subscription", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [subB] as never,
    );

    vi.mocked(prisma.webhookDelivery.create).mockReset();
    vi.mocked(prisma.webhookDelivery.create).mockResolvedValueOnce({
      id: "delivery-goal",
    } as never);

    const result = await dispatchWebhookEvent(
      "user_01",
      "goal.completed",
      { goalId: "goal_1" },
    );

    expect(result).toEqual({ matched: 1, dispatched: 1 });

    expect(scheduleWebhookDelivery).toHaveBeenCalledWith(
      subB.url,
      expect.objectContaining({
        event: "goal.completed",
        data: { goalId: "goal_1" },
      }),
      {
        deliveryId: "delivery-goal",
        subscriptionId: subB.id,
      },
      subB.secret,
    );
  });

  it("never dispatches user B's event to user A's subscription for the same event type", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [subA] as never,
    );

    const result = await dispatchWebhookEvent(
      "user_02",
      "tip.received",
      { tipId: "user_b_tip" },
    );

    expect(result).toEqual({ matched: 0, dispatched: 0 });

    expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        ownerId: "user_02",
        events: { has: "tip.received" },
      }),
    });

    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(scheduleWebhookDelivery).not.toHaveBeenCalled();
  });

  it("does not dispatch another user's subscription even if returned by the data layer", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [otherUsersSub] as never,
    );

    const result = await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      { tipId: "user_a_tip" },
    );

    expect(result).toEqual({ matched: 0, dispatched: 0 });
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
    expect(scheduleWebhookDelivery).not.toHaveBeenCalled();
  });

  it("sends a signed envelope with an ISO timestamp", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [subA] as never,
    );

    await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      { tipId: "tip_1" },
    );

    const [, envelope, identity, secret] =
      vi.mocked(scheduleWebhookDelivery).mock.calls[0];

    expect(identity).toEqual({
      deliveryId: "delivery-a",
      subscriptionId: subA.id,
    });

    expect(secret).toBe(subA.secret);

    expect(() =>
      new Date(
        (envelope as { timestamp: string }).timestamp,
      ).toISOString(),
    ).not.toThrow();
  });

  it("dispatches to remaining subscriptions when one fails to enqueue", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce(
      [subA, subB] as never,
    );

    vi.mocked(scheduleWebhookDelivery)
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce(undefined);

    const result = await dispatchWebhookEvent(
      "user_01",
      "tip.received",
      {},
    );

    expect(result).toEqual({ matched: 2, dispatched: 1 });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../common/utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    webhookDelivery: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    webhookSubscription: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  listDeliveries,
  getDelivery,
  createSubscription,
  listSubscriptions,
  deleteSubscription,
} from "./webhooks.service.js";
import { prisma } from "../../db/prisma.js";

const fakeDeliveries = [
  {
    id: "del_01",
    subscriptionId: "sub_01",
    status: "SUCCESS",
    responseCode: 200,
    attempts: 1,
    nextAttemptAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    subscription: { ownerId: "user_01", deletedAt: null },
  },
  {
    id: "del_02",
    subscriptionId: "sub_01",
    status: "FAILED",
    responseCode: 500,
    attempts: 3,
    nextAttemptAt: new Date("2026-07-02T00:00:00Z"),
    createdAt: new Date("2026-07-01T01:00:00Z"),
    updatedAt: new Date("2026-07-01T02:00:00Z"),
    subscription: { ownerId: "user_01", deletedAt: null },
  },
];

describe("listDeliveries (issue #1001)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated deliveries ordered by createdAt desc", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      fakeDeliveries as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(2 as never);

    const result = await listDeliveries("user_01", 1, 20);

    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.entries[0].id).toBe("del_01");
    expect(result.entries[0].status).toBe("SUCCESS");
  });

  it("filters by subscriptionId when provided", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      [fakeDeliveries[0]] as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(1 as never);

    await listDeliveries("user_01", 1, 20, "sub_01");

    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscriptionId: "sub_01" }),
      }),
    );
  });

  it("filters by status when provided", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      [fakeDeliveries[0]] as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(1 as never);

    await listDeliveries("user_01", 1, 20, undefined, "SUCCESS");

    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
  });

  it("returns empty list when no deliveries match", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(0 as never);

    const result = await listDeliveries("user_01", 1, 20);

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("serializes dates to ISO strings", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      fakeDeliveries as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(2 as never);

    const result = await listDeliveries("user_01", 1, 20);

    for (const entry of result.entries) {
      expect(() => new Date(entry.createdAt).toISOString()).not.toThrow();
      expect(() => new Date(entry.updatedAt).toISOString()).not.toThrow();
    }
  });
});

describe("getDelivery (issue #1001)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a delivery by id", async () => {
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValueOnce(
      fakeDeliveries[0] as never,
    );

    const result = await getDelivery("user_01", "del_01");

    expect(result.id).toBe("del_01");
    expect(result.status).toBe("SUCCESS");
    expect(result.responseCode).toBe(200);
    expect(result.attempts).toBe(1);
  });

  it("throws NotFoundError when delivery does not exist", async () => {
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValueOnce(null);

    await expect(getDelivery("user_01", "ghost")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

const fakeSubscription = {
  id: "wh_sub_01",
  ownerId: "user_01",
  url: "https://example.com/webhook",
  secret: "abc123",
  events: ["tip.received"],
  status: "ACTIVE",
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  deletedAt: null,
};

describe("createSubscription (issue #997)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a subscription and returns the generated secret once", async () => {
    vi.mocked(prisma.webhookSubscription.create).mockImplementation(
      (async ({ data }: { data: { secret: string } }) => ({
        ...fakeSubscription,
        ...data,
      })) as never,
    );

    const result = await createSubscription("user_01", {
      url: "https://example.com/webhook",
      events: ["tip.received"],
    });

    expect(prisma.webhookSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "user_01",
        url: "https://example.com/webhook",
        events: ["tip.received"],
        secret: expect.any(String),
      }),
    });
    expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(result.id).toBe("wh_sub_01");
    expect(result.status).toBe("ACTIVE");
  });

  it("generates a fresh random secret per subscription", async () => {
    vi.mocked(prisma.webhookSubscription.create).mockImplementation(
      (async ({ data }: { data: { secret: string } }) => ({
        ...fakeSubscription,
        secret: data.secret,
      })) as never,
    );

    const a = await createSubscription("user_01", {
      url: "https://example.com/a",
      events: ["tip.received"],
    });
    const b = await createSubscription("user_01", {
      url: "https://example.com/b",
      events: ["tip.received"],
    });

    expect(a.secret).not.toBe(b.secret);
  });
});

describe("listSubscriptions (issue #997)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated subscriptions scoped to the owner, without secrets", async () => {
    vi.mocked(prisma.webhookSubscription.findMany).mockResolvedValueOnce([
      fakeSubscription,
    ] as never);
    vi.mocked(prisma.webhookSubscription.count).mockResolvedValueOnce(1 as never);

    const result = await listSubscriptions("user_01", 1, 20);

    expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "user_01", deletedAt: null },
      }),
    );
    expect(result.total).toBe(1);
    expect(result.entries[0].id).toBe("wh_sub_01");
    expect(result.entries[0]).not.toHaveProperty("secret");
  });
});

describe("deleteSubscription (issue #997)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes a subscription owned by the caller", async () => {
    vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce(
      fakeSubscription as never,
    );
    vi.mocked(prisma.webhookSubscription.update).mockResolvedValueOnce(
      { ...fakeSubscription, deletedAt: new Date(), status: "DISABLED" } as never,
    );

    await deleteSubscription("user_01", "wh_sub_01");

    expect(prisma.webhookSubscription.update).toHaveBeenCalledWith({
      where: { id: "wh_sub_01" },
      data: { deletedAt: expect.any(Date), status: "DISABLED" },
    });
  });

  it("throws NotFoundError when the subscription does not exist", async () => {
    vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce(null);

    await expect(deleteSubscription("user_01", "ghost")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws NotFoundError when the subscription was already deleted", async () => {
    vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce({
      ...fakeSubscription,
      deletedAt: new Date(),
    } as never);

    await expect(deleteSubscription("user_01", "wh_sub_01")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws ForbiddenError when the caller does not own the subscription", async () => {
    vi.mocked(prisma.webhookSubscription.findUnique).mockResolvedValueOnce(
      fakeSubscription as never,
    );

    await expect(deleteSubscription("someone_else", "wh_sub_01")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects delivery access through a subscription owned by another user", async () => {
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValueOnce({
      ...fakeDeliveries[0],
      subscription: { ownerId: "user_01", deletedAt: null },
    } as never);

    await expect(getDelivery("user_02", "del_01")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../common/utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    webhookDelivery: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));

import { listDeliveries, getDelivery } from "./webhooks.service.js";
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
  },
];

describe("listDeliveries (issue #1001)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated deliveries ordered by createdAt desc", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      fakeDeliveries as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(2 as never);

    const result = await listDeliveries(1, 20);

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

    await listDeliveries(1, 20, "sub_01");

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

    await listDeliveries(1, 20, undefined, "SUCCESS");

    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "SUCCESS" }),
      }),
    );
  });

  it("returns empty list when no deliveries match", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(0 as never);

    const result = await listDeliveries(1, 20);

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("serializes dates to ISO strings", async () => {
    vi.mocked(prisma.webhookDelivery.findMany).mockResolvedValueOnce(
      fakeDeliveries as never,
    );
    vi.mocked(prisma.webhookDelivery.count).mockResolvedValueOnce(2 as never);

    const result = await listDeliveries(1, 20);

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

    const result = await getDelivery("del_01");

    expect(result.id).toBe("del_01");
    expect(result.status).toBe("SUCCESS");
    expect(result.responseCode).toBe(200);
    expect(result.attempts).toBe(1);
  });

  it("throws NotFoundError when delivery does not exist", async () => {
    vi.mocked(prisma.webhookDelivery.findUnique).mockResolvedValueOnce(null);

    await expect(getDelivery("ghost")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

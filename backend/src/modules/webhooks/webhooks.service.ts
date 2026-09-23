import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import { assertOwnership } from "../../common/utils/ownership.js";
import { generateWebhookSecret } from "./webhooks.signing.js";
import type {
  WebhookDeliveryResponse,
  WebhookDeliveryListResponse,
  WebhookSubscriptionCreateResponse,
  WebhookSubscriptionListResponse,
  WebhookSubscriptionResponse,
} from "./webhooks.types.js";
import type { CreateWebhookSubscriptionInput } from "./webhooks.schema.js";

type WebhookSubscriptionRow = {
  id: string;
  ownerId: string;
  url: string;
  events: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toSubscription(row: WebhookSubscriptionRow): WebhookSubscriptionResponse {
  return {
    id: row.id,
    ownerId: row.ownerId,
    url: row.url,
    events: row.events,
    status: row.status as WebhookSubscriptionResponse["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Creates a webhook subscription for `ownerId`. The secret is returned once. */
export async function createSubscription(
  ownerId: string,
  data: CreateWebhookSubscriptionInput,
): Promise<WebhookSubscriptionCreateResponse> {
  logger.info({ ownerId, url: data.url, events: data.events }, "Creating webhook subscription");

  const secret = generateWebhookSecret();
  const row = await prisma.webhookSubscription.create({
    data: {
      ownerId,
      url: data.url,
      events: data.events,
      secret,
    },
  });

  return { ...toSubscription(row), secret };
}

/** Lists webhook subscriptions owned by `ownerId`. */
export async function listSubscriptions(
  ownerId: string,
  page: number,
  limit: number,
): Promise<WebhookSubscriptionListResponse> {
  logger.info({ ownerId, page, limit }, "Listing webhook subscriptions");

  const where = { ownerId, deletedAt: null };
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.webhookSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.webhookSubscription.count({ where }),
  ]);

  return { entries: rows.map(toSubscription), total, page, limit };
}

/** Soft-deletes a webhook subscription. Only the owner may delete it. */
export async function deleteSubscription(ownerId: string, id: string): Promise<void> {
  const existing = await prisma.webhookSubscription.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new NotFoundError(`Webhook subscription ${id} not found`);
  }
  assertOwnership(existing.ownerId, ownerId, "You can only delete your own webhook subscriptions");

  await prisma.webhookSubscription.update({
    where: { id },
    data: { deletedAt: new Date(), status: "DISABLED" },
  });

  logger.info({ ownerId, subscriptionId: id }, "Webhook subscription deleted");
}

export async function listDeliveries(
  ownerId: string,
  page: number,
  limit: number,
  subscriptionId?: string,
  status?: string,
): Promise<WebhookDeliveryListResponse> {
  logger.info({ page, limit, subscriptionId, status }, "Listing webhook deliveries");

  const where: Record<string, unknown> = {
    subscription: { ownerId, deletedAt: null },
  };
  if (subscriptionId) where.subscriptionId = subscriptionId;
  if (status) where.status = status;

  const skip = (page - 1) * limit;

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.webhookDelivery.count({ where }),
  ]);

  const entries: WebhookDeliveryResponse[] = deliveries.map((d) => ({
    id: d.id,
    subscriptionId: d.subscriptionId,
    status: d.status,
    responseCode: d.responseCode,
    attempts: d.attempts,
    nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));

  return { entries, total, page, limit };
}

export async function getDelivery(ownerId: string, id: string): Promise<WebhookDeliveryResponse> {
  logger.info({ id }, "Fetching webhook delivery");

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id },
    include: { subscription: { select: { ownerId: true, deletedAt: true } } },
  });
  if (!delivery) throw new NotFoundError(`Webhook delivery ${id} not found`);
  if (delivery.subscription.deletedAt) throw new NotFoundError(`Webhook delivery ${id} not found`);
  assertOwnership(delivery.subscription.ownerId, ownerId);

  return {
    id: delivery.id,
    subscriptionId: delivery.subscriptionId,
    status: delivery.status,
    responseCode: delivery.responseCode,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

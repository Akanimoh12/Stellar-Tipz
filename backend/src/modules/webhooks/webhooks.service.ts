import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { NotFoundError } from "../../common/errors/AppError.js";
import type { WebhookDeliveryResponse, WebhookDeliveryListResponse } from "./webhooks.types.js";

export async function listDeliveries(
  page: number,
  limit: number,
  subscriptionId?: string,
  status?: string,
): Promise<WebhookDeliveryListResponse> {
  logger.info({ page, limit, subscriptionId, status }, "Listing webhook deliveries");

  const where: Record<string, unknown> = {};
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

export async function getDelivery(id: string): Promise<WebhookDeliveryResponse> {
  logger.info({ id }, "Fetching webhook delivery");

  const delivery = await prisma.webhookDelivery.findUnique({ where: { id } });
  if (!delivery) throw new NotFoundError(`Webhook delivery ${id} not found`);

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

import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { scheduleWebhookDelivery } from "../../jobs/webhookDelivery.js";
import type { WebhookEventType } from "./webhooks.schema.js";
import type { WebhookEventEnvelope, WebhookDispatchResult } from "./webhooks.types.js";

/**
 * Fans a domain event (e.g. "tip.received") out to every ACTIVE, non-deleted
 * webhook subscription owned by `ownerId` that is registered for it.
 *
 * For each matching subscription this records a `PENDING` `WebhookDelivery`
 * row (so `GET /webhooks/deliveries` has something to show) and enqueues a
 * signed HTTP delivery job via the existing `webhook-delivery` queue. One
 * subscription failing to enqueue never blocks the others.
 */
export async function dispatchWebhookEvent(
  ownerId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<WebhookDispatchResult> {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: {
      ownerId,
      status: "ACTIVE",
      deletedAt: null,
      events: { has: event },
    },
  });

  if (subscriptions.length === 0) {
    logger.info({ ownerId, event }, "No active webhook subscriptions matched event");
    return { matched: 0, dispatched: 0 };
  }

  const envelope: WebhookEventEnvelope = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const outcomes = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      await prisma.webhookDelivery.create({
        data: { subscriptionId: subscription.id },
      });
      await scheduleWebhookDelivery(subscription.url, envelope, subscription.secret);
    }),
  );

  let dispatched = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      dispatched += 1;
    } else {
      logger.error(
        { ownerId, event, subscriptionId: subscriptions[index].id, err: outcome.reason },
        "Failed to dispatch webhook event to subscription",
      );
    }
  });

  logger.info(
    { ownerId, event, matched: subscriptions.length, dispatched },
    "Dispatched webhook event",
  );

  return { matched: subscriptions.length, dispatched };
}

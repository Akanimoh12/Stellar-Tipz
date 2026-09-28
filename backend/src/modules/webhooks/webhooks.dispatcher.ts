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
 * row and enqueues a signed HTTP delivery job. One subscription failing to
 * enqueue never blocks the others.
 *
 * `ownerId` is an internal authorization boundary and must come from the
 * persisted domain event or authenticated actor, never from untrusted
 * event-payload data.
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

  // Keep owner/event authorization adjacent to delivery side effects as a
  // defense-in-depth boundary if the data-access query changes later.
  const eligibleSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.ownerId === ownerId &&
      subscription.events.includes(event),
  );

  if (eligibleSubscriptions.length !== subscriptions.length) {
    logger.warn(
      {
        ownerId,
        event,
        rejected: subscriptions.length - eligibleSubscriptions.length,
      },
      "Rejected webhook subscriptions outside dispatch scope",
    );
  }

  if (eligibleSubscriptions.length === 0) {
    logger.info(
      { ownerId, event },
      "No active webhook subscriptions matched event",
    );
    return { matched: 0, dispatched: 0 };
  }

  const envelope: WebhookEventEnvelope = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const outcomes = await Promise.allSettled(
    eligibleSubscriptions.map(async (subscription) => {
      const delivery = await prisma.webhookDelivery.create({
        data: { subscriptionId: subscription.id },
      });

      await scheduleWebhookDelivery(
        subscription.url,
        envelope,
        {
          deliveryId: delivery.id,
          subscriptionId: subscription.id,
        },
        subscription.secret,
      );
    }),
  );

  let dispatched = 0;

  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      dispatched += 1;
    } else {
      logger.error(
        {
          ownerId,
          event,
          subscriptionId: eligibleSubscriptions[index].id,
          err: outcome.reason,
        },
        "Failed to dispatch webhook event to subscription",
      );
    }
  });

  logger.info(
    {
      ownerId,
      event,
      matched: eligibleSubscriptions.length,
      dispatched,
    },
    "Dispatched webhook event",
  );

  return {
    matched: eligibleSubscriptions.length,
    dispatched,
  };
}

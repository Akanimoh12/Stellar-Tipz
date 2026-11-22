import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import * as notificationsService from '../../modules/notifications/notifications.service.js';
import { observeSubscriptionCharge } from '../../common/observability/businessMetrics.js';
import type { DecodedEvent } from '../sorobanClient.js';
import {
  addDays,
  ensureUserId,
  intervalFromDays,
  subscriptionArgs,
  subscriptionId,
  toBigInt,
  toIntervalDays,
  toTimestamp,
  warnUnparseable,
} from './helpers.js';

/**
 * Project a `("sub", "created")` event — data `(subscriber, creator, amount,
 * interval_days)`. One subscription per (tipper, creator) pair, keyed
 * deterministically (`sub_<tipperId>_<creatorId>`) so replays upsert one row.
 */
export async function projectSubscriptionCreated(event: DecodedEvent, isNewEvent: boolean): Promise<void> {
  if (!isNewEvent) return;
  const [subscriber, creator, amount, intervalDays, nextDue] = subscriptionArgs(event.value);
  const amountStroops = toBigInt(amount);
  if (typeof subscriber !== 'string' || typeof creator !== 'string' || amountStroops === null) {
    return warnUnparseable(event, 'sub_created');
  }

  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);
  const days = toIntervalDays(intervalDays);
  const nextChargeAt = toTimestamp(nextDue) ?? addDays(new Date(), days);

  await prisma.subscription.upsert({
    where: { id: subscriptionId(tipperId, creatorId) },
    create: {
      id: subscriptionId(tipperId, creatorId),
      tipperId,
      creatorId,
      amountStroops,
      interval: intervalFromDays(days),
      nextChargeAt,
      status: 'ACTIVE',
    },
    update: { amountStroops, interval: intervalFromDays(days), status: 'ACTIVE', nextChargeAt,
      pendingAmountStroops: null, pendingInterval: null, changeEffectiveAt: null,
      chargeFailureCount: 0, dunningStartedAt: null, nextChargeRetryAt: null,
      lastChargeFailureReason: null, chargeAttemptStartedAt: null },
  });
}

/** Persist contract-authorized changes without overwriting current-period terms. */
export async function projectSubscriptionChange(event: DecodedEvent, isNewEvent: boolean): Promise<void> {
  if (!isNewEvent) return;
  const [subscriber, creator, amount, interval, effective] = subscriptionArgs(event.value);
  const amountStroops = toBigInt(amount);
  const effectiveSeconds = toBigInt(effective);
  if (typeof subscriber !== 'string' || typeof creator !== 'string' || amountStroops === null || effectiveSeconds === null) {
    return warnUnparseable(event, 'sub_change');
  }
  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);
  await prisma.subscription.updateMany({
    where: { id: subscriptionId(tipperId, creatorId), status: 'ACTIVE' },
    data: { pendingAmountStroops: amountStroops, pendingInterval: intervalFromDays(toIntervalDays(interval)),
      changeEffectiveAt: new Date(Number(effectiveSeconds) * 1000) },
  });
}

/**
 * Project a `("sub", "exec")` event — data `(subscriber, creator, amount)`. This
 * confirms a successful recurring charge; the subscription is ensured ACTIVE and
 * its charged amount recorded. Per-charge history is out of scope (no table).
 *
 * Notifies the creator of the charge, but only for genuinely new events —
 * `isNewEvent` (from the event log) gates this, since the upsert itself is
 * idempotent and would otherwise re-notify on every replay of the same ledgers.
 */
export async function projectSubscriptionCharged(event: DecodedEvent, isNewEvent: boolean): Promise<void> {
  const [subscriber, creator, amount, chargedInterval, nextDue] = subscriptionArgs(event.value);
  const amountStroops = toBigInt(amount);
  if (typeof subscriber !== 'string' || typeof creator !== 'string' || amountStroops === null) {
    observeSubscriptionCharge('indexer', 'unparseable');
    return warnUnparseable(event, 'sub_exec');
  }

  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);

  if (!isNewEvent) return;
  observeSubscriptionCharge('indexer', 'success', { amountStroops });
  const previous = await prisma.subscription.findUnique({ where: { id: subscriptionId(tipperId, creatorId) } });
  const nextInterval = chargedInterval !== undefined ? intervalFromDays(toIntervalDays(chargedInterval)) : previous?.pendingInterval ?? previous?.interval ?? 'MONTHLY';
  const confirmedNextDue = toTimestamp(nextDue);
  const intervalDays = nextInterval === 'DAILY' ? 1 : nextInterval === 'WEEKLY' ? 7 : 30;
  await prisma.subscription.upsert({
    where: { id: subscriptionId(tipperId, creatorId) },
    create: {
      id: subscriptionId(tipperId, creatorId),
      tipperId,
      creatorId,
      amountStroops,
      interval: nextInterval,
      nextChargeAt: confirmedNextDue ?? addDays(new Date(), 30),
      status: 'ACTIVE',
    },
    update: { amountStroops, status: 'ACTIVE', interval: nextInterval,
      nextChargeAt: confirmedNextDue ?? addDays(previous?.nextChargeAt ?? new Date(), intervalDays),
      pendingAmountStroops: null, pendingInterval: null, changeEffectiveAt: null,
      chargeFailureCount: 0, dunningStartedAt: null, nextChargeRetryAt: null,
      lastChargeFailureReason: null, chargeAttemptStartedAt: null },
  });

  if (isNewEvent) {
    try {
      await notificationsService.createNotification(creatorId, 'subscription_charged', {
        tipperId,
        amountStroops: amountStroops.toString(),
      });
    } catch (err) {
      logger.error({ err, creatorId }, 'Failed to notify creator of subscription charge');
    }
  }
}

/** Project a `("sub", "cancel")` event — data `(subscriber, creator)`. */
export async function projectSubscriptionCancelled(event: DecodedEvent, isNewEvent: boolean): Promise<void> {
  if (!isNewEvent) return;
  const [subscriber, creator] = subscriptionArgs(event.value);
  if (typeof subscriber !== 'string' || typeof creator !== 'string') {
    return warnUnparseable(event, 'sub_cancel');
  }
  const tipperId = await ensureUserId(subscriber);
  const creatorId = await ensureUserId(creator);
  await prisma.subscription.updateMany({
    where: { id: subscriptionId(tipperId, creatorId) },
    data: { status: 'CANCELLED', pendingAmountStroops: null, pendingInterval: null, changeEffectiveAt: null,
      nextChargeRetryAt: null, chargeAttemptStartedAt: null },
  });
}

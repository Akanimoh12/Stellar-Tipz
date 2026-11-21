import { prisma } from '../../db/prisma.js';
import { logger } from '../../common/utils/logger.js';
import * as notificationsService from '../../modules/notifications/notifications.service.js';
import type { DecodedEvent } from '../sorobanClient.js';
import { addressArg, ensureUserId, goalId, toBigInt, toTimestamp, tupleArgs, warnUnparseable } from './helpers.js';

/**
 * Project a `("goal", "set")` event — data `(creator, target, description,
 * deadline)`. A creator has at most one on-chain goal, so the off-chain row is
 * keyed deterministically per user (`goal_<userId>`); replays upsert the same row.
 */
export async function projectGoalSet(event: DecodedEvent): Promise<void> {
  const [creator, target, description, deadline] = tupleArgs(event.value);
  const targetStroops = toBigInt(target);
  if (typeof creator !== 'string' || targetStroops === null) {
    return warnUnparseable(event, 'goal_set');
  }

  const userId = await ensureUserId(creator);
  const title = typeof description === 'string' ? description : '';
  const deadlineAt = toTimestamp(deadline);

  await prisma.goal.upsert({
    where: { id: goalId(userId) },
    create: {
      id: goalId(userId),
      userId,
      title,
      targetStroops,
      raisedStroops: 0n,
      // version defaults to 0
      deadline: deadlineAt,
      status: 'ACTIVE',
    },
    update: { title, targetStroops, deadline: deadlineAt, status: 'ACTIVE', version: { increment: 1 } },
  });
}

/**
 * Project a `("goal", "reached")` event — data `(creator, target, raised)`.
 * `raised` is the absolute amount, so the update is idempotent on replay.
 */
export async function projectGoalReached(event: DecodedEvent): Promise<void> {
  const [creator, target, raised] = tupleArgs(event.value);
  const targetStroops = toBigInt(target);
  const raisedStroops = toBigInt(raised);
  if (typeof creator !== 'string' || targetStroops === null || raisedStroops === null) {
    return warnUnparseable(event, 'goal_reached');
  }

  const userId = await ensureUserId(creator);

  const existing = await prisma.goal.findUnique({ where: { id: goalId(userId) } });

  await prisma.goal.upsert({
    where: { id: goalId(userId) },
    create: {
      id: goalId(userId),
      userId,
      title: '',
      targetStroops,
      raisedStroops,
      status: 'COMPLETED',
    },
    update: { targetStroops, raisedStroops, status: 'COMPLETED', version: { increment: 1 } },
  });

  // Only notify on the transition into COMPLETED, so replaying this event never
  // creates duplicate notifications.
  if (!existing || existing.status !== 'COMPLETED') {
    try {
      await notificationsService.createNotification(userId, 'goal_reached', {
        targetStroops: targetStroops.toString(),
        raisedStroops: raisedStroops.toString(),
      });
    } catch (err) {
      logger.error({ err, userId }, 'Failed to notify creator of goal reached');
    }
  }
}

/**
 * Project a `("goal", "completed")` event — data `(creator, goal_id, target,
 * final_amount, ledger)`. Emitted exactly once when a goal transitions to
 * completed. The upsert is idempotent on replay.
 */
export async function projectGoalCompleted(event: DecodedEvent): Promise<void> {
  const [creator, , target, finalAmount] = tupleArgs(event.value);
  const targetStroops = toBigInt(target);
  const raisedStroops = toBigInt(finalAmount);
  if (typeof creator !== 'string' || targetStroops === null || raisedStroops === null) {
    return warnUnparseable(event, 'goal_completed');
  }

  const userId = await ensureUserId(creator);

  await prisma.goal.upsert({
    where: { id: goalId(userId) },
    create: {
      id: goalId(userId),
      userId,
      title: '',
      targetStroops,
      raisedStroops,
      status: 'COMPLETED',
    },
    update: { targetStroops, raisedStroops, status: 'COMPLETED' },
  });


}

/** Project a `("goal", "cancel")` event — data `(creator,)`. */
export async function projectGoalCancelled(event: DecodedEvent): Promise<void> {
  const creator = addressArg(event.value);
  if (creator === null) {
    return warnUnparseable(event, 'goal_cancel');
  }
  const userId = await ensureUserId(creator);
  // updateMany is a no-op (not an error) when the creator has no goal row yet.
  await prisma.goal.updateMany({ where: { id: goalId(userId) }, data: { status: 'CANCELLED', version: { increment: 1 } } as never });
}

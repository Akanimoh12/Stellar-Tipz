import { logger } from '../common/utils/logger.js';
import type { DecodedEvent } from './sorobanClient.js';
import { publishProjection } from './realtime-publisher.js';
import { recordUnknownEvent, recordIndexerLedgerProcessed } from '../common/observability/metrics.js';
import { observeContractEvent } from './anomalyDetection.js';
import { persistEventLog } from './projections/eventLog.js';
import type { ProjectionHandler } from './projections/helpers.js';
import { TIP_TOPICS, projectTip } from './projections/tip.js';
import { REFUND_TOPICS, projectRefund } from './projections/refund.js';
import { projectProfileRegistered, projectProfileUpdated } from './projections/profile.js';
import { projectGoalCancelled, projectGoalCompleted, projectGoalReached, projectGoalSet } from './projections/goal.js';
import {
  projectSubscriptionCancelled,
  projectSubscriptionChange,
  projectSubscriptionCharged,
  projectSubscriptionCreated,
} from './projections/subscription.js';
import { projectCreditScoreUpdated } from './projections/credit.js';

/**
 * Per-topic projection handlers. Each handler lives in its own module under
 * `./projections/` and is idempotent: re-running it over the same event never
 * produces a duplicate row. Topics are the canonical `_`-joined names decoded
 * from the contract's topic tuples (see `decodeTopic`). Tips and refunds are
 * routed separately below.
 */
const PROJECTIONS: Record<string, ProjectionHandler> = {
  profile_register: projectProfileRegistered,
  profile_updated: projectProfileUpdated,
  goal_set: projectGoalSet,
  goal_reached: projectGoalReached,
  goal_completed: projectGoalCompleted,
  goal_cancel: projectGoalCancelled,
  sub_created: projectSubscriptionCreated,
  sub_change: projectSubscriptionChange,
  sub_exec: projectSubscriptionCharged,
  sub_cancel: projectSubscriptionCancelled,
  credit_updated: projectCreditScoreUpdated,
};

/**
 * Project a decoded on-chain event into the off-chain store. Every projection is
 * idempotent: re-running over the same ledgers never produces duplicate rows.
 *
 * Once the projection has been written, the event is published to the realtime
 * layer (see `realtime-publisher.ts`) — but only the first time it's seen, so
 * replaying the same ledgers never re-broadcasts.
 */
export async function projectEvent(event: DecodedEvent): Promise<void> {
  const isNewEvent = await persistEventLog(event);
  if (isNewEvent) observeContractEvent(event);

  if (TIP_TOPICS.has(event.topic)) {
    await projectTip(event);
    if (isNewEvent) {
      await publishProjection(event);
    }
    recordIndexerLedgerProcessed(event.ledger);
    return;
  }

  const handler = PROJECTIONS[event.topic];
  if (handler) {
    await handler(event, isNewEvent);
  } else if (!REFUND_TOPICS.has(event.topic)) {
    // Unknown event type or version (issue #1261). The raw event was already
    // persisted to EventLog above, so it can be replayed once a decoder ships.
    // Surface it loudly and count it — never crash or stall the pipeline.
    logger.warn(
      { txHash: event.txHash, topic: event.topic, ledger: event.ledger },
      'Indexer encountered an unknown event type/version; raw event persisted to EventLog',
    );
    recordUnknownEvent();
  }
  if (REFUND_TOPICS.has(event.topic)) {
    await projectRefund(event);
  }

  if (isNewEvent) {
    await publishProjection(event);
  }
  recordIndexerLedgerProcessed(event.ledger);
}

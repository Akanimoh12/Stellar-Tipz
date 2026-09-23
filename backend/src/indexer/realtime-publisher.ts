import { redis } from '../db/redis.js';
import { logger } from '../common/utils/logger.js';
import type { DecodedEvent } from './sorobanClient.js';

/**
 * Redis pub/sub channel the realtime gateway (Socket.IO) subscribes to.
 * The gateway re-broadcasts messages on this channel to connected clients;
 * see the `initRealtime` hookup in `src/server.ts`.
 */
export const REALTIME_PROJECTION_CHANNEL = 'realtime:projections';

/** Message broadcast to the realtime layer after an event has been projected. */
export interface RealtimeProjectionMessage {
  /** Canonical contract event topic, e.g. `tip_sent`, `goal_set`. */
  topic: string;
  /** Ledger sequence the event was emitted in. */
  ledger: number;
  /** Transaction hash the event was emitted in. */
  txHash: string;
  /** Decoded on-chain payload, as handed to the projection. */
  data: unknown;
  /** Unix-ms timestamp the message was published at. */
  publishedAt: number;
}

/**
 * Publish a projected event to the realtime pub/sub layer.
 *
 * Best-effort: a Redis failure is logged and swallowed rather than thrown, so
 * an outage in the realtime layer never blocks indexing or cursor advance.
 * Callers should only invoke this for events that were newly projected (not
 * replays), so re-running over the same ledgers does not re-broadcast.
 */
export async function publishProjection(event: DecodedEvent): Promise<void> {
  const message: RealtimeProjectionMessage = {
    topic: event.topic,
    ledger: event.ledger,
    txHash: event.txHash,
    data: event.value ?? null,
    publishedAt: Date.now(),
  };

  try {
    await redis.publish(REALTIME_PROJECTION_CHANNEL, JSON.stringify(message));
  } catch (err) {
    logger.error(
      { err, txHash: event.txHash, topic: event.topic },
      'Failed to publish projection to realtime layer',
    );
  }
}
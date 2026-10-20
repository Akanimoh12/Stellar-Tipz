import { publishRoomEvent } from '../realtime/catchup.js';
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
    const encoded = JSON.stringify(message, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value);
    await redis.publish(REALTIME_PROJECTION_CHANNEL, encoded);
    // Creator topics are public; never route arbitrary payload user IDs into private rooms.
    const rawValue = event.value;
    const value = Array.isArray(rawValue) && (rawValue[0] === 1 || rawValue[0] === '1') ? rawValue.slice(1) : rawValue;
    const creator = Array.isArray(value) ? value[1] :
      value && typeof value === 'object' ? (value as Record<string, unknown>).to : undefined;
    if (['tip', 'tip_sent', 'sub_created', 'sub_exec', 'sub_cancel', 'sub_change'].includes(event.topic) &&
        typeof creator === 'string' && /^[A-Z0-9]+$/.test(creator)) {
      await publishRoomEvent(`creator:${creator}`, 'projection.created', JSON.parse(encoded));
    }
  } catch (err) {
    logger.error(
      { err, txHash: event.txHash, topic: event.topic },
      'Failed to publish projection to realtime layer',
    );
  }
}
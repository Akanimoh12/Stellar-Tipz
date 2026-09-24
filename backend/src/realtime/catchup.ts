import { z } from 'zod';
import { redis } from '../db/redis.js';
import { env } from '../config/env.js';

export const ROOM_EVENT_CHANNEL = 'realtime:room-events';
export const catchupRequestSchema = z
  .object({
    room: z
      .string()
      .max(200)
      .regex(/^(creator:[A-Z0-9]+|user:[a-zA-Z0-9_-]+|leaderboard)$/),
    lastSeenId: z
      .string()
      .regex(/^\d+-\d+$/)
      .max(50),
  })
  .strict();

export interface RoomEvent {
  id: string
  room: string
  event: string
  payload: unknown
}

// Appending and publishing together gives every gateway the same per-room order.
const APPEND = `
local id = redis.call('XADD', KEYS[1], 'MAXLEN', '=', ARGV[1], '*', 'event', ARGV[3], 'payload', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('PUBLISH', ARGV[5], cjson.encode({id=id, room=ARGV[6], event=ARGV[3], payload=cjson.decode(ARGV[4])}))
return id
`;

/** Store a bounded recent event and fan it out to all gateways. */
export async function publishRoomEvent(
  room: string,
  event: string,
  payload: unknown,
): Promise<void> {
  await redis.eval(
    APPEND,
    1,
    `realtime:recent:${room}`,
    env.REALTIME_CATCHUP_LIMIT,
    env.REALTIME_CATCHUP_TTL_SECONDS,
    event,
    JSON.stringify(payload),
    ROOM_EVENT_CHANNEL,
    room,
  );
}

/** Read one atomic snapshot so trimming cannot race with overflow detection. */
export async function catchUp(
  room: string,
  lastSeenId: string,
): Promise<{
  events: RoomEvent[]
  refreshRequired: boolean
}> {
  const rows = await redis.xrange(`realtime:recent:${room}`, '-', '+');
  const cursor = rows.findIndex(([id]) => id === lastSeenId);
  if (cursor === -1) return { events: [], refreshRequired: true };
  return {
    refreshRequired: false,
    events: rows.slice(cursor + 1).map(([id, fields]) => {
      const values = Object.fromEntries(
        Array.from({ length: fields.length / 2 }, (_, i) => [fields[i * 2], fields[i * 2 + 1]]),
      );
      return { id, room, event: values.event, payload: JSON.parse(values.payload) as unknown };
    }),
  };
}

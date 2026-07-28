# Realtime Module

Socket.IO gateway that pushes tip and notification events to connected
clients. See `src/realtime/`.

## Components

| File | Purpose |
|------|---------|
| `types.ts` | Shared typed contract: event names + payloads, `SocketData` |
| `auth.ts` | Handshake middleware — verifies the same JWT the REST API issues |
| `rateLimit.ts` | Per-IP connection throttling and per-socket event throttling |
| `gateway.ts` | Server init, room management, `emitTipCreated` / `emitNotificationCreated` / `emitLeaderboardUpdated`, Redis adapter wiring |

## Connecting

Clients authenticate on the handshake, not via a separate event:

```ts
import { io } from 'socket.io-client';

const socket = io(API_URL, {
  auth: { token: accessToken }, // the same access token used for REST calls
  transports: ['websocket'],
});

socket.on('connected', ({ userId }) => { /* handshake accepted */ });
socket.on('error', ({ code, message }) => { /* FORBIDDEN, RATE_LIMITED, ... */ });
```

A connection with a missing or invalid token is rejected before `connection`
fires — the client only sees `connect_error`.

## Event contract

The full typed contract lives in `types.ts` (`ServerToClientEvents`,
`ClientToServerEvents`). Summary:

- **Client → server:** `subscribe:creator`, `subscribe:notifications`,
  `subscribe:leaderboard`, `unsubscribe:creator`, `unsubscribe:notifications`,
  `unsubscribe:leaderboard`
- **Server → client:** `connected`, `error`, `tip.created`,
  `notification.created`, `balance.updated`, `leaderboard.updated`

Subscribing to another user's `notifications` room is rejected with an
`error` event (`code: 'FORBIDDEN'`) — a socket may only subscribe to its own
`user:<userId>` room.

`subscribe:creator` and `subscribe:leaderboard` have no such restriction —
tip feeds and the leaderboard are public data, so any authenticated socket
may join those rooms.

### leaderboard.updated

Broadcast to every socket in the public `leaderboard` room whenever a
confirmed tip changes a creator's rank (emitted from the tip confirmation
flow — see `modules/tips/tips.controller.ts`). Best-effort: a failure to
compute the new rank never blocks the tip confirmation response.

```ts
socket.emit('subscribe:leaderboard');
socket.on('leaderboard.updated', ({ window, entry }) => {
  // entry: { rank, userId, stellarAddress, totalTips }
});
```

## Heartbeat

The server pings each client on a fixed interval and disconnects it if no
pong is received within the timeout (configured in `gateway.ts`):

- `pingInterval`: 25s — how often the server probes the connection
- `pingTimeout`: 20s — how long it waits for a response before dropping it

These are handled by Socket.IO's engine (no application code needed) and
detect dead connections (e.g. a laptop going to sleep or a dropped Wi-Fi
network) faster than waiting on a TCP timeout.

## Reconnection

`socket.io-client` reconnects automatically by default (exponential backoff,
capped, with jitter). Important behavior to build clients against:

- **Rooms are not restored automatically.** On `reconnect`, re-issue
  `subscribe:creator` / `subscribe:notifications` for anything the client
  still cares about — the server has no memory of a socket's prior rooms
  once it disconnects.
- **The auth token is re-sent on every reconnect attempt** (it's read from
  the `auth` option passed to `io(...)`, not cached per-connection). If the
  token expires while offline, refresh it before the client comes back
  online so reconnection doesn't loop into `connect_error`.
- Recommended client wiring:

```ts
socket.on('reconnect', () => {
  socket.emit('subscribe:notifications', currentUserId);
  socket.emit('subscribe:creator', watchedCreatorAddress);
});
```

## Rate limiting

Two independent limiters, both in-memory per server process (see
`rateLimit.ts`):

- **Connections:** 20 new connections per IP per 60s window, enforced as a
  handshake middleware before auth runs.
- **Events:** 30 client→server events per socket per 10s window, enforced at
  the top of every event handler.

Exceeding the connection limit rejects the handshake (`connect_error`).
Exceeding the event limit emits `error` (`code: 'RATE_LIMITED'`) and drops
that event; the socket stays connected.

## Horizontal scaling (Redis adapter)

Rooms (`creator:*`, `user:*`, `leaderboard`) only exist in the memory of the
Socket.IO instance a socket connected to. Running more than one backend
instance requires the [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/)
so an `emit*` call on one instance reaches sockets connected to another.

`initRealtime` attaches the adapter automatically using two dedicated
connections duplicated from the shared `ioredis` client (`src/db/redis.js`) —
a pub/sub subscriber can't issue other Redis commands on the same connection,
so a plain client can't be reused here.

Controlled by `REALTIME_REDIS_ADAPTER_ENABLED` (see `.env.example`):

- `true` (default) — attach the adapter. Required once more than one backend
  instance is running behind a load balancer.
- `false` — skip it, e.g. for a single-instance local dev setup. The test
  suite sets this to `false` (see `vitest.setup.ts`) so tests don't need a
  live Redis pub/sub connection.

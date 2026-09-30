# Realtime Module Documentation

This module provides real-time communication between the backend and frontend using Socket.IO with built-in backpressure handling to prevent memory exhaustion.

## Overview

The realtime module implements WebSocket-based communication with graceful degradation when clients cannot keep up with message rates. This prevents a slow-loris-like attack where many slow clients starve the server's memory.

## Backpressure Handling (Issue #1286)

### Problem: Slow Client Attack

A slow client that cannot consume messages fast enough causes Socket.IO to buffer outbound messages on the server:

```
Server → [Buffer] → Slow Client
         (grows unbounded)
```

Many slow clients can exhaust server memory, causing OOM crashes — invisible until production.

### Solution: Per-Connection Buffer Limits

The realtime module enforces per-connection outbound buffer limits:

1. **Monitor buffer size** on each connection every 1 second
2. **Alert at 80% capacity** to indicate high pressure
3. **Disconnect at 100% capacity** with clear reason code
4. **Track metrics** for alerting and debugging

### Configuration

```typescript
// Environment variables (backend/src/config/env.ts)
SOCKET_IO_MAX_BUFFER_SIZE=1048576              // 1MB per connection
SOCKET_IO_CONNECTION_TIMEOUT_MS=30000          // 30 seconds
SOCKET_IO_HEARTBEAT_INTERVAL_MS=25000          // 25 seconds
```

### Buffer Pressure Thresholds

- **0-80% (0-800KB)**: Normal operation
- **80-100% (800KB-1MB)**: Pressure warning logged
- **>100% (>1MB)**: Connection disconnected

### Client Disconnect Reason

When a client exceeds the buffer limit, it receives:

```typescript
{
  reason: "client_buffer_exceeded",
  bufferSize: 1200000,
  maxBufferSize: 1048576
}
```

The client can retry with exponential backoff or user interaction to resync.

## Event Throttling

For high-frequency events, per-connection throttling prevents buffer buildup:

```typescript
import { throttleEventPerConnection } from './backpressure.js';

io.on('connection', (socket) => {
  socket.on('request_live_updates', () => {
    // Emit updates no faster than every 100ms per client
    throttleEventPerConnection(
      socket,
      'live_update',
      { data: 'value' },
      100 // throttleMs
    );
  });
});
```

### Broadcast with Backpressure

For broadcasting to many clients safely:

```typescript
import { broadcastWithBackpressure } from './backpressure.js';

const io = getIO();
broadcastWithBackpressure(io, 'leaderboard_update', leaderboardData, {
  throttleMs: 500,
  filterSockets: (socket) => socket.data.subscribed,
});
```

## Channel Subscriptions

Clients subscribe/unsubscribe from channels to reduce unnecessary events:

```typescript
// Client-side
socket.emit('subscribe', 'leaderboard:weekly');
socket.on('leaderboard:weekly', (data) => {
  updateLeaderboard(data);
});

socket.emit('unsubscribe', 'leaderboard:weekly');
```

## Monitoring

### Real-Time Connection Metrics

```typescript
import { getConnectionMetrics } from './backpressure.js';

const metrics = getConnectionMetrics();
// {
//   totalConnections: 150,
//   highPressureConnections: 5,
//   averageBufferSize: 204800
// }
```

### Exposing Metrics to Admin API

```typescript
app.get('/api/v1/admin/realtime/metrics', (req, res) => {
  const metrics = getConnectionMetrics();
  res.json(metrics);
});
```

### Alerting

Alert on:
- High-pressure connections > 10% of total
- Average buffer size > 50% of limit
- Rapid disconnect spikes (indicates DoS or network issues)

## Load Testing

### Slow Client Load Test

Verify that backpressure handling keeps memory bounded:

```bash
npx tsx src/modules/realtime/slow-client.loadtest.ts
```

Test configuration:
- **100 slow clients** each with 500ms message processing delay
- **High-frequency events** sent every 100ms (5x the client processing rate)
- **Duration**: 30 seconds
- **Expected**: Memory usage bounded, clients cleanly disconnected

**Sample output:**
```
✅ Memory usage stayed bounded despite slow clients
⚠️  65.0% of slow clients were disconnected (expected behavior)
```

### Load Test Interpretation

If slow clients are disconnected:
- ✅ Backpressure handling is working correctly
- Memory stayed bounded despite extreme load

If memory grows unbounded:
- ❌ Backpressure limits may be too high or misconfigured
- Reduce `SOCKET_IO_MAX_BUFFER_SIZE` or tune frequency

## Integration Points

### Using Realtime in Modules

```typescript
import { getIO } from '../realtime/realtime.js';

// In a job processor, notify clients of updates
export async function handleSubscriptionChargeJob(job) {
  const io = getIO();
  
  // Emit to specific user channel
  io.to(`user:${job.data.userId}`).emit('subscription_charged', {
    subscriptionId: job.data.subscriptionId,
    amount: job.data.amount,
  });
}
```

### Lifecycle Management

Realtime is initialized with the HTTP server and gracefully shut down via the lifecycle manager:

```typescript
// server.ts
initRealtime(httpServer);
registerClosable({
  name: 'Realtime Gateway',
  close: closeRealtime,
});
```

## Security Considerations

1. **CORS**: Only allow specified origins in `CORS_ORIGIN`
2. **Authentication**: Require JWT for realtime operations (implement in auth middleware)
3. **Rate Limiting**: Enforce on events from clients
4. **Channel Authorization**: Validate user can subscribe to a channel

### Future: Add Auth Middleware

```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const user = await verifyJWT(token);
    socket.data.userId = user.id;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});
```

## Best Practices

1. **Don't emit to `io.emit()`** without careful rate limiting — reaches all clients
2. **Use channels** for targeted broadcasts: `io.to('leaderboard:weekly')`
3. **Throttle high-frequency events**: `throttleMs: 100` or higher
4. **Monitor metrics** in production: set up alerts for high pressure
5. **Test with slow clients**: run load test before each release

## Performance Tuning

### For High-Frequency Events

If you have many events per second per client, increase heartbeat:

```bash
SOCKET_IO_HEARTBEAT_INTERVAL_MS=50000       # 50s instead of 25s
```

### For Many Connections

Scale concurrency in deployment infrastructure:
- Load balance Socket.IO across multiple processes
- Use Redis adapter for pub/sub between nodes
- Monitor per-node connection count

## References

- **Issue #1286**: Add realtime backpressure handling
- **Socket.IO Docs**: https://socket.io/docs/v4/
- **Backpressure Pattern**: https://nodejs.org/en/docs/guides/backpressuring-in-streams/

## Troubleshooting

### Clients constantly disconnecting

**Symptom**: `[log] Slow client disconnected due to backpressure`

**Cause**: Events arriving faster than client can process

**Fix**:
1. Increase throttle delay on high-frequency events
2. Increase `SOCKET_IO_MAX_BUFFER_SIZE`
3. Check client network speed (packet loss can cause slowness)

### High memory usage with few clients

**Symptom**: Memory grows despite low connection count

**Cause**: Unthrottled high-frequency events

**Fix**:
1. Add `throttleMs` to event emissions
2. Check that `removeOnComplete` is set for old events
3. Monitor with load test to establish baseline

### "too many open files" errors

**Symptom**: `Error: EMFILE: too many open files`

**Cause**: System file descriptor limit exceeded

**Fix**:
```bash
ulimit -n 65536     # Increase to 65K
```

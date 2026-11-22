# Jobs Module Documentation

This module manages background job queues and worker processes for Stellar Tipz. All money-moving and state-mutating operations are tracked for compliance and reliability.

## Overview

The jobs system uses [BullMQ](https://docs.bullmq.io/) for job queue management with Redis as the backing store. Each queue has configurable concurrency limits tied to the database connection pool.

## Queue Configuration (Issue #1288)

### Environment Variables

Worker concurrency is controlled via environment variables:

```bash
# Money-moving operations — conservative defaults
WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE=2  # Default: 2

# Standard operations
WORKER_CONCURRENCY_IPFS_PIN=3              # Default: 3
WORKER_CONCURRENCY_IPFS_CLEANUP=2          # Default: 2
WORKER_CONCURRENCY_X_REFRESH=1             # Default: 1

# Database pool configuration
DATABASE_POOL_SIZE=20                       # Default: 20 connections
```

### Concurrency Budget

The total worker concurrency must not exceed `DATABASE_POOL_SIZE`. The system performs a startup check and warns if configured concurrency would starve the connection pool:

```
⚠️  WARNING: Total worker concurrency exceeds database connection pool budget!
    This may exhaust connections and cause pool starvation.
    Adjust WORKER_CONCURRENCY_* or DATABASE_POOL_SIZE environment variables.
```

### Recommended Defaults by Environment

**Development:**
```bash
WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE=1
WORKER_CONCURRENCY_IPFS_PIN=2
WORKER_CONCURRENCY_IPFS_CLEANUP=1
WORKER_CONCURRENCY_X_REFRESH=1
DATABASE_POOL_SIZE=20
```

**Production (scale proportionally):**
```bash
WORKER_CONCURRENCY_SUBSCRIPTION_CHARGE=5   # Critical path
WORKER_CONCURRENCY_IPFS_PIN=8
WORKER_CONCURRENCY_IPFS_CLEANUP=4
WORKER_CONCURRENCY_X_REFRESH=2
DATABASE_POOL_SIZE=50                       # Larger pool for prod
```

### Safety Rules

1. **Money-moving queues default to conservative concurrency** (e.g., `subscription-charge` defaults to 2).
2. **Startup warning** prevents well-meaning changes from silently starving the pool.
3. **Concurrency = 0 is allowed** to disable a queue entirely.

## Queue Monitoring and Metrics (Issue #1287)

### Real-Time Queue Metrics

Queue depth and performance metrics are captured continuously. Check current queue health:

```typescript
import { getQueueHealthStatus } from './monitoring.service.js';

const health = await getQueueHealthStatus();
// Returns: { queueName, waiting, active, delayed, failed, oldestWaitingAge }
```

### Metrics Captured

- **waiting**: Jobs pending execution (best signal for autoscaling)
- **active**: Jobs currently being processed
- **delayed**: Jobs scheduled for future execution
- **failed**: Permanently failed jobs
- **oldestWaitingAge**: Age in seconds of the oldest waiting job (null if queue is empty)

### Oldest Job Age

The most important signal for queue health is **oldestWaitingAge**, which catches cases where:
- Raw depth looks fine, but one job is stuck for hours
- The queue is not backing up, but latency is degrading

### Historical Metrics

Queue metrics are persisted to the `QueueMetric` table for historical analysis:

```typescript
import { getQueueMetricsHistory } from './monitoring.service.js';

const history = await getQueueMetricsHistory('subscription-charge', 24); // Last 24 hours
```

### Automatic Alerts

The monitoring service emits warnings for:

1. **Queue depth > 100 jobs waiting**
   ```
   Queue depth alert: >100 jobs waiting
   ```

2. **Oldest job waiting > 5 minutes**
   ```
   Queue depth alert: jobs waiting for >5 minutes
   ```

### Autoscaling Signals

Queue metrics are shaped for use with Kubernetes HPA or similar autoscaling:

```yaml
# Example HPA rule: scale up if median waiting jobs > 50
metrics:
- type: Pods
  pods:
    metric:
      name: queue_waiting_count
    target:
      averageValue: "50"
```

## Job Execution Audit Logging (Issue #1289)

### Overview

All money-moving and state-mutating jobs write audit entries for compliance. Audit writes are **best-effort** — a failure to log an audit entry must not roll back a completed charge.

### Audit Log Fields

```typescript
{
  action: string           // "job_execution:subscription-charge"
  actorType: string        // "system"
  actorId: string          // Job name
  trigger: string          // "scheduled" or "manual"
  input: Json             // Job input parameters
  outcome: string         // "success" or "failure"
  error?: string          // Error message if failed
  durationMs?: number     // Execution time
  resourceId?: string     // e.g., subscription ID
  resourceType?: string   // e.g., "subscription"
  createdAt: DateTime
}
```

### Audit Log Usage

In a job processor:

```typescript
import { logJobExecution } from './audit.service.js';

export async function handleSubscriptionCharge(job) {
  const startTime = Date.now();
  try {
    // ... perform charge ...
    
    await logJobExecution('subscription-charge', job.data, 'success', {
      durationMs: Date.now() - startTime,
      resourceId: job.data.subscriptionId,
      resourceType: 'subscription',
    });
  } catch (error) {
    logger.error({ error }, 'Job failed');
    
    // Log failure without blocking the job retry logic
    await logJobExecution('subscription-charge', job.data, 'failure', {
      error: error.message,
      durationMs: Date.now() - startTime,
      resourceId: job.data.subscriptionId,
      resourceType: 'subscription',
    });
    
    throw error; // Let BullMQ retry
  }
}
```

### Best-Effort Logging

If audit logging fails, it is logged loudly but does not block the job:

```typescript
// audit.service.ts
catch (error) {
  logger.error({ error, action: ... }, 'Failed to write audit log (best-effort, continuing)');
}
```

This ensures:
- A subscription charge that succeeded is never rolled back due to audit failure
- Audit failures are visible in logs for investigation
- Compliance audits can detect missing entries and trigger alerts

## Adding New Queues

1. Update `queue.factory.ts` to add your queue config:
   ```typescript
   {
     name: 'my-queue',
     concurrency: env.WORKER_CONCURRENCY_MY_QUEUE || 2,
     description: 'My new queue',
     isMoneyMoving: false,
   }
   ```

2. Add environment variable to `env.ts`:
   ```typescript
   WORKER_CONCURRENCY_MY_QUEUE: z.coerce.number().default(2),
   ```

3. Create a worker processor and register it in `server.ts`:
   ```typescript
   const myWorker = await createWorker('my-queue', handleMyJob);
   registerClosable({ name: 'MyWorker', close: () => myWorker.close() });
   ```

## Testing

### Unit Tests

Test individual processors:
```bash
npm run test -- jobs.test.ts
```

### Load Testing

Test queue behavior under load:
```bash
# See docs/load-testing/ for slow-client load test (issue #1286)
```

## Monitoring in Production

Use the metrics endpoints to integrate with your observability stack:

```bash
GET /api/v1/admin/queues/health      # Current queue depths
GET /api/v1/admin/queues/metrics      # Historical metrics
GET /api/v1/admin/audit-logs          # Recent audit logs
```

## References

- **Issue #1289**: Job execution audit logging
- **Issue #1288**: Worker concurrency configuration and tuning
- **Issue #1287**: Queue depth monitoring and autoscaling signals
- **BullMQ Docs**: https://docs.bullmq.io/

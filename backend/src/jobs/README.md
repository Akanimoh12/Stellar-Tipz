# Background Jobs & Workers

This directory contains the background processing architecture for the Stellar Tipz real-time off-chain backend. We use [BullMQ](https://docs.bullmq.io/) backed by **Redis** to reliably manage job queues, schedules, and retries.

## Directory Structure
- `index.ts`: The central export point for all configured queues and workers.
- `main.ts`: Bootstraps all workers and registers them for graceful shutdown.
- `queueFactory.ts`: Creates lazy singleton queue instances.
- `scheduler.ts`: Manages repeatable (cron) job scheduling.
- `deadLetter.ts`: Persists jobs exhausted all retries for inspection.
- `webhookDelivery.ts`: Manages the `webhook-delivery` queue, which safely dispatches HTTP POST webhooks to external clients with automatic HMAC signing, timeout handling, and exponential backoff on transient failures.
- `*Queue.ts`: Queue accessor files for each worker (e.g., `creditRecompute.queue.ts`).
- `*Worker.ts`: Worker implementations and job handlers (e.g., `creditRecompute.worker.ts`).

## 1. Queues
Queues are responsible for holding jobs until they are processed. They are initialized utilizing the shared Redis connection located in `src/db/redis.ts`.

### Best Practices for Queues:
- **Idempotency:** Ensure that the data payload submitted to a queue is deterministic. Do not pass complex class instances; instead, pass scalar IDs and pure JSON objects.
- **Backoff & Retries:** Configure queues with standard failure handling. E.g., exponential backoff (`delay: 2000`, `attempts: 5`).

## 2. Workers
Workers actively listen to Queues and process jobs as they arrive.
In a production environment, you may scale workers independently of the main API server to increase throughput.

### How to Run Workers Locally
For local development, workers are instantiated directly in the application runtime via `src/jobs/index.ts` alongside the Express API server. 

When you start the local dev server, the workers will automatically begin processing:
```bash
npm run dev
```
*(Make sure your local Redis instance is running via `docker compose -f backend/docker-compose.yml up -d`)*

### Error Handling
Workers should **throw** an Error (`throw new Error(...)`) whenever a job fails due to an external factor (e.g., a non-2xx HTTP status from a webhook). Throwing an error natively leverages BullMQ's automatic retry logic.
Listen for the `failed` event on your worker to log issues via the shared `logger`.

### Dead Letter Jobs
Jobs that exhaust all of their BullMQ retry attempts are automatically persisted to the `DeadLetterJob` model by `attachDeadLetterHandler()`, so they remain inspectable after BullMQ prunes them from Redis. Every worker wired in `main.ts` calls this handler, so failed jobs never disappear from the database.

Query dead-lettered jobs:
```typescript
import { listDeadLetterJobs } from '../../jobs/index.js';

const failed = await listDeadLetterJobs({ queue: 'x-metrics-refresh' });
failed.forEach(job => {
  console.log(`${job.queue} / ${job.jobName} failed: ${job.failedReason}`);
});
```

## 3. Schedules (Cron Jobs)
Scheduled or recurring tasks (e.g., daily cleanup, stale tip sweeps) can be implemented using BullMQ's [Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable).
To schedule a recurring job, use the `repeat` option when adding it to the queue:
```typescript
await myQueue.add(
  'daily-cleanup',
  { },
  { repeat: { pattern: '0 0 * * *' } } // Every midnight
);
```

## Subscription charge dunning

The subscription sweep submits the real on-chain
`execute_due_subscription(subscriber, creator)` operation. It never creates a
synthetic confirmed tip; indexed contract events remain the source of truth for
on-chain activity. A submitted transaction is successful only after RPC
confirmation reports final `SUCCESS`; pending and duplicate submissions are
polled by hash for up to 60 seconds, while timeout or final failure enters the
normal dunning path.

For each billing cycle, the initial attempt happens when `nextChargeAt` is due.
Retryable failures enter `PAST_DUE` and use persisted retry times anchored to
`dunningStartedAt`:

- failure 1: retry on day 1;
- failure 2: retry on day 3;
- failure 3: retry on day 7;
- failure 4 (the day-7 retry): transition to `FAILED` with no further retry.

`ACTIVE` means normal recurring billing, `PAST_DUE` means a recoverable charge
is waiting for a retry, and `FAILED` is terminal and is never selected by the
sweep. Permanent failures skip the schedule and transition directly to
`FAILED`.

Insufficient balance (contract code 14), a paused contract (7), rate limiting
(27), and network/RPC failures are retryable. Missing or revoked authorization
(3 or 17), invalid amount/configuration (13), and permanently unusable
subscription state are terminal. Unknown infrastructure and contract failures
default to the bounded retry schedule.

The subscriber receives `subscription_charge_failed` for every failed attempt.
The creator receives `subscription_failed` only on the terminal transition.
These operational notifications are not controlled by the unrelated
`subscriptionCharged` preference. Notification delivery failures are logged
after financial state is persisted.

On recovery, dunning fields are cleared, the subscription returns to `ACTIVE`,
and `nextChargeAt` advances by exactly one interval from its existing billing
anchor, matching the contract. A sweep performs at most one attempt per
subscription, so missed intervals are never processed in an in-memory catch-up
loop. A persisted, expiring claim prevents concurrent sweeps from submitting
the same selected attempt.

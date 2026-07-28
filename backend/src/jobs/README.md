# Background Jobs & Workers

This directory contains the background processing architecture for the Stellar Tipz real-time off-chain backend. We use [BullMQ](https://docs.bullmq.io/) backed by **Redis** to reliably manage job queues, schedules, and retries.

## Directory Structure
- `index.ts`: The central export point for all configured queues and workers.
- `webhookDelivery.ts`: Manages the `webhook-delivery` queue, which safely dispatches HTTP POST webhooks to external clients with automatic HMAC signing, timeout handling, and exponential backoff on transient failures.

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

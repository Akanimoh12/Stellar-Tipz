# ADR-013: Background job queue selection

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Core team

## Context

The backend needs asynchronous processing for tasks that are not safe to run inline in the HTTP request path: scheduled payouts, social metrics refresh, leaderboard snapshots, notification digest generation, and other retryable operations. We also need backoff and visibility for failed jobs.

Constraints:
- Long-running work should not block API requests.
- Failures must be retried with controlled backoff.
- Job state must be inspectable for troubleshooting and operational recovery.
- The queue platform should fit the existing Redis usage and work well in a Node.js ecosystem.

## Options considered

1. **Inline processing in request handlers** — execute work immediately in the HTTP route or after response.
   - *Pros:* minimal infra; easier to reason about in a small prototype.
   - *Cons:* request latency spikes; poor retry semantics; no job visibility or isolation; brittle in production.

2. **Custom queue on top of Redis streams or ad hoc cron scripts** — build a tailored scheduler and worker model.
   - *Pros:* direct control over the event flow; no dependency on a queue framework.
   - *Cons:* reinvents retry semantics, dead-letter handling, and scheduling; much higher maintenance cost.

3. **BullMQ backed by Redis** — use a battle-tested queue framework with retries, repeatable jobs, and worker isolation.
   - *Pros:* mature API, excellent Redis integration, built-in retry/backoff, dead-letter handling, diagnostics, and scheduling support.
   - *Cons:* adds another operational dependency, but one that fits the backend already.

## Decision

**Use BullMQ with Redis as the project’s background job platform** (Option 3).

The system uses queues for:
- delayed and scheduled work;
- task retries with exponential backoff;
- dead-letter inspection after retry exhaustion;
- recurring maintenance and aggregation jobs.

## Rationale

- The off-chain backend already depends on Redis for shared state and caching, so the queue layer fits naturally into the operational model.
- BullMQ provides the robustness that a simple cron-based or inline approach cannot match without higher maintenance costs.
- Worker isolation makes it easier to keep the API server responsive while expensive jobs run in the background.

## Consequences

- Positive: improved reliability, bounded runtime in request paths, and straightforward operational debugging of failed jobs.
- Negative / cost: there is a new failure mode to monitor (queue connectivity, Redis outages, stuck jobs), and idempotent job design matters.
- Follow-ups or risks to revisit: every job must be deterministic and safe to retry; queue-level observability should remain part of the production runbook.

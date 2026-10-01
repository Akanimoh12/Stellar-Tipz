# ADR-012: Realtime architecture and room model

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Core team

## Context

Users need immediate feedback when creator pages change, tips arrive, balances update, or notifications are created. We need a shared realtime mechanism that scales across multiple backend instances while preserving privacy and avoiding noisy fan-out.

Constraints:
- Only the intended user or creator should receive private room updates.
- Realtime should not require the browser to poll constantly.
- The backend may run with more than one process or container in production.
- Catch-up is needed when a socket reconnects or a client resumes after a disconnect.

## Options considered

1. **Client-side polling for updates** — the frontend periodically calls the API to detect new activity.
   - *Pros:* simple to implement.
   - *Cons:* expensive for both frontend and backend; stale updates; poor user experience; no efficient fan-out for many subscribers.

2. **Direct server-sent events or ad hoc WebSockets** — build a dedicated push path without a shared pub/sub layer.
   - *Pros:* lower initial complexity than a distributed broker.
   - *Cons:* does not scale horizontally; room fan-out is hard to share across instances; reconnect/catch-up logic becomes inconsistent.

3. **Socket.IO + Redis adapter with per-user and per-creator room subscriptions** — the backend fans out events through a shared Redis channel and keeps room-level security checks.
   - *Pros:* supports multi-instance deployments; clean room model; catch-up and reconnect semantics are manageable; works well for notifications and leaderboard updates.
   - *Cons:* requires Redis and careful room permissioning.

## Decision

**Use Socket.IO with a Redis-backed adapter and explicit room subscriptions** (Option 3).

The system creates:
- a public leaderboard room for global feed updates;
- a creator room keyed by creator address for creator-specific updates;
- a user room keyed by user ID for private notifications;
- a catch-up mechanism that replays missed events after reconnect.

## Rationale

- Realtime is a product requirement, not a convenience. The web experience is much more responsive when updates arrive eagerly.
- A Redis adapter keeps the same room semantics even when there are multiple Socket.IO nodes behind a load balancer.
- The room model preserves security: a client cannot subscribe to another creator or another user’s notification room.

## Consequences

- Positive: lower latency, better UX, cleaner multi-instance deployment, and secure room boundaries.
- Negative / cost: requires Redis and careful event validation; must keep catch-up logic bounded to avoid unbounded memory growth.
- Follow-ups or risks to revisit: document room contracts, enforce rate limiting on socket events, and keep catch-up TTLs short and bounded.

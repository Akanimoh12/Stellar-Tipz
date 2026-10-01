# ADR-010: Off-chain backend rationale

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Core team

## Context

The Soroban contract gives Stellar Tipz a small, deterministic on-chain state machine, but it is not a complete application backend. Product needs include authenticated sessions, profile editing, API responses, search, notification delivery, analytics, and time-based jobs that are too expensive or too mutable to keep in contract storage.

Constraints:
- The contract must remain the source of truth for balances, fees, and ownership transitions.
- The backend must serve end-user requests with low latency and richer search/filtering than raw RPC data can provide.
- Realtime updates and batch jobs need durable state outside the chain.
- Every user-facing feature should still be explainable through contract events and audit logs.

## Options considered

1. **Keep everything in the frontend and contract** — expose all user logic directly through wallet-backed Soroban calls and direct RPC polling.
   - *Pros:* very simple architecture; no off-chain persistence.
   - *Cons:* poor UX for search, notifications, analytics, and editing; impossible to support queued jobs or high-volume client subscriptions; makes account/session flows awkward.

2. **Use a thin API layer that only proxies contract data** — backend handles auth/session logic but stores almost no derived state.
   - *Pros:* minimal backend footprint; easy to reason about.
   - *Cons:* cannot efficiently serve indexed search, leaderboard projections, notification history, or webhook-driven jobs; state becomes fragmented across the chain and ad hoc client caches.

3. **Adopt a real off-chain backend with PostgreSQL, Redis, and job workers** — the contract remains narrow and the backend owns derived read models, auth, and queues.
   - *Pros:* solid product ergonomics; clean indexer and realtime architecture; retries, schedules, and observability become possible.
   - *Cons:* introduces operational complexity and requires clear data ownership boundaries.

## Decision

**Adopt a real off-chain backend** as the product control plane, while keeping the Soroban contract as the authoritative trust boundary (Option 3).

The backend is responsible for:
- REST/JSON APIs for authenticated app flows.
- Postgres-backed derived models for profiles, notifications, and aggregates.
- Indexing Soroban events into durable read models.
- WebSocket fan-out and catch-up for realtime updates.
- BullMQ jobs for retries, scheduling, X metrics refresh, and other async work.

## Rationale

- The contract is excellent for ledger truth but not for user-facing product features that need indexing, pagination, and search.
- A dedicated backend provides a stronger separation between state transitions and enriched business logic.
- The backend can ingest event streams from the contract, normalize them once, and serve many consumers without each client repeating the same expensive work.
- Realtime and async jobs are operationally much easier with Redis and worker processes than by embedding everything in the browser or chain.

## Consequences

- Positive: clearer architecture, better observability, easier retries and schedules, and a robust API surface for frontend clients.
- Negative / cost: data consistency must be designed deliberately; some state is duplicated off-chain and must be treated as a derived projection.
- Follow-ups or risks to revisit: define the exact on-chain vs off-chain boundary in ADR-014 and keep the indexer as the authoritative projection layer for off-chain read models.

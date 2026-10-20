# ADR-011: Indexer design for Soroban event processing

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Core team

## Context

The frontend and backend need a reliable view of contract activity, but a wallet client cannot poll raw Soroban RPC for every list, feed, and leaderboard update. We need a durable, query-friendly copy of significant contract events with a clear way to recover after restarts or chain reorgs.

Constraints:
- Contract events are the canonical signal for what happened on-chain.
- The backend must tolerate RPC gaps, ledger reorgs, and long-running catch-up periods.
- Repeated reprocessing should not duplicate or double-count a ledger range.
- Product queries should not depend on raw RPC latency or a browser hitting the network directly.

## Options considered

1. **Read directly from Soroban RPC in UI** — all clients fetch chain state and decode event logs locally.
   - *Pros:* zero backend indexing infrastructure.
   - *Cons:* bad UX under rate limits, poor caching, repeated decoding work, no durable query layer, difficult reorg handling.

2. **Custom single-process watcher** — a bespoke script polls a ledger range and writes rows directly into Postgres without a broker or checkpoint model.
   - *Pros:* lower setup complexity than a full indexer.
   - *Cons:* fragile by restart; no clean resume semantics; reorg recovery becomes ad hoc; difficult to scale or maintain.

3. **Persistent indexer with ledger cursor, projections, and idempotent writes** — poll the chain, checkpoint progress per topic, normalize events, and upsert projections.
   - *Pros:* reliable restart behavior, resumable processing, clean recovery from fork/reorg, supports query APIs and notifications.
   - *Cons:* slightly more moving parts, but worthwhile and operationally manageable.

## Decision

**Build a dedicated indexer** with a ledger cursor, a per-topic processing model, and idempotent database projections (Option 3).

This indexer:
- polls Soroban RPC from a stored ledger checkpoint;
- tracks progress per topic or event stream;
- normalizes events into relational rows and derived metrics;
- replays safe, deduplicated projections in ledger order;
- emits events to the realtime layer and notifications module when business records change.

## Rationale

- The product needs durable, fast read models more than raw chain introspection.
- Ledger-level checkpoints and idempotent upserts are the standard way to survive crashes and chain reorganizations.
- A dedicated indexer keeps the API and the contract loosely coupled: the API reads durable models, while the contract remains the ledger truth.

## Consequences

- Positive: robust reindexing, better API latency, clean separation between chain state and application read models.
- Negative / cost: requires careful cursor management, event mapping, and testing across reorg scenarios.
- Follow-ups or risks to revisit: ensure all projections are deterministic and idempotent, and keep a backfill path available for major schema or event changes.

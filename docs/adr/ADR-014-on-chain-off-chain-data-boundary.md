# ADR-014: On-chain vs off-chain data boundary

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Core team

## Context

Stellar Tipz combines on-chain trust with off-chain product features. Without a clear boundary, the team risks pushing mutable or expensive data onto the contract, or reading mutable business state from an untrusted source as if it were chain truth.

Constraints:
- The on-chain layer must remain small, deterministic, and auditable.
- The off-chain layer must support user experience features that are too dynamic or too expensive for conservative ledger storage.
- The contract and backend must agree on which records are authoritative and which are derived projections.

## Options considered

1. **Put almost everything on-chain** — profile data, search metadata, notifications, analytics, and session state all live in the contract.
   - *Pros:* single source of truth; very clear trust model.
   - *Cons:* expensive and slow; poor fit for large, mutable, or user-generated content; makes UX and analytics awkward.

2. **Keep everything off-chain except balances and transfer decisions** — the contract does almost no stateful work.
   - *Pros:* product flexibility.
   - *Cons:* weakens the trust model; makes settlement, auditability, and ownership disputes harder; risk of off-chain drift from chain reality.

3. **Keep economic truth and settlement on-chain; keep mutable product state and derived projections off-chain** — the contract enforces ownership and balance transitions, while the backend owns search, notifications, and derived analytics.
   - *Pros:* strong trust model, flexible UX, and cleaner operational architecture.
   - *Cons:* requires a disciplined indexer and explicit rules for rehydration and backup.

## Decision

**Use a strict split**:

- **On-chain**: balances, fee config, profile registration and ownership, tip settlement, auth/ownership checks, and all state transitions that must be auditable and irreversible.
- **Off-chain**: profile display metadata, search indexes, notification history, derived metrics, cached social data, job state, and any user-session or UI-specific state.
- **Derived read models**: data produced by the indexer from contract events and persisted in Postgres for queries, lists, and dashboards.

## Rationale

- The contract is strongest when it governs settlement and state transitions, not product convenience.
- The backend and indexer are well-suited to storing user experience data and projections, but they must treat those records as dependent on chain truth.
- This allows the product to remain responsive without undermining the economic guarantees of the Stellar ledger.

## Consequences

- Positive: clearer trust boundaries, simpler audits, and a better fit for search, analytics, and realtime workloads.
- Negative / cost: the system now depends on clean event processing and explicit reconciliation between the chain and off-chain projections.
- Follow-ups or risks to revisit: ensure every data projection is tagged with its source event and has a documented reindex path for recovery or schema changes.

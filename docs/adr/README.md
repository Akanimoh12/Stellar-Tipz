# Architecture Decision Records (ADRs)

This directory captures the significant architectural decisions made on Stellar
Tipz — the *context*, the *options considered*, and the *rationale* — so future
contributors understand **why** the system looks the way it does, not just how.

We follow a lightweight [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
style. Each record is immutable once `Accepted`; to change a decision, add a new
ADR that `Supersedes` the old one and mark the old one `Superseded`.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](./ADR-001-soroban-choice.md) | Choice of Soroban for smart contracts | Accepted |
| [002](./ADR-002-design-system.md) | Brutalist design system | Accepted |
| [003](./ADR-003-credit-score-algorithm.md) | Credit score algorithm design | Accepted |
| [004](./ADR-004-storage-strategy.md) | Storage strategy (persistent / temporary / instance) | Accepted |
| [005](./ADR-005-frontend-state-management.md) | Frontend state management (Zustand) | Accepted |
| [006](./ADR-006-fee-structure.md) | Fee structure design | Accepted |
| [007](./ADR-007-profile-user-boundary.md) | Profile vs User off-chain data model boundary | Accepted |
| [008](./ADR-008-scheduled-action-signing.md) | Non-custodial signing for scheduled on-chain actions | Accepted |
| [009](./ADR-009-soft-delete.md) | Soft-delete convention | Accepted |
| [010](./ADR-010-off-chain-backend-rationale.md) | Off-chain backend rationale | Accepted |
| [011](./ADR-011-indexer-design.md) | Indexer design for Soroban event processing | Accepted |
| [012](./ADR-012-realtime-architecture.md) | Realtime architecture and room model | Accepted |
| [013](./ADR-013-queue-selection.md) | Background job queue selection | Accepted |
| [014](./ADR-014-on-chain-off-chain-data-boundary.md) | On-chain vs off-chain data boundary | Accepted |

## Adding a new ADR

1. Copy [`template.md`](./template.md) to `ADR-NNN-short-title.md` (next number).
2. Fill in the sections; keep it focused on a single decision.
3. Add a row to the index above.
4. Open a PR — the decision is reviewed like code.

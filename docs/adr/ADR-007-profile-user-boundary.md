# ADR-007: Profile vs User — off-chain data model boundary

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Core team
- **Implements:** `backend/prisma/schema.prisma`

## Context

The on-chain `Profile` struct (`contracts/tipz/src/types.rs`) holds ~25 fields covering
identity, display content, social metrics, credit score, balances, verification status,
and more. The off-chain backend must mirror creator data for fast queries, the REST API,
and real-time updates — but we must decide whether to flatten everything onto the `User`
model or split it into `User` (identity / auth) + `Profile` (public creator page).

Constraints:
- One Stellar address = exactly one creator profile (1:1 on-chain).
- The backend `User` model already carries `stellarAddress` and `username`.
- Profile fields (display name, bio, image, social handles) are frequently updated
  and are purely presentational — not required for auth or token issuance.
- On-chain stats (`credit_score`, `total_tips_received`, `balance`) are written by
  the indexer and should not be mixed with user-editable display fields.

## Options considered

1. **Flatten profile onto User** — add `displayName`, `avatarUrl`, `bio`, `website`,
   `xHandle`, etc. directly to `User`.
   - *Pros:* no joins, simpler queries, fewer models.
   - *Cons:* bloats the `User` model with optional presentation fields; mixes
     immutable identity data with frequently-mutated display data; makes it harder
     to evolve profile features (view tracking, theme config, social links) without
     touching auth; violates single-responsibility.

2. **Separate `Profile` model with 1:1 relation to `User`** — `User` keeps
   identity/address/username; `Profile` carries display fields and presentation config.
   - *Pros:* clean separation of concerns; mirrors on-chain `Profile` as a distinct
     concept; allows independent evolution of profile and auth modules; on-chain-stats
     can live on a third model (e.g. `ProfileStats`) without further denormalisation.
   - *Cons:* one extra join when fetching a creator page; requires a migration when
     profile fields are added to the backend.

3. **No `User` model at all — everything is `Profile`** — merge identity-level fields
   into the `Profile` model.
   - *Pros:* single model, even simpler than option 1.
   - *Cons:* makes auth/JWT issuance harder to reason about; `stellarAddress` is
     identity, not profile; conflates two different lifecycles; conflicts with
     the existing `User` model that other backend issues already build on.

## Decision

**Separate `Profile` model with a 1:1 relation to `User`** (Option 2).

| Model   | Responsibility |
|---------|---------------|
| `User`  | Stellar address, username, auth credentials. Immutable identity anchor. |
| `Profile` | Display name, avatar, bio, website, social handles, theme config. User-facing creator page. |

Profile is optional (a user may exist before registering their profile — matching
the on-chain flow), and the 1:1 constraint is enforced by a unique `userId` foreign key.

## Rationale

- Matches the on-chain contract where `Profile` is a first-class struct separate from
  the address/wallet concept.
- Auth operations (challenge, JWT) never need profile fields; listing/search APIs
  never need credential fields. This avoids auth bugs leaking into profile endpoints.
- The indexer can write on-chain stats (`credit_score`, `total_tips_received`, etc.)
  to a future `ProfileStats` or `ProfileMetrics` model without touching the display
  fields on `Profile`.
- Frontend already treats identity (wallet connect) and profile (edit/create page)
  as separate concerns (`store/walletStore.ts` vs features/profile/).

## Consequences

- Positive: clean module boundaries; faster iteration on profile features;
  indexer and auth modules are more decoupled.
- Negative / cost: one extra join when fetching a creator's public page;
  migration must ensure existing `username` on `User` and the `Profile.username`
  (from the on-chain contract) stay in sync.
- Follow-up: on-chain stats (`credit_score`, `tips_received`, etc.) should be
  mapped to a third model (not `Profile`) in a future ADR.

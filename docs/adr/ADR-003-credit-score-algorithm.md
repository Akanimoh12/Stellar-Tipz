# ADR-003: Credit score algorithm design

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** Core team
- **Implements:** `contracts/tipz/src/credit.rs`

## Context

Tipz assigns each creator a **credit score (0–100)** and a tier
(New / Bronze / Silver / Gold / Diamond) used for ranking and trust signalling.
The score must be: deterministic and verifiable on-chain, cheap to compute,
resistant to trivial gaming, and explainable to creators (they should see *why*
their score is what it is).

Soroban contracts run integer-only arithmetic with explicit overflow handling,
so the algorithm must avoid floating point and unbounded growth.

## Options considered

1. **Weighted, capped multi-factor score with a base** — combine tip volume,
   social (X) reach, and account age, each normalised to 0–100 and capped, then
   weighted into a single 0–100 number on top of a base score.
2. **Pure tip-volume ranking** — simplest, but trivially bought and ignores
   longevity/social proof.
3. **Off-chain ML/reputation oracle** — richer signal, but non-deterministic,
   not verifiable on-chain, and adds a trusted oracle.

## Decision

Use a **weighted multi-factor score** (option 1), implemented in `credit.rs`:

```text
score = BASE_SCORE(40)
      + tip_sub * 20 / 100   (tip volume,   ≤20 pts)
      + x_sub   * 30 / 100   (X reach,      ≤30 pts)
      + age_sub * 10 / 100   (account age,  ≤10 pts)
      + streak_bonus         (streak,       ≤10 pts)
capped at 100
```

Each sub-score is independently capped at 100 before weighting; new profiles
start at the base score of 40 (bottom of Silver). A streak bonus rewards
consistent tipping milestones and is itself bounded by `STREAK_BONUS_CAP`
(10) — the raw accumulator grows with every supporter milestone, so leaving it
unbounded would let a long streak saturate the score on its own.

## Rationale

- A **base score** gives new creators a usable starting tier instead of zero.
- **Capping every factor, streak included** (e.g. follower contribution ≤50,
  age 1 pt / 10 days, streak ≤10) blunts whales and bot-followers — buying one
  huge tip, fake followers, or farming streaks cannot max the score.
- **Integer-only, deterministic** math is verifiable by anyone re-running it on
  the same `Profile`, with no oracle to trust.
- The breakdown (`CreditBreakdown`) is returned to the UI so creators see each
  component, satisfying explainability.

## Consequences

- Positive: gameable-resistant, transparent, cheap, fully on-chain.
- Negative / cost: the specific weights/divisors are judgment calls and may need
  tuning; integer truncation means small inputs round to zero (documented in the
  `credit.rs` edge-case table).
- Revisit weights if creator behaviour shows a factor is over/under-rewarded.

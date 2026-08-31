# Credit Score Algorithm

> Deep-dive into the Stellar Tipz credit score system.

---

## Overview

The credit score provides transparent creator credibility, helping tippers discover quality creators. Scores range from **0 to 100** and are stored on-chain in the creator's profile.

Every newly registered creator starts at the **base score of 40**, placing them in the Silver tier by default.

---

## Formula

```
score = BASE_SCORE (40)
      + tip_sub  * 20 / 100   →  0–20 pts  (tip volume component)
      + x_sub    * 30 / 100   →  0–30 pts  (X metrics component)
      + age_sub  * 10 / 100   →  0–10 pts  (account age component)
      + streak_bonus           →  0–10 pts (streak bonus component, capped)

Maximum score: 100 (capped)
```

Each sub-score is independently capped at 100 before weighting. The streak bonus is **not** weighted: it is added after the weighted parts and is bounded by its own cap (`STREAK_BONUS_CAP` / `CREDIT_SCORE_CAP_STREAK_BONUS`, default **10**). The total is then clamped to 100.

### Component Breakdown

| Component | Weight | Max Contribution | Input |
|-----------|--------|-----------------|-------|
| **Base** | — | 40 pts | Flat — every registered creator |
| **Tip volume** | 20% | 20 pts | `total_tips_received` (stroops) |
| **X metrics** | 30% | 30 pts | `x_followers` + `x_engagement_avg` |
| **Account age** | 10% | 10 pts | Days since `registered_at` |
| **Streak bonus** | — | 10 pts | 1 point per 7-tip streak milestone |

---

## Detailed Calculation

### 1. Tip Sub-score (max contribution: 20 pts)

```
tip_sub  = clamp(total_tips_received, 0, 1_000_000_000) / 10_000_000
tip_sub  = capped at 100

tip_score = tip_sub * 20 / 100
```

| Tips received (XLM) | Stroops | tip_sub | tip_score |
|--------------------|---------|---------|-----------|
| 0 XLM | 0 | 0 | 0 |
| 1 XLM | 10,000,000 | 1 | 0 |
| 10 XLM | 100,000,000 | 10 | 2 |
| 100 XLM | 1,000,000,000 | 100 (max) | 20 (max) |

Maximum reached at **100 XLM** in tips.

### 2. X Metrics Sub-score (max contribution: 30 pts)

```
follower_part    = min(x_followers / 50, 50)
engagement_part  = min(x_engagement_avg / 10, 50)
x_sub            = follower_part + engagement_part   (max 100)

x_score = x_sub * 30 / 100
```

`x_engagement_avg` is a pre-computed engagement metric stored by the admin. Both components contribute up to 50 points each.

| x_followers | x_engagement_avg | follower_part | engagement_part | x_sub | x_score |
|-------------|-----------------|---------------|-----------------|-------|---------|
| 0 | 0 | 0 | 0 | 0 | 0 |
| 500 | 0 | 10 | 0 | 10 | 3 |
| 2,500 | 100 | 50 (max) | 10 | 60 | 18 |
| 2,500 | 500 | 50 (max) | 50 (max) | 100 (max) | 30 (max) |

When both `x_followers` and `x_engagement_avg` are 0, the entire X component is 0 (not registered with X).

### 3. Account Age Sub-score (max contribution: 10 pts)

```
age_in_days = (now - registered_at) / 86_400

age_sub = age_in_days / 10   (min age: 1 day, capped at 100)
age_score = age_sub * 10 / 100
```

Accounts younger than 1 day contribute **0** to the age component.

| Account age | age_sub | age_score |
|-------------|---------|-----------|
| < 1 day | 0 | 0 |
| 10 days | 1 | 0 |
| 100 days | 10 | 1 |
| 1,000 days (~2.7 yr) | 100 (max) | 10 (max) |

Maximum reached after ~1,000 days (~2.7 years).

### 4. Streak Bonus (max contribution: 10 pts)

```
raw_streak_bonus = sum of all supporter streak milestones
streak_bonus     = min(raw_streak_bonus, STREAK_BONUS_CAP)   // default cap: 10

Each supporter earns 1 bonus point for every 7 consecutive tips to the same creator.
The creator's raw streak bonus is the sum of all supporter bonus points.
```

| Supporter streak | Bonus points | Creator's raw streak bonus |
|------------------|--------------|----------------------------|
| 0-6 tips | 0 | 0 |
| 7-13 tips | 1 | 1 |
| 14-20 tips | 2 | 2 |
| 21-27 tips | 3 | 3 |
| ... | ... | ... |

The raw accumulator is unbounded — it grows with every supporter milestone — so it is
clamped to `STREAK_BONUS_CAP` **before** it is added to the score. Without that clamp a
long enough streak alone lifts a creator with zero tips, zero X presence and a brand-new
account from the base score (40) to the maximum (100), making the score one-dimensional.
The total is still clamped to 100 afterwards.

**Example**: A creator with 10 supporters each on a 14-tip streak has a raw bonus of
10 × 2 = 20 points, which contributes **10** points (the cap) to the score.

#### Configuring the cap

| Implementation | Constant | Default | Override |
|----------------|----------|---------|----------|
| Soroban contract | `STREAK_BONUS_CAP` in [`contracts/tipz/src/credit.rs`](../contracts/tipz/src/credit.rs) | 10 | Contract redeploy |
| Backend | `caps.streakBonus` in [`credit.config.ts`](../backend/src/modules/credit/credit.config.ts) | 10 | `CREDIT_SCORE_CAP_STREAK_BONUS` |

The two must stay in agreement. The backend additionally floors the effective cap at
`caps.max`, so a misconfigured `CREDIT_SCORE_CAP_STREAK_BONUS` can never push the total
above 100.

---

## Score Examples

| Creator type | Tips (XLM) | x_followers | x_engagement_avg | Age (days) | Streak Bonus | Score | Tier |
|-------------|-----------|-------------|-----------------|-----------|--------------|-------|------|
| Newly registered | 0 | 0 | 0 | 0 | 0 | 40 | Silver |
| Active tipper, no X | 10 | 0 | 0 | 30 | 0 | 43 | Silver |
| X presence, no tips | 0 | 2,500 | 100 | 60 | 0 | 53 | Silver |
| Established creator | 50 | 2,500 | 200 | 365 | 5 | 72 | Gold |
| Elite creator | 100+ | 2,500+ | 500+ | 1,000+ | 20+ (capped to 10) | 100 | Diamond |
| Streak-only creator | 0 | 0 | 0 | 0 | 1,000 (capped to 10) | 50 | Silver |

---

## Tier System

| Tier | Score Range | Starting condition |
|------|-------------|-------------------|
| **New** | 0–19 | No registered profile |
| **Bronze** | 20–39 | Below base (not achievable via normal registration) |
| **Silver** | 40–59 | Default for all newly registered creators |
| **Gold** | 60–79 | Growing tips, X presence, or account age |
| **Diamond** | 80–100 | Elite: strong across all components |

> All newly registered profiles start at 40 (bottom of Silver) because the base score is 40.

---

## Implementation

### Rust (on-chain)

See [`contracts/tipz/src/credit.rs`](../contracts/tipz/src/credit.rs) for the canonical on-chain implementation.

Key constants:

```rust
pub const BASE_SCORE: u32     = 40;
pub const MAX_SCORE: u32      = 100;
pub const TIP_WEIGHT: u32     = 20;   // percent
pub const X_WEIGHT: u32       = 30;   // percent
pub const AGE_WEIGHT: u32     = 10;   // percent
pub const STREAK_BONUS_SCORE: u32 = 1;  // per streak milestone
pub const TIP_DIVISOR: i128   = 10_000_000;
pub const FOLLOWER_DIVISOR: u32  = 50;
pub const ENGAGEMENT_DIVISOR: u32 = 10;
pub const AGE_DIVISOR: u32    = 10;
pub const X_SUB_CAP: u32      = 50;
pub const AGE_CAP: u32        = 100;
pub const TIP_CAP: u32        = 100;
```

Core calculation:

```rust
let tip_sub: u32 = (profile.total_tips_received.clamp(0, TIP_VOLUME_CAP) / TIP_DIVISOR) as u32;

let x_sub: u32 = {
    let follower_part = (profile.x_followers / FOLLOWER_DIVISOR).min(X_SUB_CAP);
    let engagement_part = (profile.x_engagement_avg / ENGAGEMENT_DIVISOR).min(X_SUB_CAP);
    follower_part + engagement_part
};

let age_sub: u32 = {
    let age_days = (now - profile.registered_at) / SECONDS_PER_DAY;
    (age_days as u32 / AGE_DIVISOR).min(AGE_CAP)
};

// Bound the unbounded raw accumulator before it reaches the score.
let streak_score = cap_streak_bonus(storage::get_creator_streak_bonus(env, &profile.owner));

let total = (BASE_SCORE
    + tip_sub * TIP_WEIGHT / MAX_SCORE
    + x_sub   * X_WEIGHT   / MAX_SCORE
    + age_sub * AGE_WEIGHT / MAX_SCORE
    + streak_score)
    .min(MAX_SCORE);
```

### TypeScript (off-chain backend)

See [`backend/src/modules/credit/credit.service.ts`](../backend/src/modules/credit/credit.service.ts) for the backend implementation, which mirrors the on-chain formula exactly. This is used by REST API endpoints under `/api/v1/credit` for off-chain lookups without a contract call.

Key constants:

```typescript
const BASE_SCORE = 40;
const MAX_SCORE = 100;
const TIP_WEIGHT = 20;
const X_WEIGHT = 30;
const AGE_WEIGHT = 10;
const TIP_DIVISOR = 10_000_000;
const FOLLOWER_DIVISOR = 50;
const ENGAGEMENT_DIVISOR = 10;
const AGE_DIVISOR = 10;
const X_SUB_CAP = 50;
const AGE_CAP = 100;
const TIP_CAP = 100;
const STREAK_BONUS_CAP = 10; // CREDIT_SCORE_CAP_STREAK_BONUS
```

Core calculation:

```typescript
function computeCreditScore(input: ComputeCreditScoreInput) {
  const tipSub = Math.min(Math.floor(Number(input.totalTipsReceived) / TIP_DIVISOR), TIP_CAP);
  const xSub = computeXSubScore(input.xFollowers, input.xEngagementAvg);
  const ageSub = computeAgeSubScore(input.accountAgeDays);

  const tipScore = Math.floor((tipSub * TIP_WEIGHT) / MAX_SCORE);
  const xScore = Math.floor((xSub * X_WEIGHT) / MAX_SCORE);
  const ageScore = Math.floor((ageSub * AGE_WEIGHT) / MAX_SCORE);
  const streakBonus = clamp(Math.floor(input.streakBonus), 0, STREAK_BONUS_CAP);

  const total = clamp(BASE_SCORE + tipScore + xScore + ageScore + streakBonus, 0, MAX_SCORE);
  return { score: total, tier: computeTier(total), components: { base: BASE_SCORE, tipVolume: tipScore, xMetrics: xScore, accountAge: ageScore, streakBonus } };
}
```

Both implementations produce identical results for the same inputs, ensuring consistency between on-chain and off-chain credit lookups.

---

## Update Mechanism

1. **Off-chain fetch**: A trusted service queries the X (Twitter) API for follower count and engagement metrics
2. **Admin update**: The admin calls `update_x_metrics(target, x_followers, x_engagement_avg)` or the batch variant `batch_update_x_metrics` (up to 50 creators per call)
3. **Recalculation**: The contract recalculates and stores the new credit score on the profile
4. **Event**: A `CreditScoreUpdated` event is emitted with the old and new scores
5. **Streak updates**: When a supporter sends a tip, their streak is tracked. Every 7 consecutive tips to the same creator increments the creator's raw streak bonus by 1 point; the contribution to the score is capped at `STREAK_BONUS_CAP` (10)

### Why Off-chain?

The X API cannot be called directly from a smart contract. The admin role acts as a trusted oracle. Future versions may use a decentralized oracle.

---

## Migration: introducing the streak bonus cap

The streak bonus was previously unbounded (see #1188). Capping it lowers the score of any
creator whose raw streak accumulator exceeded `STREAK_BONUS_CAP` (10).

**Existing scores are recomputed, not grandfathered.** Grandfathering was rejected because
the score is a comparative signal shown on a shared leaderboard: leaving old scores on the
old formula would mean two creators with identical activity showing different scores
depending on when they were last scored.

| Surface | Behaviour |
|---------|-----------|
| **On-chain (Soroban)** | No storage migration is required — the score is derived on read. `get_credit_tier` and `get_credit_breakdown` return the capped value immediately on the next call. The `credit_score` field cached on a `Profile` is refreshed the next time the score is written (a tip, an `update_x_metrics` call, or the batch variant). |
| **Backend (Postgres)** | Stored `CreditScore` rows are recomputed by the existing recompute job (`backend/src/jobs/creditRecompute.worker.ts`, `recomputeAllScores`) or on demand via [`credit.backfill.ts`](../backend/src/modules/credit/credit.backfill.ts) (`backfillCreditScores`). Run the backfill once after deploying. |
| **Cache** | Redis entries expire after `CREDIT_SCORE_CACHE_TTL_SECONDS` (default 5 min); no manual flush is needed, though flushing the `credit:*` keys makes the change visible immediately. |
| **History** | `CreditScoreHistory` rows are **not** rewritten. They are an audit trail of what the score was at the time, so a one-off step down after the backfill is expected and intentional. |

Impact is bounded: no creator can lose more than `raw_streak_bonus - 10` points, and only
creators who were leaning on the uncapped bonus are affected at all.

---

## Design Rationale

| Decision | Reasoning |
|----------|-----------|
| **0–100 scale** | Intuitive percentage-like range; easier for users to interpret |
| **Base score of 40 (Silver)** | New creators aren't penalized; they start with a meaningful reputation |
| **Tip volume (20% weight)** | On-chain, fully verifiable signal of real supporter demand |
| **X metrics (30% weight)** | Largest weight — social proof is the strongest off-chain credibility signal |
| **Account age (10% weight)** | Rewards longevity; prevents hit-and-run accounts from scoring high |
| **Integer math only** | Soroban does not support floating-point arithmetic |
| **Per-component caps** | Prevents gaming by inflating a single metric |
| **Streak bonus cap (10)** | The raw streak accumulator is unbounded; capping it keeps the bonus meaningful (it can lift a creator across a tier boundary) while leaving tip volume, X metrics and account age as the dominant signals |

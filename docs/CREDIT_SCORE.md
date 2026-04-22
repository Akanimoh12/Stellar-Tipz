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

Maximum score: 100
```

Each sub-score is independently capped at 100 before weighting.

### Component Breakdown

| Component | Weight | Max Contribution | Input |
|-----------|--------|-----------------|-------|
| **Base** | — | 40 pts | Flat — every registered creator |
| **Tip volume** | 20% | 20 pts | `total_tips_received` (stroops) |
| **X metrics** | 30% | 30 pts | `x_followers` + `x_engagement_avg` |
| **Account age** | 10% | 10 pts | Days since `registered_at` |

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

---

## Score Examples

| Creator type | Tips (XLM) | x_followers | x_engagement_avg | Age (days) | Score | Tier |
|-------------|-----------|-------------|-----------------|-----------|-------|------|
| Newly registered | 0 | 0 | 0 | 0 | 40 | Silver |
| Active tipper, no X | 10 | 0 | 0 | 30 | 43 | Silver |
| X presence, no tips | 0 | 2,500 | 100 | 60 | 53 | Silver |
| Established creator | 50 | 2,500 | 200 | 365 | 67 | Gold |
| Elite creator | 100+ | 2,500+ | 500+ | 1,000+ | 100 | Diamond |

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

## Implementation (Rust)

See [`contracts/tipz/src/credit.rs`](../contracts/tipz/src/credit.rs) for the canonical implementation.

Key constants:

```rust
pub const BASE_SCORE: u32     = 40;
pub const MAX_SCORE: u32      = 100;
pub const TIP_WEIGHT: u32     = 20;   // percent
pub const X_WEIGHT: u32       = 30;   // percent
pub const AGE_WEIGHT: u32     = 10;   // percent
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

let total = (BASE_SCORE
    + tip_sub * TIP_WEIGHT / MAX_SCORE
    + x_sub   * X_WEIGHT   / MAX_SCORE
    + age_sub * AGE_WEIGHT / MAX_SCORE)
    .min(MAX_SCORE);
```

---

## Update Mechanism

1. **Off-chain fetch**: A trusted service queries the X (Twitter) API for follower count and engagement metrics
2. **Admin update**: The admin calls `update_x_metrics(target, x_followers, x_engagement_avg)` or the batch variant `batch_update_x_metrics` (up to 50 creators per call)
3. **Recalculation**: The contract recalculates and stores the new credit score on the profile
4. **Event**: A `CreditScoreUpdated` event is emitted with the old and new scores

### Why Off-chain?

The X API cannot be called directly from a smart contract. The admin role acts as a trusted oracle. Future versions may use a decentralized oracle.

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

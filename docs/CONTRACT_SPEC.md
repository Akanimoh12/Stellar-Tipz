# Smart Contract Specification

> Technical reference for the Stellar Tipz Soroban smart contract.

---

## Overview

The Tipz contract manages creator profiles, XLM tipping, withdrawal accounting,
credit scoring, and leaderboard state directly on Soroban.

**Language**: Rust (Soroban SDK)  
**Network target**: Stellar Testnet -> Mainnet

---

## Data Structures

### Profile

```rust
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Profile {
    pub owner: Address,            // Stellar address of the creator
    pub username: String,          // Unique username (3-32 chars, lowercase)
    pub display_name: String,      // Display name (1-64 chars)
    pub bio: String,               // Bio (0-280 chars)
    pub image_url: String,         // Profile image URL or IPFS CID
    pub x_handle: String,          // X handle
    pub x_followers: u32,          // X follower count
    pub x_engagement_avg: u32,     // Average X engagement per post
    pub credit_score: u32,         // Current credit score (0-100)
    pub total_tips_received: i128, // Lifetime tips received in stroops
    pub total_tips_count: u32,     // Number of tips received
    pub balance: i128,             // Current withdrawable balance in stroops
    pub registered_at: u64,        // Ledger timestamp of registration
    pub updated_at: u64,           // Last profile update timestamp
}
```

### Tip

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct Tip {
    pub id: u32,          // Global tip id
    pub tipper: Address,  // Sender address
    pub creator: Address, // Recipient address
    pub amount: i128,     // Tip amount in stroops
    pub message: String,  // Optional message
    pub timestamp: u64,   // Ledger timestamp
}
```

### LeaderboardEntry

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct LeaderboardEntry {
    pub address: Address,
    pub username: String,
    pub total_tips_received: i128,
    pub credit_score: u32,
}
```

### ContractStats

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct ContractStats {
    pub total_creators: u32,
    pub total_tips_count: u32,
    pub total_tips_volume: i128,
    pub total_fees_collected: i128,
    pub fee_bps: u32,
}
```

### ContractConfig

```rust
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ContractConfig {
    pub admin: Address,
    pub fee_collector: Address,
    pub fee_bps: u32,
    pub native_token: Address,
    pub total_creators: u32,
    pub total_tips_count: u32,
    pub total_tips_volume: i128,
    pub total_fees_collected: i128,
    pub is_initialized: bool,
    pub version: u32,
}
```

### DataKey (Storage Keys)

The contract defines storage keys across Soroban's
`instance`, `persistent`, and `temporary` storage tiers.

| DataKey                     | Storage tier | Stored value            | Purpose                                                          |
| --------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------- |
| `Admin`                     | Instance     | `Address`               | Current contract admin                                           |
| `FeePercent`                | Instance     | `u32`                   | Withdrawal fee in basis points                                   |
| `FeeCollector`              | Instance     | `Address`               | Address that receives protocol fees                              |
| `ContractVersion`           | Instance     | `u32`                   | On-chain interface version written at init and bumped on upgrade |
| `TotalFeesCollected`        | Instance     | `i128`                  | Lifetime protocol fees collected                                 |
| `Profile(Address)`          | Persistent   | `Profile`               | Creator profile keyed by owner address                           |
| `UsernameToAddress(String)` | Persistent   | `Address`               | Reverse lookup from username to creator address                  |
| `TipCount`                  | Instance     | `u32`                   | Global monotonic tip counter                                     |
| `Tip(u32)`                  | Temporary    | `Tip`                   | Individual tip record by global tip id                           |
| `Leaderboard`               | Instance     | `Vec<LeaderboardEntry>` | Cached top-creators leaderboard                                  |
| `TotalCreators`             | Instance     | `u32`                   | Total registered creators                                        |
| `TotalTipsVolume`           | Instance     | `i128`                  | Lifetime tip volume                                              |
| `Initialized`               | Instance     | `bool`                  | One-time initialization guard                                    |
| `NativeToken`               | Instance     | `Address`               | Native XLM SAC address used for transfers                        |
| `Paused`                    | Instance     | `bool`                  | Emergency pause flag                                             |
| `MinTipAmount`              | Instance     | `i128`                  | Minimum allowed tip amount in stroops                            |
| `TipperTipCount(Address)`   | Temporary    | `u32`                   | Number of tips sent by a specific tipper                         |
| `TipperTip(Address, u32)`   | Temporary    | `u32`                   | Reverse index from `(tipper, local_index)` to global tip id      |
| `CreatorTipCount(Address)`  | Temporary    | `u32`                   | Number of tips received by a specific creator                    |
| `CreatorTip(Address, u32)`  | Temporary    | `u32`                   | Reverse index from `(creator, local_index)` to global tip id     |
| `PendingAdmin`              | Instance     | `Address`               | Proposed admin during the two-step admin transfer flow           |
| `CreatorBlockedTipper`      | Persistent   | `u64`                   | Creator-level blocklist entry keyed by `(creator, tipper)`       |
| `CreatorBlockedTipperCount` | Persistent   | `u32`                   | Active blocklist size for a creator                              |
| `ProposedUpgradeHash`       | Instance     | `BytesN<32>`            | WASM hash proposed before `execute_upgrade`                      |

---

## Public Functions

### Initialization

#### `initialize(admin: Address, fee_collector: Address, fee_bps: u32, native_token: Address)`

Initializes the contract. This can only be called once.

| Parameter       | Type      | Description                                   |
| --------------- | --------- | --------------------------------------------- |
| `admin`         | `Address` | Admin address                                 |
| `fee_collector` | `Address` | Address that receives withdrawal fees         |
| `fee_bps`       | `u32`     | Fee in basis points                           |
| `native_token`  | `Address` | Stellar Asset Contract address for native XLM |

**Errors**: `AlreadyInitialized`, `InvalidFee`

### Profile Management

#### `register_profile(caller, username, display_name, bio, image_url, x_handle) -> Profile`

Registers a new creator profile.

#### `update_profile(caller, display_name, bio, image_url, x_handle)`

Updates an existing creator profile.

#### `deregister_profile(caller)`

Removes a creator profile. Caller must be registered, have zero balance, and
the contract must not be paused.

#### `get_profile(address) -> Profile`

Returns a profile by owner address.

#### `get_profile_by_username(username) -> Profile`

Returns a profile by username.

### Tipping

#### `send_tip(tipper, creator, amount, message)`

Transfers native XLM from the tipper to the contract, credits the creator,
stores a temporary tip record, updates counters, and refreshes leaderboard
state. Messages are capped on-chain by `MAX_MESSAGE_LENGTH` (280 characters)
and invalid control characters are rejected.

#### `block_tipper(creator, tipper)` / `unblock_tipper(creator, tipper)`

Creators can block abusive tippers from sending future tips. A blocked tipper
receives `TipperBlocked` from `send_tip`. Each creator can keep up to
`MAX_CREATOR_BLOCKED_TIPPERS` active entries.

#### `withdraw_tips(caller, amount)`

Withdraws part or all of the creator's balance. The contract computes the fee
as `amount * fee_bps / 10000`, transfers the net payout to the creator, and
sends the fee to the fee collector.

#### `get_tip(tip_id) -> Tip`

Fetches one tip record by global tip id.

#### `get_recent_tips(creator, limit, offset) -> Vec<Tip>`

Fetches recent tips for a creator, newest first, skipping expired temporary
entries.

#### `get_tips_by_tipper(tipper, limit) -> Vec<Tip>`

Fetches recent tips sent by a specific tipper.

#### `get_creator_tip_count(creator) -> u32`

Returns how many tips a creator has received.

#### `get_tipper_tip_count(tipper) -> u32`

Returns how many tips a tipper has sent.

### Credit and Leaderboard

#### `get_credit_tier(address) -> CreditTier`

Returns the creator's current credit tier derived from their on-chain score.

#### `get_credit_breakdown(address) -> CreditBreakdown`

Returns the component-level breakdown of the creator's score.

#### `get_leaderboard(limit) -> Vec<LeaderboardEntry>`

Returns the top creators by total tips received.

### Admin and Config

#### `get_stats() -> ContractStats`

Returns aggregate platform statistics.

#### `propose_upgrade(admin, new_wasm_hash)` / `execute_upgrade(admin, new_wasm_hash)`

Admins can stage a WASM hash before execution. `execute_upgrade` only accepts
the currently proposed hash, and `cancel_upgrade` clears a pending proposal.

#### `get_config() -> ContractConfig`

Returns the full contract configuration, including admin and native token.

#### `set_fee(caller, fee_bps)`

Updates the withdrawal fee. Admin-only.

#### `set_fee_collector(caller, new_collector)`

Updates the fee collector. Admin-only.

#### `set_admin(caller, new_admin)`

Immediate admin transfer. Admin-only.

#### `propose_admin(caller, new_admin)`

Starts a two-step admin transfer. Admin-only.

#### `accept_admin(caller)`

Accepts a pending admin transfer. Callable only by the pending admin.

#### `cancel_admin_proposal(caller)`

Cancels the pending admin transfer. Admin-only.

#### `pause_contract(caller)` / `unpause_contract(caller)`

Toggles the emergency pause flag. Admin-only.

#### `set_min_tip_amount(caller, amount)` / `get_min_tip_amount() -> i128`

Updates or reads the minimum allowed tip amount.

#### `update_x_metrics(caller, creator, x_followers, x_engagement_avg)`

Updates creator X metrics. Admin-only.

#### `batch_update_x_metrics(caller, updates) -> Vec<BatchSkip>`

Batch updates X metrics for multiple creators. Admin-only.

#### `batch_update_x_metrics_preview(caller, updates) -> Vec<BatchSkip>`

Dry-run preview for batch X metric updates. Admin-only.

---

## Storage Layout

| Key                                | Type                    | Tier / TTL behavior                             |
| ---------------------------------- | ----------------------- | ----------------------------------------------- |
| `DataKey::Admin`                   | `Address`               | Instance, bumped with contract writes           |
| `DataKey::FeePercent`              | `u32`                   | Instance, bumped with contract writes           |
| `DataKey::FeeCollector`            | `Address`               | Instance, bumped with contract writes           |
| `DataKey::ContractVersion`         | `u32`                   | Instance, bumped with contract writes           |
| `DataKey::TotalFeesCollected`      | `i128`                  | Instance, bumped with contract writes           |
| `DataKey::Profile(addr)`           | `Profile`               | Persistent, refreshed on profile activity       |
| `DataKey::UsernameToAddress(name)` | `Address`               | Persistent, refreshed alongside `Profile(addr)` |
| `DataKey::TipCount`                | `u32`                   | Instance, bumped with contract writes           |
| `DataKey::Tip(index)`              | `Tip`                   | Temporary, approximately 7-day TTL              |
| `DataKey::Leaderboard`             | `Vec<LeaderboardEntry>` | Instance, bumped with contract writes           |
| `DataKey::TotalCreators`           | `u32`                   | Instance, bumped with contract writes           |
| `DataKey::TotalTipsVolume`         | `i128`                  | Instance, bumped with contract writes           |
| `DataKey::Initialized`             | `bool`                  | Instance, bumped with contract writes           |
| `DataKey::NativeToken`             | `Address`               | Instance, bumped with contract writes           |
| `DataKey::Paused`                  | `bool`                  | Instance, bumped with contract writes           |
| `DataKey::MinTipAmount`            | `i128`                  | Instance, bumped with contract writes           |
| `DataKey::TipperTipCount(addr)`    | `u32`                   | Temporary, follows tip index TTL                |
| `DataKey::TipperTip(addr, idx)`    | `u32`                   | Temporary, follows tip index TTL                |
| `DataKey::CreatorTipCount(addr)`   | `u32`                   | Temporary, follows tip index TTL                |
| `DataKey::CreatorTip(addr, idx)`   | `u32`                   | Temporary, follows tip index TTL                |
| `DataKey::PendingAdmin`            | `Address`               | Instance, bumped with contract writes           |

> Contract-wide config and counters live in `instance()` storage, profile
> records live in `persistent()` storage, and tip history plus reverse tip
> indexes live in `temporary()` storage.

---

## Formal Invariants

This section defines the properties the contract **must** maintain at all times. Each invariant is identified by an `INV-` code that maps to a corresponding test case in `contracts/src/test/`.

---

### INV-S: Storage Invariants

**INV-S-1 — Initialization guard**

```
Initialized == true  ⟹  initialize() reverts with AlreadyInitialized
```

Once `DataKey::Initialized` is written as `true`, any subsequent call to
`initialize()` must panic with `ContractError::AlreadyInitialized`. This
prevents re-initialization attacks.

*Test*: `test_security::test_double_initialize`

---

**INV-S-2 — Profile–username index consistency**

```
∀ address a:
  Profile(a) exists  ⟺  UsernameToAddress(Profile(a).username) == a
```

Whenever a `Profile` entry exists under address `a`, the reverse mapping
`UsernameToAddress` for that profile's `username` must resolve back to `a`, and
vice versa. Both entries have their TTLs bumped together to stay in sync.

*Test*: `test_profiles::test_profile_username_consistency`

---

**INV-S-3 — TotalCreators monotonicity**

```
register_profile() increases TotalCreators by exactly 1
deregister_profile() decreases TotalCreators by exactly 1
```

`DataKey::TotalCreators` strictly tracks the number of currently registered
profiles. No other operation may modify this counter.

*Test*: `test_profiles::test_total_creators_counter`

---

**INV-S-4 — TipCount monotonicity**

```
∀ tip t: TipCount_after(t) == TipCount_before(t) + 1
```

The global tip counter (`DataKey::TipCount`) is strictly monotonically
increasing. It is incremented by exactly 1 for each successful `send_tip` call
and is never decremented.

*Test*: `test_tipping::test_tip_count_monotonic`

---

**INV-S-5 — Paused gate**

```
Paused == true  ⟹  send_tip(), register_profile(), withdraw_tips() all revert
```

While the emergency pause flag is set, all state-mutating user operations must
revert. Admin-only operations (`set_fee`, `unpause_contract`, etc.) are exempt.

*Test*: `test_security::test_paused_contract`

---

### INV-C: Credit Score Invariants

**INV-C-1 — Bounded credit score**

```
∀ profile p: 0 ≤ p.credit_score ≤ 100
```

The credit score is always within the closed interval `[0, 100]`. The scoring
algorithm must clamp its output before writing it back to storage.

*Test*: `test_credit::test_credit_score_bounds`

---

**INV-C-2 — Credit score monotonicity on tip receipt**

```
let s_before = profile.credit_score;
send_tip(creator = a, amount > 0);
let s_after  = profile.credit_score;
s_after ≥ s_before
```

Receiving a valid tip can only increase or maintain a creator's credit score; it
must never decrease it. Score decreases are only permitted by explicit
admin-driven metric updates.

*Test*: `test_credit::test_credit_non_decreasing_on_tip`

---

**INV-C-3 — Score components are non-negative**

```
∀ component c in CreditBreakdown: c ≥ 0
```

Each individual scoring component (tip volume score, tip count score, X
engagement score) must be a non-negative value that sums to at most 100.

*Test*: `test_credit::test_credit_breakdown_non_negative`

---

### INV-F: Fee Invariants

**INV-F-1 — Fee is bounded**

```
0 ≤ fee_bps ≤ 10_000
```

The fee expressed in basis points must satisfy this range (0 % to 100 %).
`set_fee()` must revert with `ContractError::InvalidFee` for any value outside
this range.

*Test*: `test_admin::test_fee_bounds`

---

**INV-F-2 — Fee deducted from withdrawal, not tip**

```
let fee   = amount * fee_bps / 10_000;
let net   = amount - fee;

creator_receives == net
fee_collector_receives == fee
fee + net == amount
```

The fee is applied exclusively at withdrawal time. The creator's balance is
debited by the full `amount`; the creator's wallet receives `net`; the fee
collector's wallet receives `fee`. The two payout amounts must sum to `amount`.

*Test*: `test_tipping::test_withdrawal_fee_arithmetic`

---

**INV-F-3 — Cumulative fees do not exceed total volume**

```
TotalFeesCollected ≤ TotalTipsVolume
```

The lifetime fees collected can never exceed the lifetime tip volume, since fees
are a fraction of withdrawals and withdrawals are bounded by received tips.

*Test*: `test_tipping::test_fees_leq_volume`

---

**INV-F-4 — TotalFeesCollected is monotonically non-decreasing**

```
∀ withdraw call w:
  TotalFeesCollected_after(w) ≥ TotalFeesCollected_before(w)
```

Each successful withdrawal either increases `TotalFeesCollected` (fee > 0) or
leaves it unchanged (fee_bps == 0). It is never reduced.

*Test*: `test_tipping::test_fees_monotonic`

---

### INV-L: Leaderboard Invariants

**INV-L-1 — Leaderboard ordering**

```
∀ i < j in Leaderboard:
  Leaderboard[i].total_tips_received ≥ Leaderboard[j].total_tips_received
```

Entries in `DataKey::Leaderboard` are sorted in descending order of
`total_tips_received`. After each `send_tip` that refreshes the leaderboard,
this ordering must hold.

*Test*: `test_leaderboard::test_leaderboard_sorted`

---

**INV-L-2 — Leaderboard entries reference registered profiles**

```
∀ entry e in Leaderboard:
  Profile(e.address) exists
```

Every address appearing in the leaderboard must correspond to an active,
registered profile. Deregistered profiles must be removed from the leaderboard.

*Test*: `test_leaderboard::test_leaderboard_registered_only`

---

**INV-L-3 — Leaderboard values are consistent with profiles**

```
∀ entry e in Leaderboard:
  e.total_tips_received == Profile(e.address).total_tips_received
  e.username            == Profile(e.address).username
  e.credit_score        == Profile(e.address).credit_score
```

Leaderboard entries are a denormalised snapshot. Whenever a profile is mutated
(tip received, metrics updated), the corresponding leaderboard entry must be
refreshed atomically in the same transaction.

*Test*: `test_leaderboard::test_leaderboard_profile_consistency`

---

### INV-P: Profile Uniqueness Invariants

**INV-P-1 — Username uniqueness**

```
∀ address a, b where a ≠ b:
  Profile(a).username ≠ Profile(b).username
```

No two registered profiles may share the same username. `register_profile()` must
check `UsernameToAddress(username)` before writing and revert with
`ContractError::UsernameTaken` if the username is already mapped to any address.

*Test*: `test_profiles::test_username_unique`

---

**INV-P-2 — Address uniqueness**

```
∀ address a: at most one Profile exists under DataKey::Profile(a)
```

A given Stellar address can have at most one registered creator profile. A
second call to `register_profile()` from the same `caller` must revert with
`ContractError::AlreadyRegistered`.

*Test*: `test_profiles::test_address_unique`

---

**INV-P-3 — Deregistration clears all profile state**

```
deregister_profile(a) ⟹
  Profile(a) does not exist
  ∧ UsernameToAddress(old_username) does not exist
  ∧ a not in Leaderboard
  ∧ TotalCreators decreased by 1
```

After `deregister_profile`, all storage entries associated with the caller's
profile — the `Profile` record, the username reverse mapping, and any leaderboard
entry — must be removed atomically.

*Test*: `test_profiles::test_deregister_clears_state`

---

### INV-T: State Machine Transitions

The contract lifecycle can be described as the following state machine.

```
[Uninitialized]
      │  initialize()
      ▼
  [Active] ◄────────────────────────────────────────────────────────────┐
      │                                                                  │
      │  pause_contract()                                               │
      ▼                                                                  │
  [Paused]  ──── unpause_contract() ────────────────────────────────────┘
```

| From          | Trigger              | To            | Guard                              |
| ------------- | -------------------- | ------------- | ---------------------------------- |
| Uninitialized | `initialize()`       | Active        | `Initialized` must be `false`      |
| Active        | `pause_contract()`   | Paused        | caller must be `Admin`             |
| Paused        | `unpause_contract()` | Active        | caller must be `Admin`             |
| Active        | `register_profile()` | Active        | username not taken, address unique |
| Active        | `send_tip()`         | Active        | contract not paused, amount ≥ min  |
| Active        | `withdraw_tips()`    | Active        | contract not paused, balance ≥ amt |
| Active/Paused | `set_admin()`        | Active/Paused | caller must be current `Admin`     |
| Active/Paused | `propose_admin()`    | Active/Paused | caller must be current `Admin`     |
| Active/Paused | `accept_admin()`     | Active/Paused | caller must be `PendingAdmin`      |

All state transitions that modify critical counters or balances must be atomic:
the Soroban SDK's single-execution model guarantees this by design (no partial
state commits).

---

### Invariant–Test Mapping

| Invariant | Test file                 | Test function                                  |
| --------- | ------------------------- | ---------------------------------------------- |
| INV-S-1   | `test_security.rs`        | `test_double_initialize`                       |
| INV-S-2   | `test_profiles.rs`        | `test_profile_username_consistency`            |
| INV-S-3   | `test_profiles.rs`        | `test_total_creators_counter`                  |
| INV-S-4   | `test_tipping.rs`         | `test_tip_count_monotonic`                     |
| INV-S-5   | `test_security.rs`        | `test_paused_contract`                         |
| INV-C-1   | `test_credit.rs`          | `test_credit_score_bounds`                     |
| INV-C-2   | `test_credit.rs`          | `test_credit_non_decreasing_on_tip`            |
| INV-C-3   | `test_credit.rs`          | `test_credit_breakdown_non_negative`           |
| INV-F-1   | `test_admin.rs`           | `test_fee_bounds`                              |
| INV-F-2   | `test_tipping.rs`         | `test_withdrawal_fee_arithmetic`               |
| INV-F-3   | `test_tipping.rs`         | `test_fees_leq_volume`                         |
| INV-F-4   | `test_tipping.rs`         | `test_fees_monotonic`                          |
| INV-L-1   | `test_leaderboard.rs`     | `test_leaderboard_sorted`                      |
| INV-L-2   | `test_leaderboard.rs`     | `test_leaderboard_registered_only`             |
| INV-L-3   | `test_leaderboard.rs`     | `test_leaderboard_profile_consistency`         |
| INV-P-1   | `test_profiles.rs`        | `test_username_unique`                         |
| INV-P-2   | `test_profiles.rs`        | `test_address_unique`                          |
| INV-P-3   | `test_profiles.rs`        | `test_deregister_clears_state`                 |


### Verification Renewal

Verification approvals expire after the configured domain re-verification
interval. Once expired, `request_verification` may be called again and
`get_verification_status` reports the creator as unverified until approval is
renewed.

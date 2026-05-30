# Stellar Tipz Contract API Reference

> Complete reference for all public functions in the Tipz Soroban smart contract.
> Contract version: **3**

---

## Quick Start

### Install dependencies

```bash
# Rust (contract development)
cargo add soroban-sdk

# JavaScript/TypeScript (frontend)
npm install @stellar/stellar-sdk
```

### Connect to the contract (JavaScript)

```js
import { Contract, SorobanRpc, Networks } from "@stellar/stellar-sdk";

const rpc = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const contract = new Contract("CC...CONTRACT_ID...");
const passphrase = Networks.TESTNET;

// Build a read-only simulation
const tx = new TransactionBuilder(sourceAccount, {
  fee: "100",
  networkPassphrase: passphrase,
})
  .addOperation(contract.call("get_leaderboard", xdr.ScVal.scvU32(10)))
  .setTimeout(30)
  .build();

const sim = await rpc.simulateTransaction(tx);
```

### Connect to the contract (Rust)

```rust
use soroban_sdk::{Env, Address, String};

let env = Env::default();
let contract_id = Address::from_string(&String::from_str(&env, "CC...CONTRACT_ID..."));
let client = TipzContractClient::new(&env, &contract_id);
```

---

## Initialization

### `initialize`

Initialize the contract. Can only be called once.

```rust
fn initialize(env: Env, admin: Address, fee_collector: Address, fee_bps: u32, native_token: Address)
    -> Result<(), ContractError>
```

| Param | Type | Description |
|-------|------|-------------|
| `admin` | `Address` | Contract administrator |
| `fee_collector` | `Address` | Receives withdrawal fees |
| `fee_bps` | `u32` | Fee in basis points (200 = 2%). Max 1000 (10%) |
| `native_token` | `Address` | Stellar Asset Contract address for native XLM |

**Auth**: Require (from caller)
**Errors**: `AlreadyInitialized` (2), `InvalidFee` (24)
**Events**: None (setup)

**Rust example:**
```rust
let admin = Address::from_string(&String::from_str(&env, "G...ADMIN..."));
let fee_collector = Address::from_string(&String::from_str(&env, "G...COLLECTOR..."));
let native_token = env.register_stellar_asset_contract_2(token_admin).address();
contract.initialize(&admin, &fee_collector, &200_u32, &native_token);
```

**JavaScript example:**
```js
await contract.call(
  "initialize",
  xdr.ScVal.scvAddress("G...ADMIN..."),
  xdr.ScVal.scvAddress("G...COLLECTOR..."),
  xdr.ScVal.scvU32(200),
  xdr.ScVal.scvAddress("C...NATIVE_TOKEN..."),
);
```

---

## Profile Management

### `register_profile`

Register a new creator profile. Each address can only register once.

```rust
fn register_profile(env: Env, caller: Address, username: String, display_name: String, bio: String,
    image_url: String, x_handle: String) -> Result<Profile, ContractError>
```

| Param | Type | Constraints |
|-------|------|-------------|
| `caller` | `Address` | Must authorize |
| `username` | `String` | 3-32 chars, `[a-z][a-z0-9_]*`, no `__`, no trailing `_` |
| `display_name` | `String` | 1-64 chars, non-whitespace |
| `bio` | `String` | Max 280 chars |
| `image_url` | `String` | Max 256 chars |
| `x_handle` | `String` | Optional, max 15 chars after `@` |

**Returns**: `Profile` struct with initial credit score of 40 (Silver)
**Auth**: Require from `caller`
**Errors**: `NotInitialized` (1), `ContractPaused` (7), `AlreadyRegistered` (9), `UsernameTaken` (10), `InvalidUsername` (11), `InvalidDisplayName` (12), `MessageTooLong` (21), `InvalidImageUrl` (22), `MaxProfilesReached` (38)
**Events**: `("profile", "register")` → `(owner, username)`

**Rust example:**
```rust
let profile = contract.register_profile(
    &creator,
    &String::from_str(&env, "alice"),
    &String::from_str(&env, "Alice Smith"),
    &String::from_str(&env, "Web3 content creator"),
    &String::from_str(&env, "https://ipfs.io/ipfs/Qm..."),
    &String::from_str(&env, "@alice"),
);
```

**JavaScript example:**
```js
const txHash = await submitTx(
  contract.call("register_profile",
    scvAddress(wallet.publicKey),
    scvSymbol("alice"),
    scvSymbol("Alice Smith"),
    scvSymbol("Web3 content creator"),
    scvSymbol("https://ipfs.io/ipfs/Qm..."),
    scvSymbol("alice"),
  )
);
```

---

### `update_profile`

Update an existing profile. All fields are optional — pass `None` to skip.

```rust
fn update_profile(env: Env, caller: Address, display_name: Option<String>, bio: Option<String>,
    image_url: Option<String>, x_handle: Option<String>) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be profile owner)
**Errors**: `NotRegistered` (8), `ContractPaused` (7), `InvalidDisplayName` (12), `MessageTooLong` (21), `InvalidImageUrl` (22), `InvalidUsername` (11)

**JavaScript example:**
```js
await contract.call("update_profile",
  scvAddress(wallet.publicKey),
  scvOption(scvSymbol("New Display Name")),  // Some("New Display Name")
  scvOption(null),                            // None - skip bio
  scvOption(null),                            // None - skip image
  scvOption(scvSymbol("new_handle")),         // Some("new_handle")
);
```

---

### `deregister_profile`

Permanently remove a profile. Balance must be zero.

```rust
fn deregister_profile(env: Env, caller: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller`
**Errors**: `NotRegistered` (8), `ContractPaused` (7), `BalanceNotZero` (15)
**Effects**: Removes profile, username lookup, leaderboard entries, tip indexes
**Events**: `("profile", "deregist")` → `(owner, username)`

---

### `deactivate_profile`

Temporarily deactivate a profile (self or admin). Hides from leaderboard, blocks tips. Data and balance remain.

```rust
fn deactivate_profile(env: Env, caller: Address, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller`; if `caller != creator`, must be admin
**Errors**: `NotRegistered` (8), `AlreadyDeactivated` (18), `ContractPaused` (7)
**Events**: `("profile", "deact")` → `(creator, actor)`

---

### `reactivate_profile`

Restore a deactivated profile (self or admin).

```rust
fn reactivate_profile(env: Env, caller: Address, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller`; if `caller != creator`, must be admin
**Errors**: `NotRegistered` (8), `ProfileNotDeactivated` (20), `ContractPaused` (7)
**Events**: `("profile", "react")` → `(creator, actor)`

---

### `get_profile`

Get a profile by Stellar address, including deactivation status.

```rust
fn get_profile(env: Env, address: Address) -> Result<ProfileWithDeactivation, ContractError>
```

**Returns**: `ProfileWithDeactivation { profile: Profile, is_deactivated: bool, deactivated_at: Option<u64> }`
**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

**JavaScript example:**
```js
const result = await simulateTx(
  contract.call("get_profile", scvAddress("G...CREATOR..."))
);
console.log(result.profile.username);        // "alice"
console.log(result.profile.credit_score);    // 40
console.log(result.profile.balance);         // "10000000" (in stroops)
console.log(result.is_deactivated);          // false
```

---

### `get_profile_by_username`

Get a profile by username, including deactivation status.

```rust
fn get_profile_by_username(env: Env, username: String) -> Result<ProfileWithDeactivation, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotFound` (17)

---

### `update_x_metrics`

Update X (Twitter) metrics for a creator (admin only).

```rust
fn update_x_metrics(env: Env, caller: Address, creator: Address, x_followers: u32,
    x_engagement_avg: u32) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `NotRegistered` (8)
**Events**: `("credit", "updated")` → `(creator, old_score, new_score)` (if score changed)

---

### `batch_update_x_metrics`

Update X metrics for up to 50 creators in one transaction. Each tuple is `(creator, x_followers, x_engagement_avg)`.

```rust
fn batch_update_x_metrics(env: Env, caller: Address, updates: Vec<(Address, u32, u32)>)
    -> Result<Vec<BatchSkip>, ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `BatchTooLarge` (23) — max 50 entries
**Returns**: `Vec<BatchSkip>` describing each skipped entry

| Skip reason | Meaning |
|-------------|---------|
| `0` | Address is not registered |
| `1` | Metric values failed validation (`x_followers > 500M` or `x_engagement_avg > 1M`) |

**Events**: `("batch", "skipped")` per entry, `("batch", "done")` at completion

---

### `batch_update_x_metrics_preview`

Dry-run version of `batch_update_x_metrics`. Returns which entries would be skipped without modifying any state.

```rust
fn batch_update_x_metrics_preview(env: Env, caller: Address, updates: Vec<(Address, u32, u32)>)
    -> Result<Vec<BatchSkip>, ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `BatchTooLarge` (23)

---

## Tipping

### `send_tip`

Send an XLM tip to a registered creator. Funds transfer from `tipper` to the contract.

```rust
fn send_tip(env: Env, tipper: Address, creator: Address, amount: i128, message: String,
    is_anonymous: bool) -> Result<(), ContractError>
```

| Param | Type | Description |
|-------|------|-------------|
| `tipper` | `Address` | Sender (must authorize) |
| `creator` | `Address` | Recipient (must be registered) |
| `amount` | `i128` | Amount in stroops (1 XLM = 10,000,000 stroops) |
| `message` | `String` | Optional message (max 280 chars) |
| `is_anonymous` | `bool` | Hide sender identity from public tip records |

**Auth**: Require from `tipper`
**Errors**: `NotInitialized` (1), `ContractPaused` (7), `NotRegistered` (8), `InvalidAmount` (13), `CannotTipSelf` (25), `MessageTooLong` (21), `InvalidMessage` (33), `TipBelowMinimum` (31), `BelowCreatorMinimum` (34), `ProfileDeactivated` (19), `RateLimitExceeded` (29)
**Events**: `("tip", "sent")` → `(tip_id, tipper, creator, amount, message, timestamp, is_anonymous)`

**Rust example:**
```rust
contract.send_tip(
    &tipper,
    &creator,
    &10_000_000_i128,  // 1 XLM
    &String::from_str(&env, "Great content!"),
    &false,
);
```

**JavaScript example:**
```js
const txHash = await submitTx(
  contract.call("send_tip",
    scvAddress(tipperPubKey),
    scvAddress(creatorAddr),
    scvI128(10_000_000n),  // 1 XLM in stroops
    scvSymbol("Great content!"),
    scvBool(false),
  )
);
```

---

### `send_tip_on_behalf`

Send a tip where the funder (`sender`) differs from the person receiving the social credit (`on_behalf_of`).

```rust
fn send_tip_on_behalf(env: Env, sender: Address, on_behalf_of: Address, creator: Address,
    amount: i128, message: String) -> Result<(), ContractError>
```

**Auth**: Require from both `sender` and `on_behalf_of`
**Errors**: `ContractPaused` (7), `NotRegistered` (8), `ProfileDeactivated` (19), `CannotTipSelf` (25), `RateLimitExceeded` (29)
**Events**: `("tip", "sent")`

---

### `send_tip_token`

Send a tip using a whitelisted token instead of XLM.

```rust
fn send_tip_token(env: Env, tipper: Address, creator: Address, amount: i128, token: Address,
    message: String, is_anonymous: bool) -> Result<(), ContractError>
```

**Auth**: Require from `tipper`
**Errors**: `NotInitialized` (1), `ContractPaused` (7), `NotRegistered` (8), `TokenNotAccepted` (37), etc.
**Events**: `("tip", "token")` → `(tip_id, tipper, creator, amount, token, message, timestamp)`

---

### `withdraw_tips`

Withdraw accumulated tips. A fee (default 2%) is deducted and sent to the fee collector.

```rust
fn withdraw_tips(env: Env, caller: Address, amount: i128) -> Result<(), ContractError>
```

**Auth**: Require from `caller`
**Errors**: `NotRegistered` (8), `InvalidAmount` (13), `InsufficientBalance` (14), `ContractPaused` (7)
**Events**: `("tip", "withdrawn")` → `(creator, net, fee)`

```js
// Withdraw 5 XLM (50,000,000 stroops)
// Fee: 2% = 1,000,000 stroops (0.1 XLM)
// Net received: 49,000,000 stroops (4.9 XLM)
await contract.call("withdraw_tips",
  scvAddress(wallet.publicKey),
  scvI128(50_000_000n),
);
```

---

### `get_tip`

Get a single tip record by its ID. Tips expire from temporary storage after ~7 days.

```rust
fn get_tip(env: Env, tip_id: u32) -> Result<Tip, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotFound` (17) — tip doesn't exist or TTL expired

---

### `get_recent_tips`

Get recent tips received by a creator, newest first.

```rust
fn get_recent_tips(env: Env, creator: Address, limit: u32, offset: u32) -> Vec<Tip>
```

**Returns**: Up to `limit` tips (capped at 50), starting from `offset` entries back from the most recent
**Auth**: None (read-only)
**Note**: Expired tips are silently omitted; use `get_creator_tip_count` for pagination totals

```js
// Page 1: 10 most recent tips
const tips = await simulateTx(
  contract.call("get_recent_tips", scvAddress(creator), scvU32(10), scvU32(0))
);
```

---

### `get_creator_tip_count`

Get the number of tips received by a creator within the ~7-day TTL window.

```rust
fn get_creator_tip_count(env: Env, creator: Address) -> u32
```

**Auth**: None (read-only)

---

### `get_tip_count`

Get the total number of tips ever sent (monotonically increasing, never expires).

```rust
fn get_tip_count(env: Env) -> u32
```

**Auth**: None (read-only)

---

### `get_tips_by_tipper`

Get recent tips sent by a tipper, newest first.

```rust
fn get_tips_by_tipper(env: Env, tipper: Address, limit: u32) -> Vec<Tip>
```

**Auth**: None (read-only)

---

### `get_tipper_tip_count`

Get the number of tips sent by a tipper within the ~7-day TTL window.

```rust
fn get_tipper_tip_count(env: Env, tipper: Address) -> u32
```

**Auth**: None (read-only)

---

## Credit Score

For complete documentation of the credit score algorithm including formula, weights, examples, and update mechanisms, see [CREDIT_SCORE.md](CREDIT_SCORE.md).

### `calculate_credit_score`

Calculate and return the credit score for a profile (0–100), updating on-chain state.

```rust
fn calculate_credit_score(env: Env, address: Address) -> Result<u32, ContractError>
```

**Auth**: None
**Errors**: `NotRegistered` (8)
**Events**: `("credit", "updated")` → `(creator, old_score, new_score)` (if score changed)

| Tier | Score | Description |
|------|-------|-------------|
| New | 0–19 | No activity yet |
| Bronze | 20–39 | Early-stage creator |
| Silver | 40–59 | Default at registration |
| Gold | 60–79 | Established creator |
| Diamond | 80–100 | Elite creator |

---

### `get_credit_tier`

Get the current credit score and tier for a profile.

```rust
fn get_credit_tier(env: Env, address: Address) -> Result<(u32, CreditTier), ContractError>
```

**Returns**: `(score: u32, tier: CreditTier)`
**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

### `get_credit_breakdown`

Get the weighted component breakdown of a profile's credit score.

```rust
fn get_credit_breakdown(env: Env, address: Address) -> Result<CreditBreakdown, ContractError>
```

**Returns**: `CreditBreakdown { base, tip_score, x_score, age_score, streak_score, total }`
**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

### `get_streak`

Get the current supporter streak for a `(supporter, creator)` pair.

```rust
fn get_streak(env: Env, supporter: Address, creator: Address) -> Result<Streak, ContractError>
```

**Returns**: `Streak { supporter, creator, current, longest, last_tip_day, bonus_points }`
**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

## Leaderboard

### `get_leaderboard`

Get the top creators by tips received, sorted descending.

```rust
fn get_leaderboard(env: Env, period: LeaderboardPeriod, limit: u32)
    -> Result<Vec<LeaderboardEntry>, ContractError>
```

| Param | Type | Description |
|-------|------|-------------|
| `period` | `LeaderboardPeriod` | `AllTime`, `Monthly`, or `Weekly` |
| `limit` | `u32` | Max entries to return; `0` returns all (up to 50) |

**Returns**: `Vec<LeaderboardEntry>` sorted descending by amount
**Auth**: None (read-only)

**JavaScript example:**
```js
import { scvSymbol } from "@stellar/stellar-sdk";

const lb = await simulateTx(
  contract.call("get_leaderboard", scvSymbol("AllTime"), scvU32(10))
);
// lb = [
//   { address: "G...", username: "alice", amount: 50000000n, credit_score: 80 },
//   ...
// ]
```

---

### `reset_leaderboard`

Reset a leaderboard period (admin only). All-time leaderboard is immutable.

```rust
fn reset_leaderboard(env: Env, caller: Address, period: LeaderboardPeriod)
    -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Note**: All-time period cannot be reset — the call is a no-op.

---

### `get_leaderboard_rank`

Get the 1-based rank of an address on the leaderboard, or `None` if not in the top 50.

```rust
fn get_leaderboard_rank(env: Env, period: LeaderboardPeriod, address: Address) -> Option<u32>
```

**Auth**: None (read-only)

---

### `get_leaderboard_size`

Get the current number of entries on the leaderboard (0–50).

```rust
fn get_leaderboard_size(env: Env, period: LeaderboardPeriod) -> u32
```

**Auth**: None (read-only)

---

## Admin

### `set_fee`

Update the withdrawal fee in basis points. Max 1000 (10%).

```rust
fn set_fee(env: Env, caller: Address, fee_bps: u32) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `InvalidFee` (24)
**Events**: `("fee", "updated")` → `(old_bps, new_bps)`

---

### `set_fee_collector`

Update the fee collector address.

```rust
fn set_fee_collector(env: Env, caller: Address, new_collector: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3)
**Events**: `("fee", "collector")` → `(new_collector)`

---

### `set_admin`

Transfer the admin role directly (no time lock). Admin only.

```rust
fn set_admin(env: Env, caller: Address, new_admin: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `NotInitialized` (1)
**Events**: `("admin", "changed")` → `(old_admin, new_admin)`

---

### `propose_admin_change`

Propose a new admin with a 48-hour time lock. At most one pending proposal at a time.

```rust
fn propose_admin_change(env: Env, caller: Address, new_admin: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `AdminChangeAlreadyPending` (4)
**Events**: `("admin", "chgprop")` → `(current_admin, new_admin, confirmable_after)`

---

### `confirm_admin_change`

Confirm the pending admin change after the time lock. Only the proposed `new_admin` may call this.

```rust
fn confirm_admin_change(env: Env, caller: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be the proposed new admin)
**Errors**: `NotInitialized` (1), `NoPendingAdmin` (6), `NotAuthorized` (3), `AdminChangeTimelockNotMet` (5)
**Events**: `("admin", "chgconf")` → `(old_admin, new_admin)`

---

### `cancel_admin_change`

Cancel the pending time-locked admin change (current admin only).

```rust
fn cancel_admin_change(env: Env, caller: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `NoPendingAdmin` (6)
**Events**: `("admin", "canceled")` → `(current_admin)`

---

### `get_admin_change_proposal`

Get the pending admin-change proposal, if any.

```rust
fn get_admin_change_proposal(env: Env) -> Result<Option<AdminChangeProposal>, ContractError>
```

**Returns**: `Option<AdminChangeProposal { new_admin, confirmable_after }>`
**Auth**: None (read-only)
**Errors**: `NotInitialized` (1)

---

### `get_admin_change_history`

Get admin change history entries, newest first.

```rust
fn get_admin_change_history(env: Env, limit: u32, offset: u32)
    -> Result<Vec<AdminChangeHistoryEntry>, ContractError>
```

**Returns**: `Vec<AdminChangeHistoryEntry { old_admin, new_admin, confirmed_at }>` (max 50 per call)
**Auth**: None (read-only)
**Errors**: `NotInitialized` (1)

---

### `get_stats`

Get global contract statistics.

```rust
fn get_stats(env: Env) -> Result<ContractStats, ContractError>
```

**Returns**: `ContractStats { total_creators, total_tips_count, total_tips_volume, total_fees_collected, fee_bps }`
**Auth**: None (read-only)
**Errors**: `NotInitialized` (1)

---

### `get_config`

Get full contract configuration (superset of `get_stats`).

```rust
fn get_config(env: Env) -> Result<ContractConfig, ContractError>
```

**Returns**: `ContractConfig { admin, fee_collector, fee_bps, native_token, total_creators, total_tips_count, total_tips_volume, total_fees_collected, is_initialized, version }`
**Auth**: None (read-only)
**Errors**: `NotInitialized` (1)

---

### `bump_ttl`

Extend the contract instance TTL manually (admin only).

```rust
fn bump_ttl(env: Env, caller: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3)

---

### `pause` / `unpause` / `is_paused`

Emergency pause and unpause. Admin only.

```rust
fn pause(env: Env, caller: Address) -> Result<(), ContractError>
fn unpause(env: Env, caller: Address) -> Result<(), ContractError>
fn is_paused(env: Env) -> bool
```

**Auth**: Require from `caller` (must be admin) for `pause`/`unpause`; none for `is_paused`
**Events**: `("contract", "paused")` / `("contract", "unpaused")` → `(admin)`

---

### `set_min_tip_amount`

Set global minimum tip amount in stroops. Admin only.

```rust
fn set_min_tip_amount(env: Env, caller: Address, amount: i128) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `InvalidAmount` (13)
**Events**: `("tip", "min")` → `(old_min, new_min)`

---

### `get_min_tip_amount`

Get global minimum tip amount in stroops.

```rust
fn get_min_tip_amount(env: Env) -> i128
```

**Auth**: None (read-only)

---

### `set_rate_limit_config`

Update rate limit configuration. Admin only.

```rust
fn set_rate_limit_config(env: Env, caller: Address, max_ops: u32, window_secs: u64)
    -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Events**: None

---

### `get_rate_limit_config`

Get current rate limit configuration.

```rust
fn get_rate_limit_config(env: Env) -> RateLimitConfig
```

**Returns**: `RateLimitConfig { max_ops, window_secs }` (default: 50 ops per 3600s)
**Auth**: None (read-only)

---

### `set_min_tip`

Set a creator's custom minimum tip. Pass `0` to reset to global.

```rust
fn set_min_tip(env: Env, creator: Address, min_amount: i128) -> Result<(), ContractError>
```

**Auth**: Require from `creator`
**Errors**: `NotRegistered` (8), `InvalidAmount` (13)
**Events**: `("profile", "min_tip")` → `(creator, amount_or_none)`

---

### `get_creator_min_tip`

Get the effective minimum tip for a creator (custom override or global default).

```rust
fn get_creator_min_tip(env: Env, creator: Address) -> Result<i128, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

## Versioning

### `get_version`

Get the on-chain stored contract version. Returns `0` if not initialized.

```rust
fn get_version(env: Env) -> u32
```

**Auth**: None (read-only)

---

### `upgrade`

Replace the contract WASM bytecode and bump the version. Admin only.

```rust
fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), ContractError>
```

**Auth**: Require from `admin` (must be stored admin)
**Errors**: `NotAuthorized` (3)

---

## Verification

### `request_verification`

Request verification as a creator.

```rust
fn request_verification(env: Env, caller: Address, verification_type: VerificationType)
    -> Result<(), ContractError>
```

| `VerificationType` | Description |
|--------------------|-------------|
| `Identity` | Government/legal identity |
| `SocialMedia` | Social media presence |
| `Community` | Community endorsement |

**Auth**: Require from `caller`
**Events**: `("verify", "requested")` → `(creator, verification_type)`

---

### `approve_verification`

Approve a verification request (admin only).

```rust
fn approve_verification(env: Env, caller: Address, creator: Address, verification_type: VerificationType)
    -> Result<(), ContractError>
```

**Auth**: Require from `caller`
**Events**: `("verify", "approved")` → `(creator, verification_type)`

---

### `revoke_verification`

Revoke a creator's verification (admin only).

```rust
fn revoke_verification(env: Env, caller: Address, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller`
**Events**: `("verify", "revoked")` → `(creator)`

---

### `get_verification_status`

Get verification status for a creator.

```rust
fn get_verification_status(env: Env, creator: Address) -> Result<VerificationStatus, ContractError>
```

**Returns**: `VerificationStatus { is_verified, verification_type, verified_at, revoked_at }`
**Auth**: None (read-only)

---

## Subscriptions

### `create_subscription`

Create a recurring tip subscription.

```rust
fn create_subscription(env: Env, subscriber: Address, creator: Address, amount: i128, interval_days: u32)
    -> Result<Subscription, ContractError>
```

| Param | Type | Description |
|-------|------|-------------|
| `subscriber` | `Address` | Person funding the recurring tip |
| `creator` | `Address` | Recipient creator |
| `amount` | `i128` | Per-interval tip amount in stroops |
| `interval_days` | `u32` | Days between payments (7 = weekly, 30 = monthly) |

**Returns**: `Subscription { subscriber, creator, amount, interval_days, next_due, active }`
**Auth**: Require from `subscriber`
**Errors**: `InvalidAmount` (13), `NotRegistered` (8), `ProfileDeactivated` (19), `CannotTipSelf` (25)
**Events**: `("sub", "created")` → `(subscriber, creator, amount, interval_days)`

**JavaScript example:**
```js
// Subscribe to creator with 10 XLM per month
await contract.call("create_subscription",
  scvAddress(wallet.publicKey),
  scvAddress(creatorAddress),
  scvI128(100_000_000n),  // 10 XLM
  scvU32(30),              // every 30 days
);
```

---

### `cancel_subscription`

Cancel an active subscription.

```rust
fn cancel_subscription(env: Env, subscriber: Address, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `subscriber`
**Errors**: `NotFound` (17)
**Events**: `("sub", "cancel")` → `(subscriber, creator)`

---

### `execute_due_subscription`

Execute a recurring payment that is past its `next_due` timestamp.

```rust
fn execute_due_subscription(env: Env, subscriber: Address, creator: Address)
    -> Result<(), ContractError>
```

**Auth**: Require on internal `send_tip` call (requires subscriber auth for tip transfer)
**Errors**: `NotFound` (17), plus all `send_tip` errors
**Events**: `("sub", "exec")` → `(subscriber, creator, amount)` + `("tip", "sent")`

---

### `get_subscriptions`

Get all subscriptions for a subscriber.

```rust
fn get_subscriptions(env: Env, subscriber: Address) -> Vec<Subscription>
```

**Auth**: None (read-only)

---

### `get_subscribers`

Get all subscribers for a creator.

```rust
fn get_subscribers(env: Env, creator: Address) -> Vec<Subscription>
```

**Auth**: None (read-only)

---

## Multi-Signature

### `set_multisig_config`

Set multi-signature configuration (admin only).

```rust
fn set_multisig_config(env: Env, admin: Address, required_signatures: u32, signers: Vec<Address>)
    -> Result<(), ContractError>
```

**Auth**: Require from `admin`

---

### `get_multisig_config`

Get current multi-signature configuration.

```rust
fn get_multisig_config(env: Env) -> Option<MultisigConfig>
```

**Auth**: None (read-only)

---

### `propose_action`

Propose a new action for multi-sig approval by signers.

```rust
fn propose_action(env: Env, signer: Address, action: Action) -> Result<u32, ContractError>
```

**Auth**: Require from `signer`
**Returns**: Proposal ID
**Events**: `("proposal", "created")` → `(proposal_id, proposer, action)`

---

### `approve_action`

Approve an existing proposal by signer.

```rust
fn approve_action(env: Env, signer: Address, proposal_id: u32) -> Result<(), ContractError>
```

**Auth**: Require from `signer`
**Events**: `("proposal", "approved")` → `(proposal_id, approver)`

---

### `get_pending_proposals`

Get all pending proposals.

```rust
fn get_pending_proposals(env: Env) -> Vec<Proposal>
```

**Auth**: None (read-only)

---

### `get_proposal`

Get a specific proposal by ID.

```rust
fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal>
```

**Auth**: None (read-only)

---

## Donation Pages

### `set_donation_page`

Set custom donation page configuration for a creator.

```rust
fn set_donation_page(env: Env, creator: Address, config: DonationPageConfig)
    -> Result<(), ContractError>
```

**Auth**: Require from `creator`
**Errors**: `NotRegistered` (8), `MessageTooLong` (21)
**Events**: `("donation", "config")` → `(creator)`

---

### `get_donation_page`

Get donation page configuration for a creator (returns default if not set).

```rust
fn get_donation_page(env: Env, creator: Address) -> Result<DonationPageConfig, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

## Domain Verification

### `set_domain`

Set the domain to verify via stellar.toml (marks verification as pending).

```rust
fn set_domain(env: Env, creator: Address, domain: String) -> Result<(), ContractError>
```

**Auth**: Require from `creator`
**Errors**: `NotRegistered` (8), `InvalidDomain` (35)
**Events**: `("domain", "set")` → `(creator, domain)`

---

### `verify_domain`

Admin confirms domain verification after off-chain stellar.toml check.

```rust
fn verify_domain(env: Env, caller: Address, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `NotRegistered` (8), `InvalidDomain` (35), `AlreadyVerified` (27)
**Events**: `("domain", "verify")` → `(creator, domain)`

---

### `set_domain_reverify_interval`

Configure domain re-verification interval in seconds (admin only).

```rust
fn set_domain_reverify_interval(env: Env, caller: Address, interval_secs: u64)
    -> Result<(), ContractError>
```

**Auth**: Require from `caller` (must be admin)
**Errors**: `NotAuthorized` (3), `InvalidAmount` (13) — if interval is 0

---

### `get_domain_reverify_interval`

Get the configured domain re-verification interval.

```rust
fn get_domain_reverify_interval(env: Env) -> u64
```

**Auth**: None (read-only)
**Default**: 30 days (2,592,000 seconds)

---

## Platform Statistics

### `get_platform_stats`

Get comprehensive platform statistics.

```rust
fn get_platform_stats(env: Env) -> Result<PlatformStats, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotInitialized` (1)

---

### `get_creator_stats`

Get statistics for a specific creator.

```rust
fn get_creator_stats(env: Env, creator: Address) -> Result<CreatorStats, ContractError>
```

**Auth**: None (read-only)
**Errors**: `NotRegistered` (8)

---

## Goal Tracking

### `set_goal`

Set a fundraising goal for a creator.

```rust
fn set_goal(env: Env, creator: Address, target_amount: i128, description: String, deadline: u64)
    -> Result<(), ContractError>
```

**Auth**: Require from `creator`
**Errors**: `InvalidAmount` (13), `NotRegistered` (8)
**Events**: `("goal", "set")` → `(creator, target, description, deadline)`

---

### `get_goal`

Get the active goal for a creator.

```rust
fn get_goal(env: Env, creator: Address) -> Result<Goal, ContractError>
```

**Returns**: `Goal { creator, target, raised, description, deadline, active, created_at, reached_at }`
**Auth**: None (read-only)
**Errors**: `NotFound` (17)

---

### `cancel_goal`

Cancel the active goal for a creator.

```rust
fn cancel_goal(env: Env, creator: Address) -> Result<(), ContractError>
```

**Auth**: Require from `creator`
**Events**: `("goal", "cancel")` → `(creator)`

---

### `get_archived_goals`

Get archived (completed/cancelled) goals for a creator.

```rust
fn get_archived_goals(env: Env, creator: Address) -> Vec<Goal>
```

**Auth**: None (read-only)

---

## Multi-Token Support

### `add_accepted_token`

Add a token to the whitelist (admin only).

```rust
fn add_accepted_token(env: Env, admin: Address, token: Address, oracle: Option<Address>)
    -> Result<(), ContractError>
```

**Auth**: Require from `admin`
**Events**: `("token", "added")` → `(token, oracle)`

---

### `remove_accepted_token`

Remove a token from the whitelist (admin only).

```rust
fn remove_accepted_token(env: Env, admin: Address, token: Address) -> Result<(), ContractError>
```

**Auth**: Require from `admin`
**Events**: `("token", "removed")` → `(token)`

---

### `get_accepted_tokens`

Get list of all accepted tokens.

```rust
fn get_accepted_tokens(env: Env) -> Vec<AcceptedToken>
```

**Auth**: None (read-only)

---

### `withdraw_token`

Withdraw accumulated tips in a specific token.

```rust
fn withdraw_token(env: Env, caller: Address, token: Address, amount: i128)
    -> Result<(), ContractError>
```

**Auth**: Require from `caller`

---

### `get_token_balances`

Get all token balances for a creator.

```rust
fn get_token_balances(env: Env, creator: Address) -> Vec<TokenBalance>
```

**Auth**: None (read-only)

---

## Inactive Profile Cleanup

### `cleanup_inactive_profile`

Remove an inactive profile (admin only). Profile must have been inactive > 180 days and have zero balance.

```rust
fn cleanup_inactive_profile(env: Env, admin: Address, target: Address) -> Result<String, ContractError>
```

**Returns**: The cleaned up profile's username
**Auth**: Require from `admin`
**Errors**: `NotAuthorized` (3), `NotRegistered` (8), `ProfileInactive` (39), `BalanceNotZero` (15)

---

### `cleanup_inactive_profiles`

Batch cleanup of up to 20 inactive profiles (admin only).

```rust
fn cleanup_inactive_profiles(env: Env, admin: Address, targets: Vec<Address>, max_cleanup: u32)
    -> Result<u32, ContractError>
```

**Returns**: Number of profiles actually cleaned up
**Auth**: Require from `admin`

---

### `is_profile_inactive_eligible`

Check whether a profile is eligible for cleanup.

```rust
fn is_profile_inactive_eligible(env: Env, address: Address) -> bool
```

**Auth**: None (read-only)
**Returns**: `true` if inactive > 180 days and balance is zero

---

## Error Codes Reference

| Code | Variant | Description |
|------|---------|-------------|
| 1 | `NotInitialized` | Contract has not been initialized |
| 2 | `AlreadyInitialized` | Cannot initialize more than once |
| 3 | `NotAuthorized` | Caller is not the admin |
| 4 | `AdminChangeAlreadyPending` | A time-locked admin change is already pending |
| 5 | `AdminChangeTimelockNotMet` | 48-hour time lock has not elapsed |
| 6 | `NoPendingAdmin` | No pending admin change to confirm/cancel |
| 7 | `ContractPaused` | Contract is paused (emergency) |
| 8 | `NotRegistered` | Profile does not exist |
| 9 | `AlreadyRegistered` | Address already has a profile |
| 10 | `UsernameTaken` | Username is in use by another creator |
| 11 | `InvalidUsername` | Username fails format validation |
| 12 | `InvalidDisplayName` | Display name is empty or > 64 chars |
| 13 | `InvalidAmount` | Amount is zero, negative, or invalid |
| 14 | `InsufficientBalance` | Not enough balance to withdraw |
| 15 | `BalanceNotZero` | Cannot deregister with unwithdrawn balance |
| 16 | `OverflowError` | Arithmetic overflow detected |
| 17 | `NotFound` | Requested resource does not exist |
| 18 | `AlreadyDeactivated` | Profile is already deactivated |
| 19 | `ProfileDeactivated` | Operation blocked on deactivated profile |
| 20 | `ProfileNotDeactivated` | Profile is not deactivated |
| 21 | `MessageTooLong` | Bio or message exceeds character limit |
| 22 | `InvalidImageUrl` | Image URL exceeds 256 characters |
| 23 | `BatchTooLarge` | Batch update exceeds 50 entries |
| 24 | `InvalidFee` | Fee exceeds 1000 bps (10%) |
| 25 | `CannotTipSelf` | Cannot tip your own profile |
| 26 | `NotVerified` | Creator verification required |
| 27 | `AlreadyVerified` | Creator is already verified |
| 28 | `Unauthorized` | Caller lacks permission |
| 29 | `RateLimitExceeded` | Too many operations in the rate limit window |
| 30 | `InvalidXHandle` | X handle format is invalid |
| 31 | `TipBelowMinimum` | Tip amount below global minimum |
| 32 | `ProfileNotActive` | Profile is not in active state |
| 33 | `InvalidMessage` | Message contains invalid control characters |
| 34 | `BelowCreatorMinimum` | Tip below creator's custom minimum |
| 35 | `InvalidDomain` | Domain format is invalid |
| 36 | `InvalidInput` | Generic invalid input error |
| 37 | `TokenNotAccepted` | Token is not in the accepted whitelist |
| 38 | `MaxProfilesReached` | Maximum number of profiles reached |
| 39 | `ProfileInactive` | Profile is not sufficiently inactive for cleanup |

---

## Event Types Reference

### Profile Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("profile", "register")` | `(owner, username)` | Profile registered |
| `("profile", "updated")` | `(owner)` | Profile fields updated |
| `("profile", "deregist")` | `(owner, username)` | Profile permanently removed |
| `("profile", "deact")` | `(creator, actor)` | Profile temporarily deactivated |
| `("profile", "react")` | `(creator, actor)` | Profile reactivated |
| `("profile", "min_tip")` | `(creator, amount_or_none)` | Creator's custom minimum tip changed |

### Tip Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("tip", "sent")` | `(tip_id, tipper, creator, amount, message, timestamp, is_anonymous)` | Tip sent (XLM or on-behalf) |
| `("tip", "token")` | `(tip_id, tipper, creator, amount, token, message, timestamp)` | Tip sent with non-XLM token |
| `("tip", "withdrawn")` | `(creator, net_amount, fee)` | Tips withdrawn by creator |
| `("tip", "min")` | `(old_min, new_min)` | Global minimum tip amount changed |

### Credit Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("credit", "updated")` | `(creator, old_score, new_score)` | Credit score recalculated |
| `("streak", "milestone")` | `(supporter, creator, current)` | Supporter streak milestone reached |

### Admin Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("admin", "changed")` | `(old_admin, new_admin)` | Admin directly changed |
| `("admin", "chgprop")` | `(current_admin, new_admin, confirmable_after)` | Time-locked admin change proposed |
| `("admin", "chgconf")` | `(old_admin, new_admin)` | Time-locked admin change confirmed |
| `("admin", "canceled")` | `(current_admin)` | Pending admin proposal cancelled |
| `("contract", "paused")` | `(admin)` | Contract emergency paused |
| `("contract", "unpaused")` | `(admin)` | Contract unpaused |

### Fee Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("fee", "updated")` | `(old_bps, new_bps)` | Withdrawal fee percentage changed |
| `("fee", "collector")` | `(new_collector)` | Fee collector address changed |
| `("fee", "split")` | `(ops_pct, pool_pct)` | Fee split percentages updated |
| `("fee", "dist")` | `(amount, to_ops)` | Fees distributed |
| `("pool", "dist")` | `(total_amount, recipient_count)` | Pool distribution executed |

### Verification Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("verify", "requested")` | `(creator, verification_type)` | Creator requests verification |
| `("verify", "approved")` | `(creator, verification_type)` | Verification approved by admin |
| `("verify", "revoked")` | `(creator)` | Verification revoked |

### Batch Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("batch", "skipped")` | `(creator, reason)` | Single entry skipped in batch |
| `("batch", "done")` | `(processed, skipped_count, skipped_entries)` | Batch operation completed |

### Subscription Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("sub", "created")` | `(subscriber, creator, amount, interval_days)` | Recurring subscription created |
| `("sub", "cancel")` | `(subscriber, creator)` | Subscription cancelled |
| `("sub", "exec")` | `(subscriber, creator, amount)` | Recurring payment executed |

### Domain Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("domain", "set")` | `(creator, domain)` | Domain set for verification |
| `("domain", "verify")` | `(creator, domain)` | Domain verified by admin |
| `("domain", "expired")` | `(creator)` | Domain verification expired |

### Goal Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("goal", "set")` | `(creator, target, description, deadline)` | Fundraising goal created |
| `("goal", "reached")` | `(creator, target, raised)` | Goal target reached |
| `("goal", "cancel")` | `(creator)` | Goal cancelled |

### Multi-Token Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("token", "added")` | `(token, oracle)` | Token added to whitelist |
| `("token", "removed")` | `(token)` | Token removed from whitelist |

### Donation Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("donation", "config")` | `(creator)` | Donation page configuration updated |

### Multi-Sig / Proposal Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("proposal", "created")` | `(proposal_id, proposer, action)` | Multi-sig proposal created |
| `("proposal", "approved")` | `(proposal_id, approver)` | Proposal approved by signer |
| `("proposal", "executed")` | `(proposal_id)` | Proposal executed |

### Withdrawal Scheduling Events

| Topics | Data | Emitted When |
|--------|------|-------------|
| `("wd", "sched")` | `(creator, id, amount, unlock_at)` | Withdrawal scheduled |
| `("wd", "exec")` | `(creator, id, amount)` | Scheduled withdrawal executed |
| `("wd", "cancel")` | `(creator, id)` | Scheduled withdrawal cancelled |

---

## Data Types Reference

### Profile

```rust
struct Profile {
    owner: Address,
    username: String,           // 3-32 chars, [a-z][a-z0-9_]*
    display_name: String,       // 1-64 chars
    bio: String,                // 0-280 chars
    website: String,            // 0-200 chars
    image_url: String,          // 0-256 chars
    social_links: Map<Symbol, String>,
    x_handle: String,
    x_followers: u32,
    x_engagement_avg: u32,
    credit_score: u32,          // 0-100 (starts at 40)
    total_tips_received: i128,  // in stroops
    total_tips_count: u32,
    balance: i128,              // withdrawable balance in stroops
    registered_at: u64,         // unix timestamp
    updated_at: u64,
    verification: VerificationStatus,
    domain: String,
    domain_verified: bool,
    domain_verified_at: Option<u64>,
    custom_min_tip: Option<i128>,
}
```

### Tip

```rust
struct Tip {
    id: u32,
    sender: Address,
    benefactor: Option<Address>,
    creator: Address,
    amount: i128,               // in stroops
    message: String,            // 0-280 chars
    timestamp: u64,
    is_anonymous: bool,
}
```

### LeaderboardEntry

```rust
struct LeaderboardEntry {
    address: Address,
    username: String,
    amount: i128,               // tips received in period
    credit_score: u32,
}
```

### ContractStats / ContractConfig

```rust
struct ContractStats {
    total_creators: u32,
    total_tips_count: u32,
    total_tips_volume: i128,
    total_fees_collected: i128,
    fee_bps: u32,
}

struct ContractConfig {
    admin: Address,
    fee_collector: Address,
    fee_bps: u32,
    native_token: Address,
    total_creators: u32,
    total_tips_count: u32,
    total_tips_volume: i128,
    total_fees_collected: i128,
    is_initialized: bool,
    version: u32,
}
```

### Subscription

```rust
struct Subscription {
    subscriber: Address,
    creator: Address,
    amount: i128,               // per-interval amount in stroops
    interval_days: u32,         // 7 = weekly, 30 = monthly
    next_due: u64,              // unix timestamp of next payment
    active: bool,
}
```

### Goal

```rust
struct Goal {
    creator: Address,
    target: i128,               // target amount in stroops
    raised: i128,               // raised so far
    description: String,        // max 500 chars
    deadline: u64,              // 0 = no deadline
    active: bool,
    created_at: u64,
    reached_at: Option<u64>,
}
```

### Streak

```rust
struct Streak {
    supporter: Address,
    creator: Address,
    current: u32,               // current consecutive streak
    longest: u32,               // longest streak observed
    last_tip_day: Option<u64>,  // day index of last qualifying tip
    bonus_points: u32,          // lifetime bonus from this streak
}
```

### VerificationStatus

```rust
struct VerificationStatus {
    is_verified: bool,
    verification_type: VerificationType, // Unverified | Identity | SocialMedia | Community
    verified_at: Option<u64>,
    revoked_at: Option<u64>,
}
```

### CreditBreakdown

```rust
struct CreditBreakdown {
    base: u32,          // fixed base score
    tip_score: u32,     // weighted contribution from tips
    x_score: u32,       // weighted contribution from X metrics
    age_score: u32,     // weighted contribution from account age
    streak_score: u32,  // weighted contribution from streaks
    total: u32,         // final score capped at 100
}
```

### AdminChangeProposal / AdminChangeHistoryEntry

```rust
struct AdminChangeProposal {
    new_admin: Address,
    confirmable_after: u64,  // 48 hours after proposal
}

struct AdminChangeHistoryEntry {
    old_admin: Address,
    new_admin: Address,
    confirmed_at: u64,
}
```

### Rate Limit Types

```rust
struct RateLimitConfig {
    max_ops: u32,       // max operations per window (default: 50)
    window_secs: u64,   // window duration in seconds (default: 3600)
}

struct RateLimitStatus {
    count: u32,         // operations in current window
    last_op_time: u64,  // window start timestamp
}
```

### Multi-Token Types

```rust
struct AcceptedToken {
    token_address: Address,
    oracle_address: Option<Address>,
    enabled: bool,
    added_at: u64,
}

struct TokenBalance {
    token_address: Address,
    amount: i128,
}
```

### DonationPageConfig

```rust
struct DonationPageConfig {
    welcome_message: String,              // max 500 chars
    suggested_amounts: Vec<i128>,         // up to 6 presets
    theme_color: String,                  // hex e.g. "#ff6b6b"
    header_image_uri: String,             // max 256 chars
    is_default: bool,
}
```

### ScheduledTip

```rust
struct ScheduledTip {
    id: u32,
    sender: Address,
    creator: Address,
    amount: i128,
    message: String,
    deliver_at: u64,       // delivery timestamp
    delivered: bool,
    delivered_at: Option<u64>,
    cancelled: bool,
    cancelled_at: Option<u64>,
    created_at: u64,
}
```

---

## Authentication & Authorization

### Authentication
All write operations require `caller.require_auth()`. The Soroban host verifies the signature against the transaction envelope. The calling account must be a signer on the transaction.

### Authorization Levels

| Level | Who | Functions |
|-------|-----|-----------|
| **Public** | Anyone | `get_profile`, `get_profile_by_username`, `get_leaderboard`, `get_leaderboard_rank`, `get_leaderboard_size`, `get_stats`, `get_config`, `get_version`, `get_tip_count`, `get_credit_tier`, `get_credit_breakdown`, `get_streak`, `get_subscriptions`, `get_subscribers`, `get_accepted_tokens`, `get_token_balances`, `is_paused`, `is_profile_inactive_eligible`, `get_min_tip_amount`, `get_rate_limit_config` |
| **Profile Owner** | The address owning the profile | `register_profile`, `update_profile`, `deregister_profile`, `deactivate_profile` (self), `reactivate_profile` (self), `set_min_tip`, `set_domain`, `set_donation_page`, `set_goal`, `cancel_goal` |
| **Tipper** | The address sending a tip | `send_tip`, `send_tip_token`, `create_subscription`, `cancel_subscription`, `execute_due_subscription` |
| **Both Sender + Benefactor** | Both must authorize | `send_tip_on_behalf` |
| **Admin** | Contract administrator | All `admin::` functions, plus `deactivate_profile` (any creator), `reactivate_profile` (any creator), `verify_domain`, `approve_verification`, `revoke_verification`, `cleanup_inactive_profile`, `cleanup_inactive_profiles` |
| **Proposed Admin** | After time lock | `confirm_admin_change` |
| **Multi-Sig Signer** | Approved signer | `propose_action`, `approve_action` |

### Rate Limiting
All write operations are rate-limited (50 ops per 3600s window by default). Admin is exempt. Registration uses a separate pool (20 per hour). Rate limit config is admin-settable via `set_rate_limit_config`.

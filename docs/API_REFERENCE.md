# Contract API Reference

> Quick reference for all public functions in the Tipz Soroban contract.

---

## Initialization

### `initialize`

```rust
fn initialize(env: Env, admin: Address, fee_collector: Address, fee_bps: u32, native_token: Address)
```

| Param | Type | Description |
|-------|------|-------------|
| `admin` | `Address` | Contract administrator |
| `fee_collector` | `Address` | Receives withdrawal fees |
| `fee_bps` | `u32` | Fee in basis points (200 = 2%) |
| `native_token` | `Address` | Stellar Asset Contract address for native XLM |

**Auth**: None (first call only)  
**Errors**: `AlreadyInitialized`

---

## Profile

### `register_profile`

```rust
fn register_profile(
    env: Env,
    caller: Address,
    username: String,
    display_name: String,
    bio: String,
    image_url: String,
    x_handle: String,
) -> Profile
```

**Auth**: `caller`  
**Errors**: `AlreadyRegistered`, `UsernameTaken`, `InvalidUsername`, `InvalidDisplayName`

---

### `update_profile`

```rust
fn update_profile(
    env: Env,
    caller: Address,
    display_name: Option<String>,
    bio: Option<String>,
    image_url: Option<String>,
    x_handle: Option<String>,
)
```

**Auth**: `caller` (must be profile owner)  
**Errors**: `NotRegistered`, `InvalidDisplayName`

---

### `update_x_metrics`

```rust
fn update_x_metrics(
    env: Env,
    caller: Address,
    target: Address,
    followers: u32,
    posts: u32,
    replies: u32,
)
```

**Auth**: `caller` (must be admin)  
**Errors**: `NotAdmin`, `NotRegistered`

---

### `get_profile`

```rust
fn get_profile(env: Env, address: Address) -> Profile
```

**Auth**: None (read-only)  
**Errors**: `NotRegistered`

---

### `get_profile_by_username`

```rust
fn get_profile_by_username(env: Env, username: String) -> Profile
```

**Auth**: None (read-only)  
**Errors**: `NotFound`

---

## Tipping

### `send_tip`

```rust
fn send_tip(
    env: Env,
    tipper: Address,
    creator: Address,
    amount: i128,
    message: String,
)
```

**Auth**: `tipper`  
**Errors**: `NotRegistered` (creator), `InvalidAmount`, `CannotTipSelf`, `InsufficientBalance`, `MessageTooLong`

---

### `withdraw_tips`

```rust
fn withdraw_tips(env: Env, caller: Address, amount: i128)
```

**Auth**: `caller`  
**Errors**: `NotRegistered`, `InvalidAmount`, `InsufficientBalance`

---

## Credit Score

### `calculate_credit_score`

```rust
fn calculate_credit_score(env: Env, address: Address) -> u32
```

**Auth**: None  
**Errors**: `NotRegistered`  
**Returns**: Score 0-100

---

## Leaderboard

### `get_leaderboard`

```rust
fn get_leaderboard(env: Env, limit: u32) -> Vec<LeaderboardEntry>
```

**Auth**: None (read-only)  
**Returns**: Top creators sorted by total tips received

---

## Admin

### `set_fee`

```rust
fn set_fee(env: Env, caller: Address, fee_bps: u32)
```

**Auth**: `caller` (must be admin)  
**Errors**: `NotAdmin`, `InvalidFee` (max 1000 = 10%)

---

### `set_fee_collector`

```rust
fn set_fee_collector(env: Env, caller: Address, new_collector: Address)
```

**Auth**: `caller` (must be admin)  
**Errors**: `NotAdmin`

---

### `set_admin`

```rust
fn set_admin(env: Env, caller: Address, new_admin: Address)
```

**Auth**: `caller` (must be admin)  
**Errors**: `NotAdmin`

---

### `get_stats`

```rust
fn get_stats(env: Env) -> ContractStats
```

**Auth**: None (read-only)  
**Returns**: `ContractStats { total_creators, total_tips_count, total_tips_volume, total_fees_collected, fee_bps }`

---

## Events

All events are published via `env.events().publish()`:

| Topic | Data |
|-------|------|
| `("profile", "registered")` | `(address: Address, username: String)` |
| `("profile", "updated")` | `(address: Address)` |
| `("tip", "sent")` | `(from: Address, to: Address, amount: i128)` |
| `("tip", "withdrawn")` | `(address: Address, amount: i128, fee: i128)` |
| `("credit", "updated")` | `(address: Address, old_score: u32, new_score: u32)` |
| `("admin", "changed")` | `(old: Address, new: Address)` |
| `("fee", "updated")` | `(old_bps: u32, new_bps: u32)` |

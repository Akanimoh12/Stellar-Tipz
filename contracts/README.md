# Stellar Tipz — Smart Contracts

> Soroban smart contracts for the Stellar Tipz decentralized tipping platform.

## Structure

```
contracts/
├── Cargo.toml              # Workspace manifest
├── Makefile                 # Build/test shortcuts
└── tipz/                    # Main contract crate
    ├── Cargo.toml
    └── src/
        ├── lib.rs           # Contract entry point (public interface)
        ├── types.rs         # Data structures (Profile, Tip, etc.)
        ├── storage.rs       # Storage keys & helpers
        ├── errors.rs        # ContractError enum
        ├── admin.rs         # Initialization & admin ops
        ├── credit.rs        # Credit score algorithm
        ├── tips.rs          # Tipping & withdrawal logic
        ├── events.rs        # Event emission helpers
        ├── leaderboard.rs   # Leaderboard tracking
        └── test/            # Test modules
            ├── mod.rs
            ├── test_register.rs
            ├── test_tips.rs
            ├── test_withdraw.rs
            ├── test_credit.rs
            ├── test_leaderboard.rs
            ├── test_admin.rs
            └── test_events.rs
```

## Quick Start

```bash
# Build
cargo build

# Test
cargo test

# Format check
cargo fmt -- --check

# Lint
cargo clippy -- -D warnings

# Build optimized Wasm
cargo build --target wasm32-unknown-unknown --release
```

## Contract Overview

See [docs/CONTRACT_SPEC.md](../docs/CONTRACT_SPEC.md) for the full specification.

### Public Functions

| Function | Description |
|----------|-------------|
| `initialize` | Set admin, fee collector, and fee percentage |
| `register_profile` | Create a new creator profile |
| `update_profile` | Update profile information |
| `update_x_metrics` | Update X (Twitter) metrics (admin only) |
| `get_profile` | Fetch profile by address |
| `get_profile_by_username` | Fetch profile by username |
| `send_tip` | Send XLM tip to a creator |
| `withdraw_tips` | Withdraw accumulated tips |
| `calculate_credit_score` | Calculate credit score for a profile |
| `get_leaderboard` | Get top creators |
| `set_fee` | Update withdrawal fee (admin) |
| `set_fee_collector` | Update fee collector (admin) |
| `set_admin` | Transfer admin role (admin) |
| `get_tip_count` | Get total tips ever sent (never expires) |
| `get_stats` | Get global contract statistics |

## Tip History & Event-Based Indexing

Individual tip records are stored in **temporary storage** with a ~7-day TTL.

### Storage key TTL and rent strategy

| Tier | Keys | TTL strategy |
|---|---|---|
| `instance()` | Contract configuration, counters, and cached runtime state | Extended at the start of state-changing calls with the instance minimum/maximum TTL policy. |
| `persistent()` | Profiles, username mappings, subscriptions and subscription indexes, goals, and withdrawals | Extended on writes and relevant reads. Subscription records, indexes, and counters are bumped together so charge and cancel flows remain enumerable beyond the default ledger window. |
| `temporary()` | Individual tip records and bounded history entries | Written with `TIP_TTL_LEDGERS` (about seven days at five seconds per ledger); expired records are skipped while reading retained indexes. |

The long-lived persistent entries use the same target TTL as profiles. This keeps active user state available while allowing unused state to age out under Soroban rent rules.
After expiry the on-chain record is gone, but the **`TipSent` event** emitted
with every tip contains all fields needed to reconstruct the full history:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `u32` | Unique, monotonically increasing tip ID |
| `tipper` | `Address` | Sender address |
| `creator` | `Address` | Recipient creator address |
| `amount` | `i128` | Tip amount in stroops |
| `message` | `String` | Optional tip message (0-280 chars) |
| `timestamp` | `u64` | Ledger timestamp when the tip was sent |

The global `TipCount` counter lives in instance storage and **never expires**,
so `get_tip_count()` always returns the total number of tips ever sent.

To build a complete tip history, point an off-chain indexer (e.g.
[Mercury](https://mercurydata.app), SubQuery, or a custom Horizon event
watcher) at the `("tip", "sent")` contract events and persist them in your own
database.

## Contributing

Each module has TODO comments referencing specific GitHub issues. Pick an issue, implement the functionality, write tests, and submit a PR.

See [docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md) for the full contributor workflow.

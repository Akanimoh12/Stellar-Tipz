# Security Audit Checklist: Stellar Tipz Soroban Contract

This document outlines the security audit and hardening measures implemented for the Stellar Tipz smart contract.

## Known Attack Vectors & Mitigations

### 1. Reentrancy
**Description:** A malicious contract calls back into the Tipz contract before the first execution completes, potentially draining funds or creating inconsistent state.
**Mitigation:** 
- The Soroban protocol natively prevents reentrancy. Any cross-contract call that attempts to re-enter a contract currently in the call stack will be trapped and fail.
- All state modifications (like updating profile balances) occur before external calls (like token transfers).

### 2. Integer Overflow / Underflow
**Description:** Arithmetic operations exceed the bounds of `i128`, wrapping around and causing logical errors (e.g., negative balances becoming positive).
**Mitigation:**
- Rust's `checked_add` and `checked_sub` are used for critical accumulations (e.g., `storage::add_to_tips_volume`, `storage::add_to_fees`).
- The Soroban compilation profile is configured with `overflow-checks = true` for both debug and release profiles by default.
- Validation functions reject negative amounts (`amount <= 0`).

### 3. Access Control & Authorization
**Description:** Unauthorized users executing privileged functions (e.g., withdrawing someone else's tips or changing admin config).
**Mitigation:**
- `caller.require_auth()` is strictly used for all functions that act on behalf of a user (`send_tip`, `withdraw_tips`, `register_profile`, etc.).
- Admin-only functions (like `set_fee_bps` or `pause_contract`) properly invoke `admin.require_auth()`.
- Unregistered or deactivated profiles are prevented from sending or receiving tips via early checks.

### 4. Front-Running / Transaction Ordering
**Description:** Attackers reorder transactions in the mempool to profit (e.g., front-running a tip to alter the credit score before a leaderboard snapshot).
**Mitigation:**
- Stellar's consensus mechanism minimizes traditional front-running opportunities.
- Tips and withdrawals are strictly additive or subtractive, and operations do not rely on precise transaction ordering to be secure.

### 5. Denial of Service (DoS)
**Description:** Attackers send excessive data or trigger infinite loops to consume all available gas, rendering the contract unusable.
**Mitigation:**
- Gas limits are strictly enforced by the Soroban runtime.
- There are no unbounded loops over state (e.g., pagination is limited to `MAX_PAGE_LIMIT = 50`).
- Input lengths are bounded (e.g., usernames max 32 chars, bios max 280 chars) to prevent excessive storage or compute.

### 6. Storage Exhaustion
**Description:** Attackers create massive amounts of storage entries to bloat state and increase fees.
**Mitigation:**
- Temporary storage is used for `Tip` records, automatically expiring them after `TIP_TTL_LEDGERS`.
- A minimum tip amount (`MinTipAmount`) creates an economic cost for spamming tips.
- Profile registration requires authorization and costs gas.

### 7. State Consistency & Desync
**Description:** The contract state becomes inconsistent (e.g., sum of balances does not match total XLM held).
**Mitigation:**
- `UsernameToAddress` and `Profile` entries have their TTL bumped together (`bump_profile_ttl` and `bump_username_ttl`) to prevent desynchronization.
- Total tips received, total tips count, and balance are atomically updated during `send_tip`.
- Invariants are verified through the `test_security.rs` test suite.

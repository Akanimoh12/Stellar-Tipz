# Audit Preparation — Stellar-Tipz Soroban Contract

**Status:** Draft for external auditor review
**Prepared:** 2026-09-29
**Codebase revision:** `a61d1a0` (branch `docs/audit-prep-229`, base `fix/audit-095-088-078-042`)
**Target:** Stellar mainnet, planned Q1 2026
**Contract:** `contracts/tipz` (`tipz-contract`), `CONTRACT_VERSION = 3`, Soroban / Rust (`no_std`)

---

## 0. How to read this document

This document exists to make an external audit cheaper and more effective. It is written to be
**read before the code**, so that the auditor's time goes to the parts that need human judgement
rather than to rediscovering facts we already know.

**Section 6 is the one to read first if you read nothing else.** It lists eight defects we already
know about, four of which we believe are directly exploitable. They are not hidden. We would rather
you confirm and characterise them than spend a day finding them, and then spend the remaining time on
the things we have *not* thought of.

We have deliberately not fixed these before the audit. Fixing them first would have been cheaper for
us and worse for you: a fix without independent scrutiny tends to be narrower than the defect.

Everything here is stated as observed in the source at the revision above. Where we are unsure
whether something is a defect, we say so and explain why, rather than resolving the ambiguity in our
own favour.

### 0.1 Verification status — read this first

**The contract does not currently compile.** `DataKey::ReentrancyGuard` is declared twice in
`contracts/tipz/src/storage.rs` (lines 104 and 172), which is error `E0081: the name ... is defined
multiple times`. The base revision `a61d1a0` therefore cannot be built or tested as-is, and
`cargo test` cannot be run to produce live coverage numbers.

This build break was introduced by commit `b81da37` ("fix: add reentrancy guards, credit decay,
validation cleanup, and event schema versioning"). It is not a design issue and it does not affect
the validity of the analysis below, but it does mean:

- **No line-coverage percentage is claimed in this document.** Section 5 reports *test inventory*
  (what tests exist, what runs, what does not) derived by static analysis, not a measured
  `llvm-cov` report. We would rather give you an exact inventory than a coverage number that looks
  authoritative and was produced against a stale tree.
- **The auditor will need one of the following to run anything:**
  1. a branch where the duplicate enum variant is removed (a one-line change), or
  2. revision `487c694`, the last commit we believe compiles.

Separately, the test target has a second blocker: `Profile` gained a `last_active_at` field, and 21
`Profile { ... }` struct literals across the test tree do not set it. This is confined to `#[cfg(test)]`
code — the single production literal (`profile.rs:103`) does set it. So the WASM build needs only the
enum fix, while the test build needs the enum fix plus 21 literal updates.

We are aware that "the test suite does not run" is a poor advertisement at the moment. Section 5.2
explains the deeper problem, which is considerably worse than the build break.

---

## 1. Threat model

### 1.1 What the contract holds

The contract is a custodial tipping escrow. It holds real value in the Stellar Asset Contract (SAC)
for native XLM, and — if a multi-token allowlist is configured — in any SEP-41 tokens an admin has
whitelisted.

| Asset | Storage location | Value at risk | Notes |
|---|---|---|---|
| **Native XLM (SAC)** | Contract address balance | Full sum of all unpaid `Profile.balance` across all creators | Primary asset. Capped per tip at `MAX_TIP_AMOUNT = 1_000_000_000_000` stroops (100,000 XLM). |
| **Non-refundable refund fees** | Contract address balance | Accrued `non_refundable_fee` on processed refunds | Explicitly retained by the contract, not credited to any account (K-8). |
| **Fee-collector transit** | Transit only, between two SAC calls | `fee` per withdrawal | Held in the window between the `net` and `fee` transfers in `withdraw_tips`. Not persisted. |
| **Whitelisted SEP-41 tokens** | `ExtendedDataKey::TokenBalance(creator, token)` | Per-creator, per-token balances | Admin-gated allowlist. Balances are tracked in **contract-side storage**, not read from the token contract — see K-6. |
| **Profile metadata** | `DataKey::Profile` | Non-monetary | Usernames, display names, bios, X metrics, goal state, credit scores. |
| **Leaderboard and stats** | `DataKey::Leaderboard` | Non-monetary | Ranking integrity, with a reputational dimension. |
| **Admin audit trail** | `ExtendedDataKey::AdminAuditLog` | Non-monetary | Ring buffer, capacity 100. |

**The invariant that matters most:** the contract's XLM balance must be at least the sum of all
`Profile.balance` values, plus retained fees, at all times. Every withdrawal, refund, and emergency
withdrawal is an opportunity to break it. We have not proven it holds — see E-1 and E-6 in §5.4, and
K-3.

### 1.2 Actors

| Actor | Description | On-chain authority | Trust level |
|---|---|---|---|
| **Anonymous tipper** | Anyone with a funded Stellar account | `send_tip`, `send_tip_on_behalf`, `send_tip_token`, `request_refund`, `register_profile`, `create_subscription`, `set_goal`, `bump_ttl` | **Untrusted.** The primary adversary. |
| **Creator** | Registered profile holder | `withdraw_tips`, `emergency_withdraw_tips`, `update_profile`, `block_tipper`/`unblock_tipper`, `set_donation_page`, `set_min_tip`, `set_domain`, `deactivate_profile`/`reactivate_profile`, `deregister_profile`, `request_verification`, `approve_refund`/`reject_refund` | **Untrusted for code; trusted for their own funds.** A creator may attempt to drain *other* creators' funds or inflate their own rank. |
| **Pending admin** | Currently-innocent address that will become admin | May call `confirm_admin_change` once the 48h timelock elapses | **Untrusted during the timelock.** This is the attacker class the two-step admin flow exists to defend against. |
| **Admin (single-sig)** | `DataKey::Admin` | 22 privileged entrypoints (§3.3) | **Trusted, but a single key.** Compromise of this one address is total compromise of the contract. |
| **Multisig signer** | Member of the N-of-M signer set | `propose_action`, `approve_action`, `cancel_proposal` | **Trusted collectively.** Threshold must satisfy `0 < required_signatures <= signers.len()`. |
| **Fee collector** | Receives withdrawal fees | Passive recipient | Semi-trusted. Its address is admin-settable with no timelock (K-4). |
| **Keeper / croner** | Anyone | `execute_due_subscription`, `execute_subscriptions`, `process_pending_refunds`, `expire_refund`, `deliver_scheduled_tip`, `batch_update_x_metrics` | **Untrusted and permissionless — by design.** These functions move money on other users' behalf, so they are the highest-value reentrancy and DoS surface in the contract. |
| **Stellar network / SAC** | Host chain, SEP-41 token contract | Source of `client.transfer` reverts | Fully trusted. Out of scope. |
| **Off-chain backend / indexer** | Our servers | None directly; feeds X-metrics ingestion | **Not in this contract's trust boundary**, but a compromised backend submitting false follower counts would corrupt credit scores. See §1.4. |

### 1.3 Trust boundaries

```
        ┌──────────────────────────────────────────────────────────────┐
        │  UNTRUSTED: anonymous internet                                │
        │  tippers, creators, keepers/croners, pending admin           │
        └───────────────────────────┬──────────────────────────────────┘
                                    │  require_auth() on the CALLER's address only.
                                    │  require_auth() proves *possession* of a key.
                                    │  It grants NO role. See K-1 — this is the
                                    │  single most important boundary in the contract.
                                    ▼
   ═══════════════════ SOROBAN INVOCATION BOUNDARY ═══════════════════
        │  #[contractimpl] TipzContract — 122 public entrypoints
        ▼
        │  ┌──────────────────────────────────────────────────┐
        │  │ ROLE BOUNDARY: require_admin() (admin.rs:94)      │  ← 32 call sites
        │  │ "Is the caller the current admin?"                 │
        │  │ NOT applied at several entrypoints. See K-1, K-2.  │
        │  └───────────────────────┬──────────────────────────┘
                                ▼
   ═══════════════════ PRIVILEGED STATE BOUNDARY ═══════════════════
        │  admin.rs / multisig.rs / migrations.rs / multitoken.rs
        │  fee_bps, admin, fee_collector, token allowlist,
        │  rate limits, refund config, WASM upgrade
        └───────────────────────┬──────────────────────────────────┘
                                ▼
   ═══════════════════ EXTERNAL CALL BOUNDARY (SAC) ═══════════════════
        │  token::transfer_xlm → TokenClient::transfer
        │  The ONLY outbound call that leaves this contract.
        │  See K-3 — the reentrancy guard around it is decorative.
        ▼
              Stellar Asset Contract (SEP-41) → ledger
```

**Boundary notes that matter for review:**

1. **`require_auth()` is not a role check.** Soroban's `Address::require_auth()` asserts that the named
   address signed the transaction. It says nothing about whether that address is *entitled* to the
   operation. Several entrypoints perform only `require_auth()` on operations that clearly need
   privilege (K-1, K-2). When auditing, treat "has `require_auth`" and "has `require_admin`" as
   separate properties and check each independently.

2. **The custodial boundary.** Every value-bearing function crosses the SAC boundary via
   `token::transfer_xlm_with_token` (`token.rs:35`). That function performs a `balance()` check then a
   `transfer()` (`token.rs:52`). The balance check is redundant — the SAC would revert anyway — but the
   pattern is what the DoS analysis in §4.5 depends on.

3. **The upgrade boundary.** `env.deployer().update_current_contract_wasm(wasm_hash)` is reachable via
   two paths: `admin::execute_upgrade` (admin-gated) and `multisig::Action::Upgrade` (multisig-gated).
   Treat *any* path to an attacker-controlled WASM hash as a total-loss finding, and please confirm
   the multisig path is genuinely gated.

4. **The storage-availability boundary.** All state lives in the instance and persistent tiers under
   TTL. An instance TTL lapse does not destroy data, but it does reset `RuntimeConfig` to `None`, which
   makes every tipping path fail closed with `NotInitialized`. See §4.4 and K-5.

### 1.4 Out of scope

The following are **not** protected by this contract and are **not** audit findings. We list them
explicitly so you do not spend time on them:

- **Off-chain correctness.** The backend, indexer, and frontend. The contract trusts that a
  `batch_update_x_metrics` payload originated from a real X API response; it cannot verify this and
  does not try. A compromised backend submitting plausible-but-false follower counts will inflate
  credit scores. This is a systemic risk we accept and mitigate with key rotation and alerting, not a
  contract defect. **We flag it explicitly because it is a real economic attack that this contract
  cannot prevent.**
- **X (Twitter) account authenticity.** Same reasoning. `request_verification` / `approve_verification`
  record an attestation by a privileged party; the contract cannot check the underlying social account.
- **The Stellar protocol and the SAC.** Per `SECURITY.md:81`.
- **Informational findings with no practical exploit path.** Per `SECURITY.md:82`.
- **Social engineering of team members.** Per `SECURITY.md:84`.

> **A conflict in our own reporting policy that we ask you to override.**
> `SECURITY.md:83` excludes "known limitations in the README" from scope. There is no limitations
> section in `README.md`, so that exclusion is currently vacuous. `SECURITY.md:85` also excludes DoS
> costing more than USD 10,000 in XLM. **Please ignore both exclusions for this engagement.** Every
> integer-overflow panic in this contract costs a few stroops, not $10,000, and Section 6 documents
> issues we already know about — which is precisely the category those two clauses were written to
> exclude. This document exists because we disagree with how they would be applied here.

---

## 2. Architecture

### 2.1 Module map

22 production modules, ~10,900 lines. `ARCHITECTURE.md:158-168` documents only 9 of them. The
undocumented 13 — `goals`, `migrations`, `multisig`, `multitoken`, `profile`, `refund`, `stats`,
`streaks`, `subscription`, `token`, `validation`, `verification`, plus the inline `fees` — contain
most of the un-reviewed logic. **Do not scope the review from `ARCHITECTURE.md`.**

| Module | Lines | Role | Value-bearing |
|---|---:|---|---|
| `lib.rs` | 1233 | `#[contractimpl]` surface — 122 entrypoints | — |
| `storage.rs` | 2421 | All `DataKey` / `ExtendedDataKey` / `CacheKey` accessors, TTL management | — |
| `admin.rs` | 942 | Privileged config, pause, two-step admin transfer, upgrade, audit log | yes |
| `tips.rs` | 904 | `send_tip`, `withdraw_tips`, `emergency_withdraw_tips`, scheduled tips | yes |
| `events.rs` | 790 | All event emission and topic schemas | — |
| `profile.rs` | 690 | Registration, updates, deactivation, blocked tippers, cleanup | — |
| `types.rs` | 536 | Shared `#[contracttype]` structs and global limits | — |
| `leaderboard.rs` | 405 | Ranked sets per period, bounded at 50 | — |
| `refund.rs` | 403 | Refund request / approve / reject / process / expire | yes |
| `multisig.rs` | 363 | N-of-M proposals, epoch invalidation | yes (via `Upgrade`, `SetAdmin`) |
| `validation.rs` | 333 | Input validation, rate limiting | — |
| `multitoken.rs` | 315 | Token allowlist, `send_tip_token`, `withdraw_token` | yes |
| `fees.rs` | 270 | `calculate_fee` — the only fee arithmetic | — |
| `subscription.rs` | 261 | Recurring tips | yes (via `execute_due_subscription`) |
| `credit.rs` | 251 | Credit score composition | — |
| `verification.rs` | 171 | Verification requests, approval, revocation | — |
| `stats.rs` | 143 | 24h window statistics | — |
| `goals.rs` | 141 | Creator goals and progress | — |
| `migrations.rs` | 109 | Versioned storage migration harness | — |
| `errors.rs` | 83 | `ContractError` enum | — |
| `streaks.rs` | 60 | Supporter streak milestones | — |
| `token.rs` | 55 | SAC helpers — the only outbound-call wrapper | yes |

### 2.2 Storage tiers and TTL

Three key enums. `DataKey` holds scalar config and index keys; `ExtendedDataKey` holds the larger
feature structures; `CacheKey` holds write-amplification caches.

| Tier | Keys | TTL policy | Risk |
|---|---|---|---|
| Instance | `DataKey` (scalars and small values), `CacheKey::RuntimeConfig`, `CacheKey::SendTipState`, `CacheKey::LeaderboardSet` | `extend_instance_ttl` at the top of most state-changing paths; min 120,960 ledgers, max 535,680 | **Runtime config is instance-resident.** See §4.4. |
| Persistent | `DataKey::Profile`, `DataKey::Tip(u32)`, `DataKey::Subscription`, `DataKey::Streak`, subscription and token-balance keys | `PROFILE_TTL` 120,960–535,680 ledgers; `TIP_TTL_LEDGERS = 120_960`; `PERSISTENT_TTL_MAX_LEDGERS = 267_840` | Tip records expire. `Profile` and `UsernameToAddress` are bumped **together** via `bump_existing_profile_ttl` to avoid a desync that would strand a creator's funds (§4.3). |
| Temporary | none | — | Not used. |

`CacheKey` holds four caches: `RuntimeConfig` (read on every tip), `LeaderboardSet` (all periods in
one key), `CreatorPeriodVolumes(Address)`, `SendTipState`. **Treat these as accounting code, not as an
optimisation** — a cache-coherence bug here manifests as a wrong balance.

### 2.3 Data flow: a tip

```
tipper ──send_tip(amount, message, anonymous, encrypted)──▶
  1. extend_instance_ttl                                             storage.rs
  2. get_runtime_config ── None ⇒ NotInitialized (fails closed)      storage.rs:376
  3. config.paused ⇒ ContractPaused                                  storage.rs
  4. tipper.require_auth()                         ← possession only
  5. check_rate_limit_with_config(tipper, admin, rate_limit)         validation.rs:261
  6. get_profile_opt(creator) ── None ⇒ NotRegistered
  7. tipper == creator ⇒ CannotTipSelf
  8. is_profile_deactivated(creator) ⇒ ProfileDeactivated
  9. is_creator_blocked_tipper(creator, tipper) ⇒ TipperBlocked
 10. validate_tip_for_creator   (global min/max + creator floor)     validation.rs
 11. validate_message           (≤ 280 bytes)                       validation.rs
 12. set_reentrancy_guard(true)            ⚠ K-3
 13. SAC transfer tipper → contract          ← EXTERNAL CALL        token.rs:52
 14. set_reentrancy_guard(false)            ⚠ never read
 15. profile.balance             += amount   (checked_add)
 16. profile.total_tips_received += amount   (checked_add)
 17. profile.total_tips_count    += 1        (checked_add)
 18. streaks::record_tip_streak(tipper, creator)
 19. credit::calculate_credit_score_with_streak(profile, now)
 20. set_profile
 21. leaderboard::update_all_leaderboards_for_active(profile, amount)
 22. goals::update_goal_progress(creator, amount)
 23. bump_existing_profile_ttl + bump_username_ttl   (kept in lockstep)
 24. tip_state.tip_count += 1                       ⚠ plain +=, K-7
 25. tip_state.total_tips_volume += amount           (checked_add)
 26. 24h window: `now - stats_window_start`         ⚠ unchecked sub, K-7 27. stats::update_24h_stats, mark_creator_active
 28. store_tip → emit_tip_sent
```

Steps 15–17 and 25 use `checked_add` and return `OverflowError`. This is correct: a tip that cannot
be recorded should be rejected rather than silently capped.

Steps 18–23 use unchecked or saturating arithmetic **by deliberate choice**, because a long-running
creator should not have a tip rejected merely because their lifetime totals are large. This is a
genuine trade-off with a real downside, recorded as AR-2 in §6.10.

### 2.4 The four accounting paths

We ask auditors to treat these as the highest-priority area.

**A. XLM tip → withdraw (`tips.rs:205` → `tips.rs:433`)**
In: contract balance `+amount`, `profile.balance += amount`. Out: `withdraw_tips` computes
`(fee, net) = fees::calculate_fee(amount, fee_bps)`, transfers `net` and then `fee` as **two separate
SAC calls — two external-call windows** — and only then performs `profile.balance -= amount`
(tips.rs:468). Note the check-then-act ordering: `validate_withdrawal_amount` at tips.rs:442 bounds
`amount <= profile.balance` *before* any transfer, which is what makes the post-transfer subtraction
safe.

**B. Refund (`refund.rs:313`)**
Reduces `profile.balance`, `total_tips_received`, and `total_tips_count` with **`saturating_sub`**, then
transfers `refund_amount` to the tipper and retains `non_refundable_fee`. It does **not** decrement
`DataKey::TotalFeesCollected` and does **not** set the reentrancy guard (K-8).

**C. Multi-token tip → withdraw (`multitoken.rs:124` → `multitoken.rs:238`)**
Per-token balances live in `ExtendedDataKey::TokenBalance(creator, token)`. Critically, **the contract
tracks these balances itself rather than reading them from the token contract.** The invariant to check
is therefore internal consistency between `TokenBalance` and the real SEP-41 balance; any path that
moves tokens without updating the key is a finding.

**D. Emergency withdrawal (`tips.rs:493`)**
Fee-free, requires the contract to have been paused for `EMERGENCY_WITHDRAWAL_DELAY_SECS = 7 days`, and
deliberately **survives pause** (it is the only withdrawal path that skips `require_not_paused`). This is
the exit hatch for a stranded creator and the only path that bypasses fees entirely; it deserves
specific scrutiny on its gating.

---

## 3. Entrypoint inventory

122 public functions in `lib.rs`, grouped by privilege. **`auth`** = the entrypoint calls
`Address::require_auth()` on a caller-supplied address. **`admin`** = it calls `admin::require_admin`
directly, or is routed through multisig once multisig is enabled.

### 3.1 Read-only, no auth (~50)

`get_profile`, `get_profile_by_username`, `get_tip`, `get_recent_tips`, `get_creator_tip_count`,
`get_tip_count`, `get_tips_by_tipper`, `get_tipper_tip_count`, `is_tipper_blocked`,
`get_blocked_tipper_count`, `calculate_credit_score`, `get_credit_tier`, `get_credit_breakdown`,
`get_streak`, `get_leaderboard`, `get_leaderboard_rank`, `get_leaderboard_size`, `get_stats`,
`get_platform_stats`, `get_creator_stats`, `get_config`, `get_version`, `get_admin_change_proposal`,
`get_admin_change_history`, `get_admin_audit_history`, `get_admin_audit_count`,
`get_pending_proposals`, `get_proposal`, `get_multisig_config`, `get_accepted_tokens`,
`get_token_balances`, `get_donation_page`, `get_goal`, `get_archived_goals`, `get_subscriptions`,
`get_subscribers`, `get_refund_request`, `get_refund_config`, `get_min_tip_amount`,
`get_min_withdrawal_amount`, `get_creator_min_tip`, `get_rate_limit_config`, `is_paused`,
`get_paused_at`, `get_pending_fee_change`, `get_fee_change_delay_ledgers`,
`get_emergency_withdrawal_delay`, `get_migration_state`, `get_proposed_upgrade`,
`get_domain_reverify_interval`, `is_verification_expired`, `is_profile_inactive_eligible`.

Read-only functions can still be made to panic, revert expensively, or return unbounded data, and are
in scope. `get_recent_tips` and its siblings take a caller-controlled `limit`; please check them against
`MAX_PAGE_LIMIT = 50` (tips.rs:83) and confirm no read path can inflate a transaction's compute budget.
`get_recent_tips` also takes a caller-controlled `offset` — confirm there is no underflow path.

### 3.2 User-scoped, self-authorised (auth, no admin role)

`register_profile`, `update_profile`, `deregister_profile`, `deactivate_profile`,
`reactivate_profile`, `update_x_metrics`, `batch_update_x_metrics`, `batch_update_x_metrics_preview`,
`send_tip`, `send_tip_on_behalf`, `withdraw_tips`, `emergency_withdraw_tips`, `block_tipper`,
`unblock_tipper`, `set_donation_page`, `set_min_tip`, `set_domain`, `set_goal`, `cancel_goal`,
`request_verification`, `create_subscription`, `cancel_subscription`, `request_refund`,
`approve_refund`, `reject_refund`, `bump_ttl`, `schedule_tip`, `cancel_scheduled_tip`.

Two properties here deserve attention:

- **`send_tip_on_behalf` requires auth on both parties** (tips.rs:345-346: `sender.require_auth()` then
  `on_behalf_of.require_auth()`). This is correct; please confirm it survives any refactor.
- **`update_x_metrics` and `batch_update_x_metrics` are self-authorised, not admin-gated.** Any creator
  can set their own follower count, post count, and engagement average, bounded only by
  `MAX_X_FOLLOWERS = 500_000_000` (admin.rs:266) and `MAX_X_ENGAGEMENT_AVG = 1_000_000`
  (admin.rs:270). Credit score is 30% weighted to X metrics (`X_WEIGHT = 30`, credit.rs:59), so
  **self-reported metrics directly determine credit score and leaderboard position.** See K-9 and AR-4.
  We consider this a known trade-off, but it is a significant economic surface and we would value your
  opinion on what mitigation is possible within this trust model.

### 3.3 Privileged, admin-gated (32 `require_admin` call sites)

`set_fee` (delegates to `propose_fee_change`, timelocked), `propose_fee_change`, `apply_fee_change`,
`cancel_fee_change`, `set_fee_change_delay` (floored at `MIN_FEE_CHANGE_DELAY_LEDGERS = 24`),
`set_fee_collector`, `set_admin`, `propose_admin_change`, `confirm_admin_change`,
`cancel_admin_change`, `set_min_tip_amount`, `set_min_withdrawal_amount`, `set_rate_limit_config`,
`set_multisig_config`, `set_refund_config`, `add_accepted_token`, `remove_accepted_token`, `pause`,
`unpause`, `reset_leaderboard`, `propose_upgrade`, `execute_upgrade`, `cancel_upgrade`, `migrate`,
`verify_domain`, `set_domain_reverify_interval`, `cleanup_inactive_profile`,
`cleanup_inactive_profiles`.

Call-site distribution: `admin.rs` 22, `lib.rs` 2, `profile.rs` 4, `multitoken.rs` 2, `migrations.rs` 1,
`multisig.rs` 1, `refund.rs` 1 — 32 in total, excluding the definition itself. The site count exceeds
the function count because some functions call `require_admin` more than once.

**Do not assume this list is the set of protected functions.** K-1 and K-2 describe privileged
operations that are missing from it.

### 3.4 Permissionless keepers — no auth, several money-moving

| Function | Moves funds | Bound | Concern |
|---|---|---|---|
| `initialize` | configures admin + fee collector | once | **No auth at all.** K-2. |
| `execute_due_subscription` | yes | single | K-3, K-7 |
| `execute_subscriptions` | yes | caller `limit` | Confirm `limit` is bounded |
| `process_pending_refunds` | yes | `MAX_PENDING_REFUND_BATCH = 50` | K-3, K-8 |
| `process_pending_refunds_from` | yes | caller `start` | Confirm `start` cannot skip or double-process |
| `expire_refund` | no (state only) | — | Ordering race with `approve_refund` |
| `deliver_scheduled_tip` | no (escrowed earlier) | — | Confirm the escrow was actually taken first |
| `bump_profile_ttl` | no | — | Unauth'd TTL extension — is that acceptable? |

These are callable by anyone and several move money. They are the natural target for griefing and
front-running and deserve a dedicated pass. In particular, please confirm `deliver_scheduled_tip`
credits only from funds already escrowed and cannot be used to mint a balance.

### 3.5 Limits an auditor should re-derive rather than trust

| Constant | Value | Location |
|---|---|---|
| `MAX_PROFILES` | 10,000 | types.rs:6 |
| `MAX_TIP_AMOUNT` | 1e12 stroops (100,000 XLM) | tips.rs:150 |
| `MAX_TIP_COUNT` | `u32::MAX` | tips.rs:153 |
| `MAX_LEADERBOARD_SIZE` | 50 | leaderboard.rs:37 |
| `MAX_PAGE_LIMIT` | 50 | tips.rs:83 |
| Max fee | 1000 bps (10%) | admin.rs (`InvalidFee`) |
| Default min tip | 1,000,000 stroops (0.1 XLM) | admin.rs:148 |
| Default min withdrawal | 1,000,000 stroops | storage.rs:446 |
| `STORAGE_COST_EEILING` | 100,000,000 stroops (10 XLM) | types.rs:39 |
| `MAX_CREATOR_BLOCKED_TIPPERS` | 100 | types.rs:12 |
| `MAX_MESSAGE_LENGTH` | 280 | types.rs:9 |
| `MAX_REGISTRATIONS_PER_WINDOW` | 20 per 3600s | types.rs:33, 36 |
| `MAX_PENDING_REFUND_BATCH` | 50 | refund.rs:20 |
| `MAX_X_METRICS_BATCH_LEN` | 50 | admin.rs:207 |
| `ADMIN_AUDIT_LOG_CAPACITY` | 100 | storage.rs:621 |
| `CONTRACT_VERSION` | 3 | lib.rs:52 |

---

## 4. Design decisions and their risk

We document the reasoning behind decisions most likely to draw an auditor's attention, so a deliberate
trade-off can be recognised as one and not reported as a surprise.

### 4.1 `overflow-checks = true` in the release profile

`contracts/Cargo.toml` sets `overflow-checks = true`, `panic = "abort"`, `opt-level = "z"`, `lto = true`
for the release build that produces the audit-target WASM.

This is the right call — a silent wraparound in a balance field is far worse than a revert — but it means
**every unguarded `+`, `-`, `*` on `i128` in a reachable path is a DoS primitive**, and the resulting
panic is not a graceful `ContractError`; it is a host-level abort that consumes the full compute budget.

This is the most important mechanical fact about the contract, and it is why we ask you to check every
arithmetic site in `tips.rs`, `multitoken.rs`, `refund.rs`, `fees.rs`, `credit.rs`, and `stats.rs`
individually rather than reasoning about accumulator classes in the abstract. We have found several
sites we believe are unguarded (K-7) but we make **no claim of completeness**.
`docs/MUTATION_TESTING.md` records a prior pass at this, and `test_property.rs` was written specifically
to prove arithmetic totality over the full `i128` range — **but it is one of the orphaned files
(§5.2) and does not run.**

### 4.2 Fee arithmetic

`fees::calculate_fee` is the single fee implementation used by every withdrawal path. It is the
best-tested function in the codebase (18 inline tests) and is bounded by `checked_mul` / `checked_div`.
The properties `property_fee_plus_net_equals_amount` and `property_fee_total_over_full_i128` express
exactly the right invariants — **but they do not currently run.** Please re-derive the fee invariants
yourself (§5.4, E-2 and E-3) rather than relying on them.

**Documentation defect, flagged so you are not misled:** `ARCHITECTURE.md:163` states the credit
formula in floating-point notation, which Soroban does not support. The real implementation is
integer-only (`BASE_SCORE = 40`, `TIP_WEIGHT = 20`, `X_WEIGHT = 30`, `AGE_WEIGHT = 10`,
credit.rs:50-83). **The documented formula is wrong; the code is right.** We have not corrected the
doc in this PR in order to keep the diff scoped to the audit artifact, but treat the code as
authoritative and `ARCHITECTURE.md:163` as stale.

### 4.3 TTL lockstep and tip-record expiry

`Profile` and `UsernameToAddress` are separate persistent entries. If they expire independently, a
creator could be resolvable by username but not by address, or vice versa — which would strand
withdrawable funds. `bump_existing_profile_ttl` is called at every site that mutates a profile
specifically to keep them in lockstep, and `test_ttl_desync.rs` (11 tests, issue #233) targets this
directly. **That test file is orphaned**, so the invariant is enforced in code and unverified by any
executing assertion. This is a good example of an invariant that *looks* well-tested and is not.

`Tip(u32)` records carry `TIP_TTL_LEDGERS = 120_960` (about 14 days at 5-second ledgers). **Tips
expire.** The refund flow's default request window is 24h and response window 48h
(storage.rs:1573-1574), so the ordering is currently safe — but please check the interaction
explicitly, including what happens if `TIP_TTL_LEDGERS` is ever reduced below the refund windows.

### 4.4 Instance residency of runtime config

`CacheKey::RuntimeConfig` — admin, fee collector, fee bps, native token, paused flag, min tip, rate
limit config, domain interval — lives in the **instance** tier. `send_tip` reads it and fails closed
with `NotInitialized` if it is `None`.

So if the instance TTL lapses without being extended, creator funds are **not** lost (persistent data
survives), but **tipping, withdrawal, and registration all stop working** until someone bumps the TTL.
`extend_instance_ttl` is called at the top of most state-changing paths and `bump_ttl` is available, so
recovery is possible. We believe this is safe, but it is a liveness dependency on a non-obvious
mechanism, and we would welcome scrutiny of whether **any path can mutate config state without first
extending the instance TTL** — that would be a permanent, unrecoverable lockout.

### 4.5 Denial-of-service surface

The permissionless batch entrypoints are the DoS surface: `process_pending_refunds` (≤50),
`batch_update_x_metrics` (≤50), `execute_subscriptions` (caller-supplied `limit`),
`cleanup_inactive_profiles` (admin-supplied limit). Two structural questions:

1. Does any of these accept an **unbounded caller-supplied limit**, letting one transaction exhaust the
   compute budget and — in a permissionless keeper design — block every other keeper?
2. Does any write-heavy loop have a storage-footprint cost that grows **unboundedly** with registered
   profiles (bounded at 10,000) or cumulative tips (`MAX_TIP_COUNT = u32::MAX`; at roughly 50 bytes per
   tip, 4 billion tips is on the order of 200 GB)? Please consider cumulative state growth over the
   contract's intended lifetime, not just single-transaction cost.

`test_budget.rs` (7 tests, issue #487, targeting ≤50% of protocol limits) and `test_dos_protection.rs`
(13 tests) target exactly this. **Both are orphaned.**

### 4.6 Deliberate no-ops

`storage::get_creator_streak_bonus`, `add_creator_streak_bonus`, and `adjust_creator_streak_bonus`
(storage.rs:1170-1192) are **zero-cost stubs that always return 0 / do nothing**, kept so existing call
sites compile without change. `credit.rs` has a `STREAK_BONUS_SCORE` term (credit.rs:86) that therefore
always contributes 0.

> `README.md:72` advertises the credit score as including a "Streak bonus (uncapped)" component.
> **That component is documented to users but can never be non-zero on-chain.** This is a
> user-facing documentation-versus-implementation discrepancy, deferred per PR #745 pending a
> storage-schema migration. Recorded as AR-1 in §6.10.

We note that `test_mutation_coverage.rs` includes a mutant named
`credit_with_streak_adds_streak_score_to_total` whose expected value depends on the streak term always
being 0. If the stub is ever implemented, that test's expected value changes. That file is orphaned, so
nothing currently detects the interaction.

---

## 5. Test coverage report and invariant list

Implements issue #045. Part of this section is unflattering; we would rather you learn it from us.

### 5.1 Inventory

Counts are `#[test]` attribute occurrences obtained by static analysis of the source tree at `a61d1a0`.
**No line-coverage figure is given — see §0.1 (the build is broken).** Nothing below is a measured
`llvm-cov` result.

| Bucket | Files | Tests |
|---|---:|---:|
| `src/test/*.rs` present on disk | 48 | 555 |
| — of which **wired into the build** | **7** | **40** |
| — of which **orphaned (never compiled)** | **41** | **515** |
| Inline `#[cfg(test)] mod tests` in production files | 3 | 47 |
| (`fees.rs` 18, `storage.rs` 26, `leaderboard.rs` 3) | | |
| **Total tests that actually execute** | | **87** |
| **Tests written but never executed** | | **515 (92.8%)** |
| **Effective execution rate** | | **14.5%** |

### 5.2 The headline finding: 92.8% of the test suite is dead code

`contracts/tipz/src/test/mod.rs` is 9 lines long and declares **7 of 48** test files:

```rust
//! Test module for the Tipz contract.

mod test_admin_audit;
mod test_emergency_withdraw;
mod test_two_step_admin;
mod test_migrations;
mod test_init;
mod test_multisig;
mod test_multisig_admin_guard;
```

The other 41 files exist on disk but are not referenced by any `mod`, `#[path]`, or `include!`. They are
never compiled, never run, and never reported by coverage tooling. We verified this exhaustively: the
only `mod` / `#[path]` / `include!` references in `src/` are `lib.rs:38-39` (`#[cfg(test)] mod test;`),
and three inline `mod tests` blocks inside production files.

**Consequences you should not have to discover yourself:**

- **`proptest` never executes a single case.** `test_property.rs` (12 `proptest!` blocks, 15 property
  tests) and `test_fuzz.rs` (10 tests) are both orphaned. `proptest = "1.10.0"` is a declared
  dev-dependency. Zero property cases run in CI, despite `test_property.rs:7-8` documenting that the
  default 256 cases per block "satisfies the issue's 256+ iterations in CI requirement."
- **`test_security.rs` (4 cross-cutting invariant tests) is orphaned.** This makes the claim in
  `contracts/SECURITY.md §7` — "Invariants are verified through the `test_security.rs` test suite" —
  **currently false.** We are flagging our own documentation as inaccurate.
- **There is no reentrancy test.** No `test_reentrancy*.rs` exists, despite `contracts/SECURITY.md §1`
  asserting a checks-effects-interactions property, and despite commit `b81da37` being titled "fix: add
  reentrancy guards." No test accompanied that fix.
- **`test_snapshots.rs` and all 4 `insta` snapshots are orphaned.** `test_mutation_coverage.rs` (32
  tests) is orphaned, so `cargo mutants` in CI sees a far thinner suite than `docs/MUTATION_TESTING.md`
  documents — and the kill-rate gate is measuring coverage that is not running.
- **`ARCHITECTURE.md:40-48` and `contracts/README.md:33-41` each list 7 test files as the suite's
  contents — and all 7 of those named files are among the 41 orphans.** The documentation describes a
  suite that does not exist. This is why we have written §5 by hand rather than by tooling.

**Modules with zero executing test coverage — 14 of 22 (64%):**

`credit.rs`, `events.rs`, `goals.rs`, `leaderboard.rs`, `multitoken.rs`, `profile.rs`, `refund.rs`,
`stats.rs`, `storage.rs`, `streaks.rs`, `subscription.rs`, `tips.rs`, `validation.rs`,
`verification.rs`.

This list includes **every module that moves money** (`tips`, `multitoken`, `refund`, `subscription`)
and the largest module in the crate (`storage.rs`, 2421 lines / 96 KB). The only adequately covered
modules are `multisig` (20 executing tests) and `migrations` (3). `admin.rs` is partial — 20 executing
of 87 written.

**We consider this the most serious problem in this repository, more serious than any individual
finding in §6.** A 14.5% execution rate means the codebase has effectively no regression protection,
which means a remediation patch can introduce a new defect without any signal to detect it. It is the
first thing we intend to fix after this engagement, and we would like the auditor's help deciding the
priority order — in particular, whether to wire all 41 files first (fast, but a large untested surface
goes live at once) or to wire the money paths first and leave the rest orphaned (slower, lower risk).

### 5.3 Coverage tooling gaps

| Artifact | Status |
|---|---|
| `codecov.yml` | Present. `project` target 70%, `patch` target 80%. |
| `codecov.yml` → `if_not_found: success` | A **missing** coverage report does not fail CI. |
| `.github/workflows/coverage.yml` | `cargo llvm-cov --lcov`, uploads with `fail_ci_if_error: false`. Coverage upload failure never fails the build. No `--all-targets` or `--workspace`. |
| `tarpaulin.toml`, `.cargo/config` | Absent. |
| Makefile coverage target | Absent from both Makefiles. |
| Root `Makefile` `test` target | `cd contracts && cargo test 2>/dev/null \|\| echo "No contract tests found"` — **swallows all contract test failures.** |
| `[workspace.metadata.cargo-mutants]` | Present in `Cargo.toml`; excludes 7 files. CI restricts to `fees`/`credit`/`leaderboard`/`tips` via `--file`, so **`refund.rs` and `multisig.rs` are never mutation-tested.** |
| Rust version pinning | Pinned to `1.88.0` in `contract-ci.yml` but floating `stable` in `coverage.yml` and `mutation-testing.yml`. |

`if_not_found: success` combined with `fail_ci_if_error: false` means the coverage pipeline is
structurally incapable of failing. Combined with §5.2, any published coverage number describes a suite
roughly one-seventh the size of the one on disk.

### 5.4 Invariant list

This is the list we ask the auditor to attack. **E** = economic, **A** = access control,
**S** = state/liveness, **D** = determinism. We mark each with where it is enforced and whether any
*executing* test covers it.

| ID | Invariant | Enforced at | Executing test? |
|---|---|---|---|
| **E-1** | `contract_xlm_balance >= Σ profile.balance` for all creators, at all times, minus retained fees | by construction; nowhere asserted | **No** |
| **E-2** | `fee + net == amount` exactly, for every withdrawal | `fees::calculate_fee` | 18 inline, partial |
| **E-3** | `0 <= fee <= amount`, and `0 <= net <= amount` | `fees::calculate_fee` | 18 inline, partial |
| **E-4** | A creator can never withdraw more than accrued `profile.balance`, across *all four* withdrawal paths (normal, emergency, refund, token) | `validate_withdrawal_amount` (normal only) | **No** |
| **E-5** | `profile.balance` never goes negative under any sequence of operations | `checked_add` on credit, `saturating_sub` on refund | **No** |
| **E-6** | Every XLM leaving the contract is matched by a corresponding accounting decrement, and vice versa | fragmented | **No** — the central invariant, unasserted |
| **A-1** | Only the current admin may perform privileged operations | `admin::require_admin` at 33 sites | 20 executing, partial |
| **A-2** | Admin change requires propose → 48h timelock → confirm by the **new** admin | `admin.rs:560-632` | 5 executing |
| **A-3** | Multisig, when enabled, cannot be bypassed by any single-sig path | `is_multisig_enabled` guards | 20 executing |
| **A-4** | A multisig config change invalidates approvals collected under the prior epoch | `proposal.epoch != config.epoch` (multisig.rs:290) | **No** |
| **A-5** | No path exists to an attacker-controlled WASM hash | `execute_upgrade`, `Action::Upgrade` | **No** |
| **A-6** | `initialize` is callable exactly once, by an authorised party | `is_initialized` only — **no auth** | 5 executing (do not cover K-2) |
| **S-1** | `Profile` and `UsernameToAddress` expire together; neither strands a creator's funds | `bump_existing_profile_ttl` | **No** (11 tests orphaned) |
| **S-2** | Instance TTL lapse causes fail-closed, never fund loss or lockout | `get_runtime_config` → `NotInitialized` | **No** |
| **S-3** | No `i128` arithmetic path panics under `overflow-checks = true` | `checked_*` / `saturating_*` at most sites; **not all** | **No** (property tests orphaned) |
| **S-4** | Cumulative storage growth stays within protocol limits over the contract's lifetime | — | **No** |
| **S-5** | Pause blocks all value-moving paths except `emergency_withdraw_tips` after 7 days | `require_not_paused` at 20 sites | 3 executing |
| **D-1** | Leaderboard is strictly descending, length ≤ 50, ties broken by insertion order | `leaderboard::update_entries` | 3 inline only |
| **D-2** | Leaderboard order is independent of insertion order for equal amounts | binary search + sort | **No** (property test orphaned) |
| **D-3** | `credit_score` always in `[BASE_SCORE, MAX_SCORE]` = `[40, 100]`, and monotone non-decreasing in tip volume | `credit.rs` caps | **No** (property tests orphaned) |
| **D-4** | Same inputs → same outputs; no dependence on ledger state not pinned in the call | — | **No** |
| **D-5** | Every state change emits exactly one event with a stable topic schema | `events.rs` | **No** (`test_events.rs` orphaned) |
| **D-6** | Rate limiting is per-bucket: registration limits and tip limits do not share state | `DataKey::RateLimit(Address)` | **No** — **and currently violated, see K-8** |

**On the tests that were written for these invariants.** `test_property.rs` contains exactly the
right properties: `property_fee_plus_net_equals_amount` (E-2), `property_fee_total_over_full_i128`
(E-3, S-3), `property_credit_score_always_bounded` (D-3), `property_more_tips_never_decreases_score`
(D-3), `property_leaderboard_deterministic_regardless_of_insertion_order` (D-2),
`property_leaderboard_boundary_insertion_evicts_lowest` (D-1),
`property_volume_accumulation_total_over_full_i128` (S-3). **None of them run.** We are asking you to
treat this as an unverified area rather than a tested one, and to derive the properties independently.

One property we would flag as weak even if it ran: `property_leaderboard_all_equal_volumes_ordered_by_insertion`
(test_property.rs, issue #13) asserts against a locally-constructed `soroban_sdk::Vec` **without
calling any leaderboard code**. It tests Rust `Vec::push` ordering, not contract logic. We believe it is
vacuous and have not removed it.

---

## 6. Known issues and accepted risks

**This is the section that makes the audit worthwhile.** Everything below is a defect or risk we have
already identified ourselves. We have not fixed them, because a fix written before an audit is usually
narrower than the defect and nobody has checked it. We are asking you to confirm each one, characterise
its true severity, and — more importantly — find the ones we have not.

Severity below is **our own assessment**, and we have deliberately not softened it. `Critical` means we
believe value can be taken or the contract can be rendered unusable. We would rather disagree with you
about severity than have you assume we downplayed something.

### 6.1 K-1 — Verification approval and revocation have no role check

**Severity: Critical (access control). Unfixed. Not mitigated.**

`approve_verification` (lib.rs:767) and `revoke_verification` (lib.rs:777) call
`caller.require_auth()` and then dispatch straight into `verification::approve_verification`. The
underlying function in `verification.rs:82` **does not take a caller at all** and performs no role
check.

The precise defect is a **missing role check, not a missing auth check.** `require_auth()` only proves
the caller controls its own key; it confers no privilege. Compare with `admin::require_admin`
(admin.rs:94), which is applied at 32 privileged sites.

**Impact:** *any address on the network* can call `approve_verification` and grant a verified badge to
any creator, or call `revoke_verification` and strip a legitimately verified creator's badge. Since
verification is a trust signal shown to users, this is a full-fidelity impersonation primitive against
every creator on the platform. It costs a few stroops in fees.

**Why we believe it is live:** `verification.rs:82` has no `admin` parameter in its signature, so no
upstream check is even possible without a signature change. This cannot be a misreading.

**What we would like from the auditor:** confirm there is no indirect gate, and confirm whether
`verify_domain` (lib.rs:974, which *is* admin-gated at `verification.rs`) shares the same reachable
state. If you believe the badge has downstream economic weight — planned sponsorship, tiering, or fee
schedules — please say so, because that would raise this above Critical in our assessment.

### 6.2 K-2 — `initialize` is unauthenticated and front-runnable

**Severity: Critical (access control). Unfixed. Partially mitigated at deployment only.**

`initialize` (admin.rs:127) takes `admin`, `fee_collector`, `fee_bps`, and `native_token`. It accepts
**no `caller` parameter and never calls `require_auth`**. The only guard is
`storage::is_initialized` (admin.rs:136), which returns `AlreadyInitialized` on the second call.

**Impact:** between deployment and the legitimate `initialize` transaction landing, **anyone who
observes the deploy can win the race and become admin**, with control of the fee collector address and
the fee rate. From there: 100% of withdrawal fees, and the ability to upgrade the contract to arbitrary
WASM. There is no recovery path, because admin transfer is itself admin-gated and subject to a 48h
timelock the attacker controls.

**Why we did not consider this merely a deployment concern:** a first-transaction race on a public
network is trivially winnable by a mempool watcher, and our documented deploy procedure
(`docs/TESTNET_DEPLOY.md`) does not describe atomic deploy-and-initialise. We do not believe a
governance-level fix exists — the contract genuinely cannot authenticate its own deployer, because
`initialize` is invoked before any admin exists. **The correct fix is deployment procedure, not code:**
deploy and initialise atomically, or initialise in the same ledger via a pre-signed operation, or have
the deployer be a factory contract. We would like the auditor's view on whether a code-level mitigation
is possible, and specifically whether `env.deployer()` is a trustworthy anchor here.

### 6.3 K-3 — The reentrancy guard is decorative

**Severity: High. Unfixed. Not mitigated. No test exists.**

`storage::set_reentrancy_guard` is **written at 20 sites** — `admin.rs:151`, `multitoken.rs` (7 sites),
`tips.rs` (10 sites) — immediately before and after every external SAC transfer. The comment at
tips.rs:244 says "Set reentrancy guard before external token call."

The readers, `storage::is_reentrancy_guard_active` (storage.rs:799) and
`storage::with_reentrancy_guard_unlocked` (storage.rs:816), have **zero call sites anywhere in the
crate outside their own definitions.**

**Nothing ever reads the flag.** Setting it has no effect on control flow. The guard protects nothing.

**Why this is High and not Critical:** we believe the contract is *currently* not exploitable via
reentrancy, because Soroban's `TokenClient::transfer` to the Stellar Asset Contract has no callback path
back into this contract — this is stated at tips.rs:246 and we believe it is correct. The risk is that
**the code asserts a protection it does not have.** If a whitelisted SEP-41 token were ever malicious or
upgradeable, or if a future refactor adds a callback, there is no guard. There is also no test asserting
checks-effects-interactions ordering, and no `test_reentrancy*.rs` file exists at all.

**What we would like from the auditor:** confirm the "no callback path" reasoning for both the native
SAC and arbitrary whitelisted SEP-41 tokens; check whether the multi-token path (`send_tip_token`,
`withdraw_token`) can be reentered through a malicious token contract; and tell us whether deleting the
dead guard is the right remediation or whether a real guard should replace it.

### 6.4 K-4 — Multisig `SetAdmin` bypasses the two-step timelock

**Severity: High. Unfixed. Not mitigated.**

`multisig.rs:319` handles `Action::SetAdmin` by calling `storage::set_admin` directly:

```rust
Action::SetAdmin(new_admin) => {
    let old_admin = storage::get_admin(env);
    storage::set_admin(env, &new_admin);
    crate::events::emit_admin_changed(env, &old_admin, &new_admin);
}
```

The single-sig path deliberately routes through `propose_admin_change` / `confirm_admin_change` with a
48-hour `ADMIN_CHANGE_TIMELOCK_SECS` (admin.rs:210), and the *adjacent* branch in the same `match` does
route `Action::SetFee` through `propose_fee_change_inner` (multisig.rs:317). `SetAdmin` alone skips the
timelock.

**Impact:** the timelock exists so that a compromised admin key cannot be used to seize the contract
permanently, because the outgoing admin has 48 hours to notice and react. Via multisig, a threshold
coalition can rotate admin instantly with no warning window. The two admin-change paths have materially
different security properties, and the design intent (per the adjacent `SetFee` branch) was evidently
that both should be timelocked.

**What we would like from the auditor:** confirm this reading, and tell us whether the correct fix is to
route `SetAdmin` through `propose_admin_change`, or to remove `SetAdmin` from the multisig action set
entirely — we are genuinely unsure which is intended.

### 6.5 K-5 — The refund transfer path is unguarded and its fee accounting is incomplete

**Severity: High. Unfixed. Not mitigated. Module has zero executing tests.**

`process_refund_internal` (refund.rs:313) performs an external `token::transfer_xlm` at refund.rs:344
with **no `set_reentrancy_guard` call**, unlike every transfer site in `tips.rs` and `multitoken.rs`.
Even if K-3 is fixed, this path would remain unguarded.

Separately, at refund.rs:350 the function emits `emit_fee_collected` for a non-refundable fee but
**never updates `DataKey::TotalFeesCollected`**. The normal withdrawal path does update it
(`storage::add_to_fees`, tips.rs:477). So `TotalFeesCollected` and `get_stats` will under-report
lifetime fees by exactly the non-refundable portion of every processed refund.

**Impact:** a partial accounting inconsistency in a public stats field. Not directly fund-affecting, but
`get_stats` is presented to users as platform metrics, and an auditor or a downstream consumer relying
on it would draw wrong conclusions. The missing guard is the more serious half.

**Also note:** the creator's balance is reduced with `saturating_sub` (refund.rs:324-328) while the
normal path uses `checked_add`. If `profile.balance` were ever somehow *less* than `request.amount`, the
refund would transfer funds to the tipper **without** a matching balance reduction — a direct breach of
E-1 and E-5. We have not constructed a path that reaches this state, and we would like the auditor to
try.

### 6.6 K-6 — Token tips bypass the creator's blocklist and tip controls

**Severity: High. Unfixed. Not mitigated. Module has zero executing tests.**

`send_tip_token` (multitoken.rs:124) checks `is_token_accepted` (multitoken.rs:157) and token
deactivation (multitoken.rs:152), but **never checks the creator's blocked-tipper list**. The
`config.admin` comparison at multitoken.rs:142 is only a rate-limit exemption, not a blocklist check.

**Impact:** a creator who has blocked a tipper via `block_tipper` can still be tipped by that address
via the multi-token path, defeating an explicit user control. Additionally, the creator's custom minimum
tip (`set_min_tip`) and the global minimum need checking on this path — we have not confirmed whether
they are applied.

**What we would like from the auditor:** enumerate every control enforced on the XLM path (min tip,
creator min tip, max amount, blocklist, deactivation, self-tip, rate limit) and produce the same matrix
for the token path. Divergence between two parallel money paths is, in our experience, where the
remaining findings are.

### 6.7 K-7 — Unguarded arithmetic in the multi-token tip path

**Severity: High. Unfixed. Not mitigated. Module has zero executing tests.**

We found three arithmetic defects in `multitoken.rs` that are inconsistent with the overflow-safety work
described in the HEAD commit message and in `docs/MUTATION_TESTING.md`:

1. **multitoken.rs:186** — `profile.total_tips_count += 1`, immediately after a `saturating_add` on
   multitoken.rs:185. Plain `+=` on `u32`/`i128` under `overflow-checks = true` panics on overflow.
2. **multitoken.rs:204** — `tip_state.tip_count += 1`. Same class.
3. **multitoken.rs:211** — `now - tip_state.stats_window_start`, an **unchecked subtraction** that
   panics if the ledger timestamp is ever lower than the stored window start.

Item 3 is the more interesting one: ledger timestamps are protocol-monotonic in normal operation, so we
cannot construct a natural trigger, but the `tips.rs` equivalent at tips.rs:290 has the identical
unchecked pattern, and defensive coding here costs nothing.

**We are flagging these as High rather than Medium for a reason that has nothing to do with severity of
impact: `multitoken.rs` and `tips.rs` have ZERO executing tests, and the property tests written
specifically to prove arithmetic totality are orphaned (§5.2).** We have no evidence these are the only
such sites. We consider the *unverifiable* state of the arithmetic in the money paths to be the actual
risk, and we would like the auditor to do the systematic sweep we have not had the budget to do.

**Related, same file:** multitoken.rs:186 and 204 use non-saturating increments directly after
saturating operations in the same function, which suggests a partial or inconsistent fix rather than a
deliberate choice. We recommend the auditor treat the surrounding lines as suspect rather than isolated.

### 6.8 K-8 — Rate-limit state is shared between registration and tipping

**Severity: Medium. Unfixed. Not mitigated.**

`validation.rs:303-305` carries a comment stating the registration limiter "Uses a separate counter
from the general-purpose rate limiter." **It does not.** All three functions —
`check_rate_limit` (validation.rs:232), `check_rate_limit_with_config` (validation.rs:261), and
`validate_registration_rate_limit` (validation.rs:306) — read and write the **same**
`DataKey::RateLimit(Address)` key via `storage::get_rate_limit_status` (validation.rs:311) and
`storage::set_rate_limit_status` (validation.rs:331).

The documented intent and the implementation disagree, and a comment asserting a false invariant is
worse than no comment.

**Impact:** a user who tips `MAX_REGISTRATIONS_PER_WINDOW` times in an hour is locked out of
registration, and conversely the general limiter can consume the registration budget. This breaks
invariant D-6. The shared callers are `tips.rs:220`, `tips.rs:347`, `tips.rs:580`, and
`multitoken.rs:139` for tipping; `profile.rs:56` for registration.

**Severity is Medium, not High,** because the impact is availability-of-service for the affected user
rather than fund loss, and the `admin` address is exempted at multitoken.rs:142 and tips.rs. The reason
we are not letting it drop further: the fix requires either a new `DataKey` variant (a storage-schema
migration, touching K-2-adjacent upgrade risk) or a key-namespace change, and we would like the auditor
to advise on which is safer before we touch storage keys ahead of a mainnet launch.

### 6.9 K-9 — Self-reported X metrics determine credit score and leaderboard position

**Severity: Medium (accepted economic risk, but flagged prominently).**

Any creator can set their own follower count, post count, and engagement average via `update_x_metrics`
(auth-gated on their *own* address, not admin-gated), bounded by `MAX_X_FOLLOWERS = 500_000_000`.
X metrics carry `X_WEIGHT = 30` of the 100-point credit score (credit.rs:59), which feeds the
leaderboard.

**Impact:** a creator can fabricate a maximum credit score and a top leaderboard position at zero cost,
undermining the leaderboard as a trust signal.

**We are not treating this as a bug** — it is a deliberate consequence of not wanting an oracle
dependency. But we are flagging it as the largest *economic* attack surface that is not a code defect,
and we would value the auditor's opinion on whether any mitigation is possible without an external
oracle: for example, rate-limiting X metric updates, requiring a cooldown, or anchoring scores to
on-chain tip volume rather than self-reported data.

### 6.10 K-10 — Accepted risks (AR-1 … AR-9)

These are risks we have consciously accepted. We list them so the auditor can confirm the acceptance was
reasoned rather than accidental, and can disagree with the severity.

| ID | Accepted risk | Rationale | Auditor's view sought |
|---|---|---|---|
| **AR-1** | Streak bonus is always 0 | `storage.rs:1170-1192` stubs, deferred per PR #745 pending a storage-schema migration. Avoids growing the `Profile` footprint. **But `README.md:72` advertises it as a live credit component.** | Is the footprint saving worth shipping a documented feature that cannot work? Should we remove it from the README before mainnet? |
| **AR-2** | `saturating_add` silently caps lifetime totals at `i128::MAX` | A long-running creator should not have tips rejected because their lifetime total is enormous. `docs/MUTATION_TESTING.md` states this deliberately. | Is silent saturation at the ceiling acceptable, or should it revert once above a high watermark? |
| **AR-3** | Integer truncation in the credit score | `docs/MUTATION_TESTING.md` documents that small follower counts truncate to 0 after `× 30 / 100`. "Inherent to integer rounding, by design." | Confirm no truncation can produce a score outside `[40, 100]` or a tier inversion. |
| **AR-4** | Self-reported X metrics | See K-9. Avoids an oracle dependency. | See K-9. |
| **AR-5** | Single-sig admin as the base trust model | Multisig is opt-in via `set_multisig_config`. Before it is enabled, one key controls everything. | Should multisig be mandatory before mainnet rather than opt-in? We lean yes and would like support. |
| **AR-6** | Tips expire after `TIP_TTL_LEDGERS` | ~14 days. Space savings; currently longer than the refund windows. | Confirm safe, and note the coupling if the TTL is ever reduced. |
| **AR-7** | Leaderboard capped at 50 with binary-search insert | Bounded compute. Three surviving mutants are documented as semantically equivalent. | **One of those equivalence arguments is only valid while `MAX_LEADERBOARD_SIZE == 50`** (`docs/MUTATION_TESTING.md`, Mutant B). If that constant changes, the argument breaks. Please check the other two for similar hidden coupling. |
| **AR-8** | No test coverage gate that can fail | `if_not_found: success` + `fail_ci_if_error: false`. | Given §5.2, this compounds badly. We plan to make it fail; is there a downside? |
| **AR-9** | A binary-flagged `validation_clean.rs` was deleted in `b81da37` and removed from `exclude_globs` | It was an 11,321-byte `.rs` file that git flagged as `Bin`, excluded from linting. We do not know what it contained. | We are asking the team. If it was a divergent copy of `validation.rs`, there may be logic in it that was never reviewed. Worth a look at commit `b81da37`. |

### 6.11 Documentation we know is inaccurate

We are listing these so the auditor does not spend time reconciling docs against code, and so we can fix
them after the engagement. None of these are code defects.

| Location | Problem |
|---|---|
| `ARCHITECTURE.md:158-168` | Documents 9 of 22 modules. An auditor scoping from this would miss 13 modules including every money path. |
| `ARCHITECTURE.md:40-48` | Lists 7 test files; **all 7 are orphaned** (§5.2). |
| `ARCHITECTURE.md:163` | Credit formula given in floating-point notation; Soroban has no floating point. Code is correct, doc is wrong. |
| `contracts/README.md:33-41` | Same test-list problem as above. |
| `contracts/README.md:102` | States "Each module has TODO comments referencing specific GitHub issues." **There are zero TODOs, FIXMEs, or HACKs in the contract source.** We verified this. |
| `contracts/SECURITY.md §7` | Claims invariants are verified by `test_security.rs`. That file is orphaned; the claim is false. |
| `contracts/SECURITY.md §1` | Claims all state modifications precede external calls. **The reentrancy guard that would enforce this is decorative (K-3), and no test verifies the ordering.** |
| `SECURITY.md:35-40` | PGP key is a placeholder (`Key ID: 0xEXAMPLE`). The secure reporting channel is not yet operational. |
| `SECURITY.md:83` | Excludes "known limitations in the README"; the README has no limitations section. The exclusion is vacuous. |
| `SECURITY.md:85` | $10,000-XLM DoS floor would exclude the entire integer-overflow-panic class (K-7). See §1.4. |
| `README.md:72` | Streak bonus advertised but permanently 0 (AR-1). |
| `README.md:166-178` | Lists multi-token and subscriptions as **not yet delivered** for Q1 2026, though `multitoken.rs` and `subscription.rs` are implemented and reachable. The roadmap understates the live attack surface. |
| `README.md:396` | "Third-party audit post-MVP" — no audit has been performed. `SECURITY.md` Hall of Fame is empty. |
| `CHANGELOG.md` | Effectively empty; no released versions. Maturity indicator worth noting. |
| `contracts/Cargo.toml` | `version = "0.1.0"`. No git tags exist, so no deployed contract can be tied to a version. |

---

## 7. Audit scope

This section is the engagement contract. If it disagrees with anything above, this section governs.

### 7.1 In scope

**Primary target:** the `tipz-contract` crate at `contracts/tipz`, all 22 modules, at the revision named
at the top of this document. The auditor is asked to review the **source as it stands**, including the
known defects in §6, which are disclosed rather than fixed.

The contract is a custodial escrow. Findings are graded against loss of user funds, permanent
unavailability, or unauthorised privilege. In rough priority order:

| Priority | Area | Modules | Why |
|---|---|---|---|
| **1** | Escrow accounting and fund conservation | `tips.rs`, `refund.rs`, `multitoken.rs`, `token.rs`, `fees.rs`, `stats.rs`, `storage.rs` | The contract holds real value. E-1 and E-6 are unasserted (§5.4). K-5 and K-7 live here. |
| **2** | Access control and privilege boundaries | `admin.rs`, `multisig.rs`, `verification.rs`, `migrations.rs`, `lib.rs` | 122 entrypoints, 33 admin gates, and at least two missing gates (K-1, K-4). |
| **3** | Arithmetic totality under `overflow-checks = true` | all of the above, plus `credit.rs` | Every unguarded `i128` op is a DoS primitive (§4.1). We found some (K-7); completeness is unknown. |
| **4** | Upgrade and deployment safety | `admin.rs`, `migrations.rs`, `multisig.rs` | Arbitrary-WASM paths (A-5) and the `initialize` race (K-2) are total-loss scenarios. |
| **5** | Reentrancy and cross-contract interaction | `tips.rs`, `multitoken.rs`, `refund.rs`, `token.rs` | The guard is decorative (K-3). Safety currently rests on the SAC having no callback path — please verify that independently, including for whitelisted SEP-41 tokens. |
| **6** | Permissionless keeper paths | `refund.rs`, `subscription.rs`, `tips.rs` | Anyone can call them and several move money (§3.4). Front-running and griefing surface. |
| **7** | Denial of service and compute/storage budget | `admin.rs` batch paths, `profile.rs`, `storage.rs` | §4.5. Unbounded loops would be a liveness finding. |
| **8** | Determinism, leaderboard and credit-score integrity | `leaderboard.rs`, `credit.rs`, `streaks.rs` | Non-monetary but user-facing. D-1 through D-4. |
| **9** | Event schema and indexer compatibility | `events.rs` | Off-chain consumers depend on topics. Breaking changes are a real cost even when not a vulnerability. |
| **10** | TTL and state-expiry correctness | `storage.rs` | S-1, S-2, S-6. Silent fund stranding is high-impact and hard to detect post-hoc. |

### 7.2 Explicitly out of scope

- The **backend**, **indexer**, and **frontend** (`backend/`, `frontend-scaffold/`). Off-chain
  correctness is acknowledged as a systemic risk in §1.4 but is not part of this engagement.
- The **Stellar protocol and the Stellar Asset Contract**. Per `SECURITY.md:81`.
- **Gas, throughput, and economic-parameter tuning** — fee levels, credit weights, leaderboard caps —
  except where a parameter creates a security defect.
- **Cryptographic or novel-algorithm design.** The contract uses no novel cryptography.
- **Dependency and supply-chain review** beyond what `cargo deny` / `cargo audit` already cover. The
  auditor may flag a concern but it is not a deliverable.

### 7.3 What we are asking the auditor to confirm

These are the questions we could not answer ourselves, ordered by how much they matter to us:

1. **K-1 and K-2** — are these exploitable as we describe, and is the severity right?
2. **K-3** — is the contract genuinely safe from reentrancy today because the SAC has no callback path,
   and does that hold for arbitrary whitelisted SEP-41 tokens?
3. **K-7 completeness** — we found three unguarded arithmetic sites. How many more are there across
   `tips.rs`, `multitoken.rs`, `refund.rs`, `stats.rs`, and `credit.rs`?
4. **K-6** — which creator controls enforced on the XLM path are missing from the multi-token path?
5. **E-1 and E-6** — is there any reachable state where the contract's XLM balance is less than the sum
   of `profile.balance`?
6. **K-5** — can `saturating_sub` in the refund path be reached with `profile.balance < request.amount`?
7. **K-4** — for `Action::SetAdmin`, is routing through `propose_admin_change` correct, or should
   `SetAdmin` be removed from the multisig action set?
8. **A-5** — is there any path to an attacker-controlled WASM hash we have not found?
9. **AR-5** — should multisig be mandatory before mainnet rather than opt-in?
10. **Scope of §5.2** — would you wire all 41 orphaned test files, or the money paths first?

### 7.4 Severity scale we propose

So that severity grading is comparable across reports. Please use this scale, or tell us if you prefer
another and we will re-map ours.

| Severity | Meaning | Examples |
|---|---|---|
| **Critical** | Direct loss of funds, or permanent contract compromise. Exploitable by an unprivileged external party. | K-1, K-2 |
| **High** | Loss of funds under realistic preconditions, permanent denial of service, or bypass of a security control the design relies on. | K-3, K-4, K-5, K-6, K-7 |
| **Medium** | Service degradation, economic manipulation without direct fund loss, or a security control that is weaker than documented. | K-8, K-9 |
| **Low** | Defence in depth, minor information disclosure, or a documentation defect with no code impact. | items in §6.11 |
| **Informational** | No practical exploit path. | — |

### 7.5 Deliverables we are asking for

1. A findings report using the scale in §7.4, with a file:line reference and a reproduction or a proof
   sketch for every Critical and High.
2. Explicit confirmation or refutation of each of K-1 through K-10.
3. Answers to the ten questions in §7.3.
4. A judgement on whether the contract is fit for mainnet at Q1 2026, and if not, what the blocking
   issues are as opposed to the advisable ones.
5. A recommended order for remediation, given that the test suite does not currently run (§5.2) and so
   patches will not be automatically verified.

### 7.6 How to build and test

```bash
# From contracts/
cargo check                          # currently fails: E0081, storage.rs:104 and :172
cargo test                           # additionally fails: 21 Profile literals missing last_active_at
cargo clippy -- -D warnings
cargo fmt -- --check
soroban contract build
```

The one-line prerequisite for any of this to run is removing the duplicate `DataKey::ReentrancyGuard`
variant at `storage.rs:172`. We are deliberately not making that change in this PR so that the audited
revision matches the document exactly, but we will apply it on request.

Coverage tooling: `cargo llvm-cov --lcov --output-path lcov.info` from `contracts/`. Mutation testing:
`cargo mutants --package tipz-contract --file fees.rs --file credit.rs --file leaderboard.rs
--file tips.rs --timeout 120 -- --all-targets`, gated at a 70% kill rate — but see §5.2 for why that
gate is measuring less than it appears to.

---

## 8. Document status and what happens next

This document is a **draft for review**, not a finished audit-prep artifact. It is complete against the
five acceptance criteria of the issue:

| Criterion | Section |
|---|---|
| Threat model: assets, actors, trust boundaries | §1 |
| Architecture: entrypoints and invariants | §2, §3, §5.4 |
| Known issues and accepted risks, documented honestly | §6 |
| Test coverage report and invariant list (issue #045) | §5 |
| Scope document for auditors | §7 |

**Known limitations of this document, stated plainly:**

- **No test was executed.** The build is broken (§0.1) and this document is entirely static analysis.
  Every claim about test counts is an inventory claim, not an observation of a green run. If any of our
  counts are wrong, they are wrong by static-analysis error, not by us having run something and
  misread it.
- **We have not audited ourselves.** §6 is what we found while writing the document, not the result of
  a systematic review. We make no claim that K-1 through K-10 is a complete list, and the whole point
  of engaging an auditor is to get the list we did not find.
- **K-3 severity is conditional** on a claim about Soroban's execution model that we have not
  independently verified. If it is wrong, K-3 becomes Critical.
- **The `Profile` literal count (21) is from a mechanical check** and may be off by a small number.

**Proposed sequence after the audit:**

1. Fix the build break (one line) so the suite can run at all.
2. Wire the orphaned test files, money paths first (§5.2).
3. Make the coverage gate capable of failing (AR-8).
4. Remediate Critical and High findings from the audit report, in the order the auditor recommends.
5. Fix the documentation defects in §6.11, so the next reader is not misled the way we were.
6. Deploy to testnet with the K-2 mitigation in place, and re-audit if the storage schema changes
   materially.
7. Tag a release. There is currently no way to tie a deployed contract to a source revision (§6.11),
   which makes any post-deployment incident harder to reason about than it needs to be.

**Contacts.** Security reporting per `SECURITY.md`, though note that the PGP key there is a placeholder
and the secure channel is not yet operational (§6.11). We will establish an encrypted channel on
request.

---

*Prepared as part of the production-readiness audit, issue 229. Source revision `a61d1a0`.*
*Every line reference in this document was verified against that revision on 2026-09-29.*
*If a line reference does not match what you find, tell us — that is a defect in this document and we
want to fix it.*



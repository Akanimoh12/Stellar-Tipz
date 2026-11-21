# ADR-008: Non-custodial signing for scheduled on-chain actions

- Status: Accepted
- Issues: #059 (subscription charging), #1211 (creator payout scheduling / auto-withdraw)
- Related: #1216 (discovery), #1214 (OG images), #1215 (platform stats)

## Context

Several backend features must cause an on-chain state change **on behalf of a user**
without that user being online to sign:

- **#059 Subscription charging** — periodically move a tipper's funds to a creator.
- **#1211 Scheduled payouts** — periodically withdraw a creator's accrued balance to
  their own wallet once a threshold / cadence is met.

The hard constraint (shared by #059 and #1211) is: **the platform must never hold a
creator's (or tipper's) private key.** "Server custody" of user keys is unacceptable
for a tipping platform — a single leak would let an attacker drain arbitrary accounts.

A second, practical constraint: the backend already runs a jobs process that is the
natural place to *trigger* these actions, but it must do so in a way that is auditable,
authorised, and safe by default.

## Decision

Use a **dedicated platform "keeper" account** to sign the triggering transaction, but
make the keeper **authorisation-only**: it can invoke a contract entrypoint *only when
the affected user has previously created an on-chain authorisation record*. The keeper
never holds or moves user funds directly.

| Feature | Authorisation record the user creates | Contract entrypoint the keeper triggers |
| ------- | ------------------------------------- | -------------------------------------- |
| #059 Subscriptions | a `Subscription` row (created when the tipper subscribes) | `execute_due_subscription(subscriber, creator)` |
| #1211 Scheduled payouts | `authorize_scheduled_withdrawal(enabled=true)` flag on the creator's profile | `execute_scheduled_withdrawal(keeper, creator, amount)` |

In both cases:

1. The contract function **requires the keeper's auth** (`keeper.require_auth()`), which
   proves the *server* triggered the call and lets us attribute/audit it.
2. The contract function **checks the user's opt-in record** before moving any funds.
   For #1211, if the creator has not set `authorize_scheduled_withdrawal`, the call
   reverts with `NotAuthorized`.
3. Funds only ever move the *user's own* balance to the *user's own* destination
   (tips go to the creator; withdrawals go to the creator's wallet). The keeper cannot
   redirect funds anywhere else — the destination is derived from the creator address,
   not from keeper input beyond the authorised amount.

### Backend responsibilities (#1211)

- `PAYOUT_KEEPER_SECRET_KEY` holds **only** the keeper keypair. If it is unset, the
  payout job fails the attempt with a clear error rather than touching anything.
- The job (`payout.worker.ts`) selects eligible schedules (enabled, not paused,
  `nextRunAt` due, balance ≥ threshold), computes the withdrawable balance, and calls
  `submitScheduledWithdrawal`, which builds and signs
  `execute_scheduled_withdrawal` with the keeper.
- Failures are retried with **exponential backoff** (`nextRunAt = now + base·2^(n-1)`)
  and, after `PAYOUT_MAX_ATTEMPTS` consecutive failures, the schedule is **paused** and
  the creator is **notified** (`payout_failed` notification).
- Creators **opt out** at any time by setting `enabled: false` on their
  `PayoutSchedule`; opting back in clears the failure counters.

## Rationale

- **No server custody of user keys.** The keeper key is a limited, revocable,
  platform-owned account. Compromise of the keeper lets an attacker *trigger
  pre-authorised* payouts/subscriptions — it does **not** grant control of user wallets
  or the ability to move funds to arbitrary addresses.
- **Authorisation is on-chain and user-initiated.** The thing that grants permission is
  a record the user themselves created (a subscription, or an explicit
  `authorize_scheduled_withdrawal` call). This is the exact model already proven by #059,
  so #1211 "shares the identical signing solution" as required.
- **Fails safe.** Missing keeper key, network errors, and rejected transactions are
  treated as retriable failures, never as silent successes; repeated failure pauses and
  notifies rather than hammering the network.

## Consequences

- The contract must expose `execute_scheduled_withdrawal(keeper, creator, amount)` and
  `authorize_scheduled_withdrawal(enabled)` (the backend already integrates with this
  entrypoint via `submitScheduledWithdrawal`).
- Operational burden: the keeper key must be managed like any other secret
  (restricted IAM, rotation, separated from general app secrets). Because its blast
  radius is bounded to pre-authorised actions, the risk is materially lower than holding
  user keys.
- Auditability: every keeper-signed call is a normal Stellar transaction attributable
  to the keeper account, giving a clear on-chain trail of scheduled actions.

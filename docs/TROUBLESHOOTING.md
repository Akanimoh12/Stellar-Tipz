# Troubleshooting Guide

This guide maps every known error scenario — including all contract error codes — to a plain-English description, its likely cause, and the steps needed to resolve it.

---

## Table of Contents

1. [Wallet Errors](#wallet-errors)
   - [Wallet Not Found / Extension Not Installed](#wallet-not-found--extension-not-installed)
   - [Wallet Not Connected](#wallet-not-connected)
   - [User Rejected Connection](#user-rejected-connection)
   - [Insufficient XLM Balance](#insufficient-xlm-balance)
   - [Network Mismatch](#network-mismatch)
2. [Contract Error Codes](#contract-error-codes)
   - [1 — NotInitialized](#1--notinitialized)
   - [2 — AlreadyInitialized](#2--alreadyinitialized)
   - [3 — NotAuthorized](#3--notauthorized)
   - [4 — AdminChangeAlreadyPending](#4--adminchangealreadypending)
   - [5 — AdminChangeTimelockNotMet](#5--adminchangetimelocknotmet)
   - [6 — NoPendingAdmin](#6--nopendingadmin)
   - [7 — ContractPaused](#7--contractpaused)
   - [8 — NotRegistered](#8--notregistered)
   - [9 — AlreadyRegistered](#9--alreadyregistered)
   - [10 — UsernameTaken](#10--usernametaken)
   - [11 — InvalidUsername](#11--invalidusername)
   - [12 — InvalidDisplayName](#12--invaliddisplayname)
   - [13 — InvalidAmount](#13--invalidamount)
   - [14 — InsufficientBalance](#14--insufficientbalance)
   - [15 — BalanceNotZero](#15--balancenotzero)
   - [16 — OverflowError](#16--overflowerror)
   - [17 — NotFound](#17--notfound)
   - [18 — AlreadyDeactivated](#18--alreadydeactivated)
   - [19 — ProfileDeactivated](#19--profiledeactivated)
   - [20 — ProfileNotDeactivated](#20--profilenotdeactivated)
   - [21 — MessageTooLong](#21--messagetoolong)
   - [22 — InvalidImageUrl](#22--invalidimageurl)
   - [23 — BatchTooLarge](#23--batchtoolarge)
   - [24 — InvalidFee](#24--invalidfee)
   - [25 — CannotTipSelf](#25--canottipself)
   - [26 — NotVerified](#26--notverified)
   - [27 — AlreadyVerified](#27--alreadyverified)
   - [28 — Unauthorized](#28--unauthorized)
   - [29 — RateLimitExceeded](#29--ratelimitexceeded)
   - [30 — InvalidXHandle](#30--invalidxhandle)
   - [31 — TipBelowMinimum](#31--tipbelowminimum)
   - [32 — ProfileNotActive](#32--profilenotactive)
   - [33 — InvalidMessage](#33--invalidmessage)
   - [34 — BelowCreatorMinimum](#34--belowcreatorminimum)
   - [35 — InvalidDomain](#35--invaliddomain)
   - [36 — InvalidInput](#36--invalidinput)
   - [37 — TokenNotAccepted](#37--tokennotaccepted)
   - [38 — RefundWindowExpired](#38--refundwindowexpired)
   - [39 — RefundAlreadyRequested](#39--refundalreadyrequested)
   - [40 — RefundAlreadyProcessed](#40--refundalreadyprocessed)
   - [41 — NoRefundRequest](#41--norefundrequest)
   - [42 — NotTipper](#42--nottipper)
   - [43 — NotCreator](#43--notcreator)
3. [Network and RPC Errors](#network-and-rpc-errors)
   - [Contract Call Simulation Failed](#contract-call-simulation-failed)
   - [Transaction Submission Failed or Timed Out](#transaction-submission-failed-or-timed-out)
   - [RPC Connection Errors](#rpc-connection-errors)

---

## Wallet Errors

### Wallet Not Found / Extension Not Installed

**What it means**

The application cannot detect `window.freighter`, which is injected by the Freighter browser extension. Without it the app cannot sign or submit transactions.

**Likely cause**

The Freighter extension is not installed in the user's browser, or the user is on an unsupported browser (e.g. Safari on iOS without extension support).

**Resolution**

1. Install the Freighter extension from [freighter.app](https://www.freighter.app/).
2. Refresh the page after installation.
3. If Freighter is already installed, disable and re-enable the extension from the browser's extensions page, then reload.

---

### Wallet Not Connected

**What it means**

The Freighter extension is present (`window.freighter` exists) but the user has not yet granted the current site permission to read their public key.

**Likely cause**

The user navigated to the app for the first time, cleared their browser data, or revoked site permissions inside Freighter.

**Resolution**

1. Click the **Connect Wallet** button on the page.
2. Approve the connection request in the Freighter popup that appears.
3. If the popup does not appear, open Freighter manually, go to **Settings → Connected Sites**, and ensure `tipz.app` (or `localhost:3000` for local dev) is listed.

---

### User Rejected Connection

**What it means**

The user clicked **Reject** or closed the Freighter permission popup without approving. The app receives a rejection error from the extension.

**Likely cause**

The user dismissed the popup accidentally, or was concerned about which site was requesting access.

**Resolution**

1. Click **Connect Wallet** again to re-initiate the request.
2. In the Freighter popup, verify the origin matches the expected domain before approving.
3. If the popup never appears, check that your browser is not blocking popups for this site.

---

### Insufficient XLM Balance

**What it means**

The Stellar account does not have enough XLM to cover the tip amount plus the network transaction fee (approximately 0.00001 XLM per operation) and the minimum account reserve (currently 1 XLM base + 0.5 XLM per entry).

**Likely cause**

The account was recently created, the balance was spent in prior transactions, or the user entered a tip amount larger than their available balance.

**Resolution**

1. Check your balance inside Freighter or on [Stellar Expert](https://stellar.expert/).
2. Top up via a CEX such as Coinbase, Kraken, or any Stellar-compatible exchange.
3. For testnet testing, use the [Stellar Friendbot](https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY) to fund the account with free testnet XLM.
4. Reduce the tip amount so it fits within the available spendable balance (total minus reserves minus fee).

---

### Network Mismatch

**What it means**

The Freighter wallet is set to a different Stellar network (e.g. **Mainnet / Public**) than the one the application expects (e.g. **Testnet**). Transactions would be signed for the wrong network and would be rejected by the RPC node.

**Likely cause**

The user previously switched their Freighter network for another dApp and forgot to switch back. The default for Tipz during the current beta is **Testnet**.

**Resolution**

1. Open the Freighter extension.
2. Click the network selector at the top of the popup (it typically shows "Mainnet" or "Testnet").
3. Switch to **Testnet** (or the network shown in the warning on the Tipz UI).
4. Reload the Tipz page — the wallet state will refresh automatically.

---

## Contract Error Codes

All errors below are returned by the Tipz Soroban contract and are defined in `contracts/tipz/src/errors.rs`.

---

### 1 — NotInitialized

**What it means**

A contract function was called before the contract was initialized with `initialize()`.

**Likely cause**

The contract was freshly deployed but the admin setup transaction has not been submitted yet.

**Resolution**

Deploy and initialize the contract in a single workflow. Run `scripts/deploy-testnet.sh` which calls `initialize` automatically. If you are calling the contract directly, call `initialize` first.

---

### 2 — AlreadyInitialized

**What it means**

`initialize()` was called on a contract instance that is already set up.

**Likely cause**

An attempt was made to re-initialize the contract, possibly by running the deploy script twice against the same contract address.

**Resolution**

Do not call `initialize` again on an already-running contract. If you need a fresh deployment, deploy a new contract instance at a new address.

---

### 3 — NotAuthorized

**What it means**

The caller does not have the required authorization to execute the requested operation.

**Likely cause**

A non-admin account attempted an admin-only action (e.g. pausing the contract, updating fees, or triggering an admin change).

**Resolution**

Ensure the transaction is signed by the contract admin key. Review the contract's access-control rules in `contracts/tipz/src/admin.rs`.

---

### 4 — AdminChangeAlreadyPending

**What it means**

An admin change has already been proposed and is waiting out its timelock period. Only one pending change is allowed at a time.

**Likely cause**

The admin submitted `propose_admin_change` twice without either finalizing or canceling the first proposal.

**Resolution**

Wait for the existing proposal's timelock to expire, then finalize it, or cancel it first before submitting a new proposal.

---

### 5 — AdminChangeTimelockNotMet

**What it means**

The timelock period for a pending admin change has not yet elapsed.

**Likely cause**

`finalize_admin_change` was called too soon after `propose_admin_change`.

**Resolution**

Wait for the required number of ledgers (approximately 48 hours on testnet) to pass, then call `finalize_admin_change` again.

---

### 6 — NoPendingAdmin

**What it means**

`finalize_admin_change` or `cancel_admin_change` was called, but no admin change proposal is currently pending.

**Likely cause**

The proposal was already finalized or canceled, or `propose_admin_change` was never called.

**Resolution**

Check the contract state before calling finalize or cancel. Submit a new proposal first if needed.

---

### 7 — ContractPaused

**What it means**

The paused operations are blocked because the contract is in its paused state. Pausing is granular: each operation checks its own flag, or the global flag.

**Likely cause**

The admin triggered a pause. This is a safety measure used during incident response, upgrades, or automatically by the circuit breaker after abnormal withdrawal volume.

**Resolution**

Wait for the contract admin to resume the contract. If you are the admin, call `unpause` with the admin keypair and the flag you paused — `unpause(caller, flag)`. The flags are `1` tips, `2` withdrawals, `4` registration, `8` subscriptions, `16` refunds, and `4294967295` for all of them. To check the current state, call `is_paused(flag)`.

A global pause is only lifted by `unpause(caller, 4294967295)` — clearing a single flag does not lift it. The full procedure, including the exact commands, is in [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) §5a.

---

### 8 — NotRegistered

**What it means**

The address or username referenced in the call does not exist in the contract's profile registry.

**Likely cause**

The user attempted to tip or look up a creator who has not called `register_profile` yet.

**Resolution**

The creator must register their profile first via the **Register** page in the Tipz UI. After registration, the tip can be retried.

---

### 9 — AlreadyRegistered

**What it means**

The caller's address is already associated with a registered profile. Duplicate registrations are not permitted.

**Likely cause**

A user clicked **Register** more than once, or an automated script submitted `register_profile` twice for the same key.

**Resolution**

No action needed — the profile already exists. Navigate to the profile dashboard to view and manage it.

---

### 10 — UsernameTaken

**What it means**

The requested username is already claimed by another account.

**Likely cause**

Another user registered the same `@username` before the current request was confirmed.

**Resolution**

Choose a different username and resubmit the registration form.

---

### 11 — InvalidUsername

**What it means**

The submitted username does not meet the contract's format requirements (e.g. too short, too long, or contains disallowed characters).

**Likely cause**

The username contains spaces, special characters other than underscores/hyphens, or violates the length constraint (typically 3–32 characters).

**Resolution**

Use only lowercase letters, digits, hyphens (`-`), and underscores (`_`). Keep the length between 3 and 32 characters.

---

### 12 — InvalidDisplayName

**What it means**

The display name field contains invalid content or exceeds the maximum length.

**Likely cause**

The display name is empty, longer than the allowed maximum, or contains control characters.

**Resolution**

Keep the display name between 1 and 64 characters and avoid control characters.

---

### 13 — InvalidAmount

**What it means**

The tip amount passed to `send_tip` is not a valid positive integer, or is zero.

**Likely cause**

The frontend sent `0`, a negative number, or a non-integer value as the tip amount.

**Resolution**

Ensure the tip amount field contains a positive whole number before submitting the transaction.

---

### 14 — InsufficientBalance

**What it means**

The contract-tracked balance for the account is less than the requested withdrawal amount.

**Likely cause**

The user attempted to withdraw more than their earned tip balance. This is different from the wallet's XLM balance — it refers to unclaimed tips held by the contract.

**Resolution**

Withdraw only up to the available balance shown on the dashboard. Check the dashboard for the current claimable balance.

---

### 15 — BalanceNotZero

**What it means**

An operation that requires an empty contract balance (e.g. deactivating or deleting a profile) was attempted while a non-zero balance remains.

**Likely cause**

The user has unclaimed tips. Some administrative operations require the balance to be fully withdrawn first.

**Resolution**

Withdraw all earned tips to zero out the balance, then retry the operation.

---

### 16 — OverflowError

**What it means**

An arithmetic operation produced a value that exceeds the maximum representable integer (`u128::MAX` or `i128::MAX`).

**Likely cause**

Extremely large tip amounts or accumulated balances that exceed the safe integer range. Unlikely in normal usage.

**Resolution**

Contact the project maintainers. If you are a developer reproducing this, reduce the amounts involved in your test scenario.

---

### 17 — NotFound

**What it means**

A generic lookup in contract storage returned no result.

**Likely cause**

The requested resource (tip, profile, or record) does not exist. This can also occur if a ledger entry expired due to insufficient TTL extension.

**Resolution**

Verify the resource exists. For expired entries, the data may need to be re-submitted. Run `soroban contract invoke … get_profile` to confirm whether the entry is present.

---

### 18 — AlreadyDeactivated

**What it means**

`deactivate_profile` was called on a profile that is already inactive.

**Likely cause**

The deactivation transaction was submitted twice.

**Resolution**

No action needed — the profile is already deactivated. Use `reactivate_profile` if you want to restore it.

---

### 19 — ProfileDeactivated

**What it means**

An operation (e.g. tipping) was attempted on a profile that is currently deactivated.

**Likely cause**

The creator deactivated their account. Tippers can no longer send tips until the creator reactivates.

**Resolution**

The creator must reactivate their profile from the dashboard before tips can be received.

---

### 20 — ProfileNotDeactivated

**What it means**

`reactivate_profile` was called on a profile that is currently active.

**Likely cause**

The reactivation transaction was submitted redundantly.

**Resolution**

No action needed — the profile is already active.

---

### 21 — MessageTooLong

**What it means**

The optional tip message exceeds the maximum allowed character length (typically 280 characters).

**Likely cause**

The user typed a message longer than the contract-enforced limit.

**Resolution**

Shorten the message to 280 characters or fewer before resubmitting the tip.

---

### 22 — InvalidImageUrl

**What it means**

The profile image URL does not meet validation requirements (e.g. wrong protocol, unsupported domain, or malformed URL).

**Likely cause**

The URL uses HTTP instead of HTTPS, is not a valid IPFS URL, or contains characters that are not allowed in a URL.

**Resolution**

Use an HTTPS image URL or a valid IPFS gateway URL (`https://ipfs.io/ipfs/<CID>`). Ensure the URL is well-formed with no spaces.

---

### 23 — BatchTooLarge

**What it means**

A batch operation was submitted with more items than the contract allows in a single transaction.

**Likely cause**

An admin or script attempted to process too many records in one call, exceeding the per-transaction instruction budget.

**Resolution**

Split the batch into smaller chunks and submit multiple transactions.

---

### 24 — InvalidFee

**What it means**

The fee parameter supplied to an admin function is outside the allowed range (e.g. greater than 100% or negative).

**Likely cause**

An incorrect fee value was set during contract configuration.

**Resolution**

Supply a fee value in the valid range (0–1000 basis points, representing 0–10%). Consult `contracts/tipz/src/fees.rs` for the exact bounds.

---

### 25 — CannotTipSelf

**What it means**

The tipper's address matches the creator's address — self-tipping is not allowed.

**Likely cause**

A creator tried to tip their own profile, possibly while testing.

**Resolution**

Use a different account to send the tip, or test with a separate funded test keypair.

---

### 26 — NotVerified

**What it means**

An operation that requires a verified account was attempted on an unverified profile.

**Likely cause**

The creator has not completed the X (Twitter) handle verification step.

**Resolution**

Complete the verification flow: link your X handle in the profile settings and confirm via the verification endpoint.

---

### 27 — AlreadyVerified

**What it means**

A verification request was submitted for an account that is already verified.

**Likely cause**

The verification flow was triggered more than once.

**Resolution**

No action needed — the account is already verified. Proceed to the dashboard.

---

### 28 — Unauthorized

**What it means**

A generic authorization failure distinct from `NotAuthorized` (code 3). The caller lacks the required role or the authorization signature is missing.

**Likely cause**

The transaction was not signed by the correct key, or the Stellar `require_auth` check failed because the invoker's address is not the expected signer.

**Resolution**

Ensure the transaction is signed by the correct keypair. In the frontend, verify that Freighter is connected with the expected account before invoking the contract.

---

### 29 — RateLimitExceeded

**What it means**

The caller has sent too many requests within the rate-limit window.

**Likely cause**

Automated scripts or rapid UI interactions triggered more transactions than the contract allows per address per time window.

**Resolution**

Wait for the rate-limit window to reset (typically a few ledger-closes) before retrying. If you are a developer, slow down your test script.

---

### 30 — InvalidXHandle

**What it means**

The X (Twitter) handle supplied does not match the expected format.

**Likely cause**

The handle begins with `@` (the contract stores it without), contains spaces, or uses characters not allowed in X usernames.

**Resolution**

Supply the handle without the leading `@` symbol, using only alphanumeric characters and underscores, between 1 and 15 characters.

---

### 31 — TipBelowMinimum

**What it means**

The tip amount is below the global platform-wide minimum tip size.

**Likely cause**

The user tried to send a very small tip (e.g. 0.0000001 XLM) that is below the threshold enforced by the contract.

**Resolution**

Increase the tip amount to meet or exceed the minimum displayed in the UI.

---

### 32 — ProfileNotActive

**What it means**

The creator profile is not in an active state and cannot receive tips.

**Likely cause**

The profile is deactivated (see code 19) or was never fully activated after registration.

**Resolution**

The creator must complete registration and ensure their profile status is **Active** in the dashboard.

---

### 33 — InvalidMessage

**What it means**

The tip message contains invalid control characters (e.g. null bytes, carriage returns, or other non-printable characters).

**Likely cause**

The message was pasted from a source that included hidden formatting characters, or was programmatically generated with raw control codes.

**Resolution**

Clear the message field and retype the message manually, or sanitize the input to strip non-printable characters before submitting.

---

### 34 — BelowCreatorMinimum

**What it means**

The tip amount is below the creator's custom minimum tip setting.

**Likely cause**

The creator configured a higher personal minimum than the platform default. The tipper entered an amount below that threshold.

**Resolution**

Check the creator's profile page for the displayed minimum tip amount and enter an amount at or above it.

---

### 35 — InvalidDomain

**What it means**

A domain field is malformed or empty when a valid domain is required.

**Likely cause**

An empty string or an improperly formatted domain was passed to a function that requires a non-empty, valid domain value.

**Resolution**

Supply a valid domain string (e.g. `tipz.app`). Ensure the value is not empty and follows standard domain notation.

---

### 36 — InvalidInput

**What it means**

A generic input validation failure that does not map to a more specific error code.

**Likely cause**

A field passed to the contract contains a value that fails one of the contract's general-purpose validation checks.

**Resolution**

Review the contract function's parameter requirements. Check that all inputs are within allowed ranges and use permitted character sets.

---

### 37 — TokenNotAccepted

**What it means**

The token contract address passed to a function is not on the platform's accepted token whitelist.

**Likely cause**

The caller tried to use a custom or unofficial token that the Tipz contract has not been configured to accept.

**Resolution**

Use only whitelisted tokens (currently XLM / native Stellar, and any USDC equivalent added by the admin). Check the contract admin settings for the accepted token list.

---

### 38 — RefundWindowExpired

**What it means**

A refund was requested after the allowable refund window (measured in ledgers since the tip was sent).

**Likely cause**

Too much time elapsed between the tip being sent and the tipper requesting a refund.

**Resolution**

Refunds must be requested within the window (typically 24–72 hours of the tip, depending on admin configuration). Contact the creator directly to arrange a voluntary refund outside the contract.

---

### 39 — RefundAlreadyRequested

**What it means**

A refund request has already been submitted for this tip and is awaiting the creator's response.

**Likely cause**

The refund request transaction was submitted twice.

**Resolution**

Wait for the creator to approve or reject the existing refund request. Do not resubmit.

---

### 40 — RefundAlreadyProcessed

**What it means**

The refund for this tip has already been approved and executed.

**Likely cause**

An attempt was made to process the same refund more than once.

**Resolution**

No further action is needed. The refund funds have already been returned to the tipper.

---

### 41 — NoRefundRequest

**What it means**

A creator attempted to approve or reject a refund, but no refund request exists for the specified tip.

**Likely cause**

The tip ID is incorrect, the refund request was never submitted, or it was already processed and removed.

**Resolution**

Verify the tip ID. Confirm a refund request exists on-chain before attempting to approve or reject it.

---

### 42 — NotTipper

**What it means**

The account that submitted the refund request is not the original tipper for this tip.

**Likely cause**

A different account attempted to request a refund for a tip it did not send.

**Resolution**

Only the original tipper can request a refund. Ensure the connected wallet is the same account that sent the tip.

---

### 43 — NotCreator

**What it means**

The account attempting to approve or reject a refund is not the creator who received the tip.

**Likely cause**

A third party or the tipper themselves attempted to finalize a refund decision that only the creator can make.

**Resolution**

The creator must approve or reject refund requests using the wallet that owns the creator profile.

---

## Network and RPC Errors

### Contract Call Simulation Failed

**What it means**

The preflight simulation of a transaction returned an error before the transaction was signed or submitted. The contract rejected the proposed call.

**Likely cause**

One of the contract error codes listed above was returned during simulation. Common culprits are `NotRegistered`, `ContractPaused`, `InsufficientBalance`, or input validation failures.

**Resolution**

1. Read the simulation error code or message returned by the RPC (`simulateTransaction` response).
2. Match it to the contract error codes in this guide.
3. Fix the inputs or prerequisites and retry.
4. If the simulation error is `InstructionCountExceeded`, the call is too expensive in a single transaction — break it into smaller operations.

---

### Transaction Submission Failed or Timed Out

**What it means**

The signed transaction was submitted to the Stellar network but was not included in a ledger within the expected time window, or the RPC rejected it outright.

**Likely cause**

- The transaction fee was set too low to be included (especially during high-traffic periods).
- The transaction sequence number was stale (another transaction from the same account was submitted concurrently).
- A network outage or RPC node restart occurred between signing and submission.
- The transaction TTL (time-to-live) expired.

**Resolution**

1. Increase the base fee if the error is `tx_insufficient_fee`.
2. Reload the app and retry — the frontend will fetch a fresh sequence number.
3. Check the RPC node status at [status.stellar.org](https://status.stellar.org).
4. If the issue persists, try switching to a different RPC endpoint in the app settings.

---

### RPC Connection Errors

**What it means**

The frontend cannot reach the Soroban RPC node or Horizon server to fetch account data or submit transactions.

**Likely cause**

- The user's internet connection is down.
- The configured RPC endpoint (`VITE_SOROBAN_RPC_URL`) is incorrect or the node is unreachable.
- The RPC node is under maintenance or rate-limiting the client IP.
- CORS headers are missing (only relevant for self-hosted nodes).

**Resolution**

1. Check your internet connection.
2. Verify the RPC URL in `frontend-scaffold/.env` matches a live endpoint:
   - Testnet: `https://soroban-testnet.stellar.org`
   - Mainnet: `https://mainnet.stellar.validationcloud.io/v1/<API_KEY>` (or another public provider)
3. Try the [Stellar public RPC endpoints](https://developers.stellar.org/network/soroban-rpc/rpc-providers) as an alternative.
4. Check [status.stellar.org](https://status.stellar.org) for active incidents.
5. If you are self-hosting an RPC node, ensure CORS is configured to allow requests from the app's origin.

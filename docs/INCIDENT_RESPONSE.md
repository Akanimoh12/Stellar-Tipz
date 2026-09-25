# Incident Response Runbook

> What to do when Stellar Tipz is broken, exploited, or leaking keys — before, during, and after.
> If you are reading this for the first time during an incident, read [§5a Pause the contract](#5a-pause-the-contract) and copy the commands from there.

---

## Table of Contents

1. [Scope](#1-scope)
2. [Severity definitions](#2-severity-definitions)
3. [Detection and first 15 minutes](#3-detection-and-first-15-minutes)
4. [Escalation and on-call expectations](#4-escalation-and-on-call-expectations)
5. [Procedures](#5-procedures)
   - [5a. Pause the contract](#5a-pause-the-contract)
   - [5b. Roll back a deploy](#5b-roll-back-a-deploy)
   - [5c. Handle a key compromise](#5c-handle-a-key-compromise)
   - [5d. Corrupt or lost indexer / database data](#5d-corrupt-or-lost-indexer--database-data)
6. [Communication templates](#6-communication-templates)
7. [Blameless postmortem](#7-blameless-postmortem)
8. [Known gaps](#8-known-gaps)
9. [Quick reference card](#9-quick-reference-card)
10. [Drills](#10-drills)

---

## 1. Scope

This runbook covers production incidents in these components:

| Component | Where it runs | Blast radius if broken |
| --------- | ------------- | ---------------------- |
| Smart contract | `contracts/tipz` (Soroban, `TipzContract`, `CONTRACT_VERSION = 4`) | Real user funds. Pauseable. Upgradeable. |
| Backend + indexer | `backend/` (NestJS, Prisma/Postgres, Redis, BullMQ) | Off-chain projection only. The chain is the source of truth. |
| Frontend | `frontend-scaffold/` (React + Vite, deployed to Vercel) | Can route users into a wrong or hostile contract. |
| CI/CD + supply chain | `.github/workflows/` (18 workflows), Dependabot, GitGuardian | Can publish a bad WASM or leak secrets. |
| Keys | Contract admin identity, keeper keys, GitHub/Vercel/AWS secrets | See [§5c](#5c-handle-a-key-compromise). |

**Out of scope — use the other process instead:**

| Situation | Process |
| --------- | ------- |
| An outside researcher reports a vulnerability | `SECURITY.md` — private GitHub Security Advisory or `security@stellar-tipz.dev`. **Do not open a public issue.** |
| A Stellar network / Soroban node problem | <https://status.stellar.org>, then the Stellar Discord (`https://discord.gg/stellardev`) |
| A user lost their own wallet seed phrase | Nothing we can do. Point them at Stellar Wallet recovery; never ask for the phrase. |
| Dependency vulnerability with no exploit path | `SECURITY.md` severity ladder + `.github/workflows/security-audit.yml` |

**Related documents:**

- `docs/DEPLOYMENT.md` §5 (migration rollback) and §7 (brief emergency procedures) — this runbook supersedes §7.
- `docs/BACKUP.md` — backup schedule, RPO/RTO, restore verification.
- `docs/TROUBLESHOOTING.md` — user-facing error codes, including `7 — ContractPaused`.
- `docs/SECURITY.md` — disclosure and vulnerability remediation SLAs.
- `docs/adr/` — architectural decisions. An incident that invalidates a decision gets a superseding ADR, not an edit.

---

## 2. Severity definitions

Severity is set by **money at risk and blast radius**, not by how alarming the symptom looks. `SECURITY.md` already defines a CVSS-based ladder for *vulnerabilities*; the ladder below is for *live incidents* and maps onto it.

| Severity | Name | Definition | Target: acknowledge | Target: mitigate | Target: user comms |
| --- | --- | --- | --- | --- | --- |
| **SEV1** | Critical | Funds can be lost, stolen, or frozen, or a privileged key is exposed. The contract is hostile or uncontrollable. | 5 min, any hour | 30 min (containment, not fix) | 30 min |
| **SEV2** | Major | The platform is degraded for a large fraction of users, or state shown to users is wrong (balances, credit scores, leaderboards), but no funds are at risk. | 30 min, any hour | 4 h | 4 h |
| **SEV3** | Minor | A single feature, a single creator, or a single integration is broken. Workaround exists. | 1 business day | 5 business days | Only if it blocks withdrawals for that creator |
| **SEV4** | Low | Cosmetic, documentation, or internal tooling. No user-visible impact. | 3 business days | Next release | None |

### 2a. SEV1 — examples specific to this platform

Any one of these is SEV1. Do not wait for confirmation.

- **Admin key exposure or misuse.** The admin key can call `propose_upgrade` + `execute_upgrade` with **no timelock** (`admin.rs:906-979`), and can pause/unpause at will. A leaked admin key is a total loss of the contract until you redeploy (§5c).
- **An `upgrade` transaction you did not author.** Check `get_version()` against your last known deploy (`lib.rs:745`); a version you cannot explain means the WASM is now attacker-chosen.
- **A `set_fee_collector` you did not author.** Funds route to an attacker address from the next withdrawal.
- **Any multisig signer key exposure** once `set_multisig_config` is live: the multisig can `Pause`, `Unpause`, `Upgrade`, `SetFee`, and `SetAdmin` (`multisig.rs:17-28`).
- **Keeper key exposure** — `PAYOUT_KEEPER_SECRET_KEY` or `SUBSCRIPTION_KEEPER_SECRET_KEY` (`backend/.env.example:116-131`). Blast radius is pre-authorised payouts only, per ADR-008, but that is still real money leaving without a human in the loop.
- **Funds moving that should not be.** Any creator balance decreasing other than by their own `withdraw_tips` / `withdraw_token` / `emergency_withdraw_tips`.
- **The frontend is pointed at a contract ID you do not control** (`VITE_CONTRACT_ID`). Every tip a user sends in that state is unrecoverable. This is why a bad deploy is a SEV1 when it touches that variable, and only SEV2 when it does not.

### 2b. SEV2 — examples

- **All creators cannot withdraw.** `Withdrawals` flag stuck set (`is_paused --flag 2` is `true`), or a fee change is pending an unreached timelock, or the frontend is failing before it reaches the contract.
- **A global pause has been live for more than 48 h.** Not a bug, but past this point it is a SEV2 process failure: creators are locked out of normal withdrawals and the 7-day emergency path (`admin.rs:544`) is the only exit.
- **Indexer more than 50 ledgers behind** (`INDEXER_LAG_THRESHOLD_LEDGERS`, `backend/.env.example:61`): balances, credit scores, and leaderboards are wrong on the website while being correct on-chain. Users will think their money is gone.
- **Chain reorg handling fired** (`indexer_reorgs_total` in `GET /metrics`): projections were deleted and rebuilt. Confirm no user-visible inconsistency survived.
- **`/health/ready` returning 503 for more than 15 minutes** (Postgres, Redis, `soroban-rpc` unhealthy, or indexer stalled — `health.routes.ts:13-37`).
- **A tip succeeds on-chain but the UI reports failure**, and users retried (double-tip is user-visible but recoverable).
- **Subscription charging fails for one or more creators** after `PAYOUT_MAX_ATTEMPTS` — their payout schedule is paused and they have been notified (`ADR-008`, `backend/src/jobs/payout.worker.ts`).

### 2c. SEV3 / SEV4 — examples

- SEV3: one creator's profile or donation page renders wrong; leaderboard is wrong for one period; email receipts stop sending; a webhook endpoint 500s; `npm run backup:verify` fails once.
- SEV4: Lighthouse budget regressions, bundle-size job failures, stale docs, disabled `lighthouse.yml` noise.

### 2d. What each pause flag freezes

Use this to pick the narrowest correct flag ([§5a](#5a-pause-the-contract)) and to tell users what has stopped.

| Flag | `--flag` | Stops | Does **not** stop |
| --- | --- | --- | --- |
| `Tips` | `1` | `send_tip`, `send_tip_on_behalf`, `send_tip_token` | Withdrawals, refunds, registration |
| `Withdrawals` | `2` | `withdraw_tips`, `withdraw_token` | Tips — users can still send you money you cannot pay out |
| `Registration` | `4` | `register_profile` and other profile mutations | Tips and withdrawals for existing creators |
| `Subscriptions` | `8` | subscription create / cancel / `execute_due_subscription` | One-off tips |
| `Refunds` | `16` | refund request / approve / reject / expire | Tips, withdrawals |
| `All` | `4294967295` | every state-changing user path that checks a flag | Goal tracking (`set_goal`, `cancel_goal`) and all admin functions — see [§8](#8-known-gaps) |

A pause stops the contract's user-facing operations. It does **not** stop the admin: `set_fee_collector`, `add_accepted_token`, `verify_domain`, `cleanup_inactive_profiles` and the rest keep working while the contract is paused, and so does the frontend, the backend, and the keeper jobs. If admin actions are what you are worried about, pausing is not a control — [§5c](#5c-handle-a-key-compromise) is.

---

## 3. Detection and first 15 minutes

### 3a. Where signals come from

| Signal | Source | Notes |
| --- | --- | --- |
| Frontend errors | Sentry (`VITE_SENTRY_DSN`, `@sentry/react`) | Disabled if the DSN is unset — see [§8](#8-known-gaps). |
| Backend errors | Sentry (`SENTRY_DSN`, `@sentry/node`) + pino logs | Logs are PII-redacted; tokens and full addresses never appear. |
| Liveness | `GET /health/live` | Process is up. Says nothing about dependencies. |
| Readiness | `GET /health` and `GET /health/ready` | 503 unless Postgres, Redis, `soroban-rpc` and the indexer are all healthy. |
| Metrics | `GET /metrics` | Includes `indexer_reorgs_total` and indexer lag. |
| Backup integrity | `BACKUP_ALERT_WEBHOOK_URL` via `.github/workflows/backup-verify.yml` | Daily 03:00 UTC. |
| Dependency CVEs | `.github/workflows/security-audit.yml` (Mon 06:00 UTC) | Auto-fills issues labelled `security`. |
| Chain | `get_stats()`, `get_version()`, `get_circuit_breaker_status()`, `get_admin_audit_history()` | Reads are available even while paused. |
| Humans | X `@TipzApp`, GitHub Discussions, Stellar Discord | Slowest and most common source for a single-creator problem. |

There is **no automated alerting on the contract itself.** The circuit breaker auto-pauses on abnormal withdrawal volume and emits a `("breaker","tripped")` event (`circuit_breaker.rs`, `events.rs:377-387`) — someone has to be watching for it.

### 3b. Triage: three questions, in order

Answer these before touching anything. They decide severity and which procedure you run.

1. **Is this on-chain?** Call a read entrypoint. If the chain is correct and only the backend/frontend is wrong, this is at most SEV2 and the fix is a deploy rollback (§5b), not a pause.
2. **Is a privileged actor involved?** Read `get_admin_audit_history` and `get_version`. If you cannot account for the newest entry or the version changed, this is SEV1 and you are in a key-compromise incident (§5c), not a bug.
3. **Is money moving that should not be?** Compare `get_stats()` and recent `tips_withdrawn` / `fee_collected` events against what the backend shows. If funds are moving, pause first (§5a) and investigate second.

### 3c. Capture evidence before you change state

The pause bitmask, `get_paused_at`, contract version and admin audit log are all read from chain. Capture them now, before you pause, because pausing changes the system you are investigating.

```bash
NETWORK=testnet                 # mainnet for production
export NETWORK
export CONTRACT_ID=C...         # the contract you are responding to
export BACKEND_URL=https://...  # the backend origin — NOT the Vercel frontend host
mkdir -p /tmp/ir

# Contract state snapshot
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_version
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_paused_at
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 2
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 4
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 8
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 16
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_circuit_breaker_status
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_multisig_config
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_admin_audit_history --limit 20 --offset 0
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_admin_change_history --limit 10 --offset 0
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_stats

# Backend state
curl -s "$BACKEND_URL/health" | tee /tmp/ir/health-$(date -u +%Y%m%dT%H%M%SZ).json
curl -s "$BACKEND_URL/metrics" > /tmp/ir/metrics-$(date -u +%Y%m%dT%H%M%SZ).txt

# Deploy state — what is actually live?
npx vercel ls
git log --oneline -5 origin/main
```

Record the UTC time you started. Everything after this is the timeline for the postmortem (§7).

---

## 4. Escalation and on-call expectations

### 4a. Roles

| Role | Who | Responsibility |
| --- | --- | --- |
| **Incident Commander (IC)** | On-call responder | Owns severity, decides on pausing, runs the checklist, assigns roles. Does not debug. |
| **Technical Lead (TL)** | Second person on the call | Investigates, writes the fix, runs the verification steps. |
| **Comms Lead (CL)** | Anyone not debugging | Posts the updates in §6. Keeps the incident log. |
| **Scribe** | CL by default | Writes the live timeline in UTC. This is the postmortem skeleton — do it during, not after. |
| **Key holder** | The admin identity holder | The only person who can sign admin transactions. If the IC is not the key holder, the key holder is paged with the IC — not "cc'd". |

One person may hold several roles for a SEV3. For a SEV1, keep the IC and TL separate even if that means the IC is idle: the IC's job is the checklist, not the investigation.

### 4b. Rotation and contact details

**Current state: there is no rotation.** Stellar Tipz is maintained by a single founder-developer (`README.md` §Team) with no CODEOWNERS and no paging integration. This runbook is written for that reality: it assumes one person can be woken, and it tells you what to do when they cannot be.

| Role | Primary | Backup |
| --- | --- | --- |
| IC / on-call | Akan Nigeria (`@akan_nigeria`) | _TBD_ |
| Contract admin key holder | _TBD_ (should be a hardware wallet per `docs/DEPLOYMENT.md` §Pre-Deployment Checklist) | _TBD_ |
| Comms | _TBD_ | _TBD_ |
| Security reports in | `security@stellar-tipz.dev` | — |
| General contact | `hello@tipz.app` | — |
| Public channels | X `@TipzApp`, GitHub Discussions | — |

**Filling this table in is a prerequisite for mainnet, not a nice-to-have.** An unlisted key holder means a SEV1 with a 30-minute mitigation target has no one who can execute it.

### 4c. On-call expectations

| | SEV1 | SEV2 | SEV3 |
| --- | --- | --- | --- |
| Coverage | 24/7, including weekends and holidays | Business hours UTC, plus on-call for anything involving funds | Business hours UTC |
| Acknowledge | 5 minutes | 30 minutes | 1 business day |
| First public statement | 30 minutes | 4 hours | Only if withdrawals are blocked for a user |
| Update cadence | Every 30 minutes until contained, then hourly | Every 2 hours until resolved | At resolution |
| Second person required | Yes, when the key holder is not the IC | No | No |
| Status updates written during the incident | Yes, in UTC | Yes, in UTC | Only for the postmortem |

If you are on call and cannot reach the key holder within the acknowledge window for a SEV1, escalate externally in parallel — do not serialise. External contacts, in the order they are useful:

1. Stellar Foundation security — <https://www.stellar.org/foundation/security> (chain-level problems, protocol incidents).
2. Stellar Discord — `https://discord.gg/stellardev` (fastest human channel, public).
3. The most recent third-party auditor, if one has been engaged (see `docs/DEPLOYMENT.md` §Pre-Deployment Checklist).
4. Sponsors and Scaffold Stellar, if the incident is public and press is involved.

### 4d. Escalation ladder

```
Alert / user report
  └─> On-call responder        acknowledge, classify severity (§2), open the incident log
        └─> Incident Commander  owns severity; may raise or lower it, must justify in the log
              ├─> Technical Lead            investigate; no severity decisions
              ├─> Comms Lead / Scribe        post updates (§6), maintain the timeline
              ├─> Key holder                 sign admin transactions
              └─> External                   SDF security, Stellar Discord, auditor, legal
```

Anyone may call a pause. Nobody may unpause without the IC's explicit approval recorded in the incident log with a reason.

---

## 5. Procedures

### 5a. Pause the contract

> **When in doubt, pause.** A global pause costs creators access to withdrawals for as long as it is live, and it is reversible in one transaction. An exploit is not reversible at all. If you are deciding at 3am, pause and then investigate.

#### What pausing does and does not do

- It is reversible immediately, in one transaction. It is not a freeze in the regulatory sense: it stops the contract's own entrypoints, but anyone holding a Stellar account can still send XLM *to* the contract. The contract simply cannot move it out.
- Reads keep working while paused. Your frontend can still render balances.
- A **global** pause also stamps the `PausedAt` storage key (read it with `get_paused_at`), which starts the 7-day clock for `emergency_withdraw_tips` (`admin.rs:544`, `tips.rs:599-633`). See [the footguns](#footguns-in-the-pause-mechanism) — a granular pause does **not** start that clock.
- Pausing does **not** stop the backend indexer, the frontend, or the keeper jobs. See [§2d](#2d-what-each-pause-flag-freezes).

#### Step 0 — Preflight (2 minutes)

```bash
soroban --version                 # 21.0+ (docs/DEPLOYMENT.md §Prerequisites)
soroban keys list                 # is the admin identity on this machine?
```

Then pin the variables. Do this every time; do not trust what is in your shell from last week.

```bash
export NETWORK=testnet           # mainnet for production
export CONTRACT_ID=C...
export ADMIN_KEY=tipz-admin      # identity name, e.g. the key you initialised the contract with
export ADMIN_ADDR=$(soroban keys address "$ADMIN_KEY")
echo "pausing $CONTRACT_ID on $NETWORK as $ADMIN_ADDR"
```

> The admin key is **not** a CI secret. `scripts/deploy-testnet.sh` generates a fresh `tipz-deployer` identity on each run inside the workflow, so the identity that is admin on a contract is a locally-held key in `~/.config/soroban/identities`. If `soroban keys list` does not show it, the contract's admin is someone else's key — stop and escalate to the key holder.

#### Step 1 — Decide the flag

| Situation | `--flag` |
| --- | --- |
| You do not yet know what is wrong, or funds are moving | `4294967295` (**global — do this by default**) |
| Only tips are the problem (e.g. a bad batch/multi-token path) | `1` |
| Only withdrawals are the problem (e.g. a fee or fee-collector bug) | `2` |
| Only profile registration is the problem | `4` |
| Only subscriptions are the problem | `8` |
| Only the refund mechanism is the problem | `16` |

**Use `4294967295` unless you have a specific, verified reason not to.** A global pause is one transaction and one `unpause` to reverse; a granular pause that turns out to be insufficient is a second incident on top of the first.

#### Step 2 — Check whether multisig is enabled

If `get_multisig_config` returns a config, `pause` will fail with `MultisigRequired` and you must go through [Step 2b](#step-2b--multisig-is-enabled-use-this-instead-of-step-3).

```bash
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_multisig_config
```

- Returns `null` → continue with Step 3.
- Returns a config → use [Step 2b](#step-2b--multisig-is-enabled-use-this-instead-of-step-3).

#### Step 2b — Multisig is enabled (use this instead of Step 3)

Once `set_multisig_config` has been called, `pause` / `unpause` / `execute_upgrade` and all fee changes return `MultisigRequired` (`admin.rs:113-124`). Privileged actions must go through proposals.

```bash
# 1. Check the threshold and signer list
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_multisig_config
#    -> { required_signatures: 2, signers: [G..., G...] }

# 2. A signer proposes the pause. The `action` argument is a contract enum whose unit variant
#    is Pause; the CLI encoding is a symbol vector. Confirm the exact encoding your CLI wants
#    (and dry-run it) before submitting for real:
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- \
  propose_action --signer "$SIGNER_A" --action '["Pause"]'

# 3. Collect `required_signatures` approvals. approve_action executes the action as soon as
#    the threshold is met, so line up every signer before the first approval lands.
soroban contract invoke --id "$CONTRACT_ID" --source "$SIGNER_B" --network "$NETWORK" \
  -- approve_action --signer "$SIGNER_B" --proposal_id 1

# 4. Confirm the outcome
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_proposal --proposal_id 1
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1
```

The multisig path pauses `All` only — there is no granular multisig pause, so a multisig incident response is always a global pause.

#### Step 3 — Pause (the actual command)

```bash
FLAG=4294967295        # global pause; see the table in Step 1

# Optional but recommended: simulate first. It costs nothing and catches a wrong contract ID,
# a wrong flag, or an unfunded account. (docs/DEPLOYMENT.md §Pre-Deployment Checklist)
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" --sim \
  -- pause --caller "$ADMIN_ADDR" --flag "$FLAG"

# Then for real. Note the argument names: `caller` and `flag`.
soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- \
  pause \
  --caller "$ADMIN_ADDR" \
  --flag "$FLAG"
```

Save the transaction hash. It is your proof and your timeline entry.

#### Step 3a — Verify. This step is not optional.

A pause with a wrong `--flag` value **succeeds and pauses nothing** — unknown values map to `PauseFlag::None` (`types.rs:119-130`). The transaction will be in the chain, an event will be emitted, and nothing will be paused. Always verify.

```bash
# Expect: true
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 2
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 4
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 8
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 16
# After a global pause all five return true, and this returns a timestamp:
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_paused_at
```

If `is_paused --flag 1` is `false` after a supposedly successful pause, the transaction reverted or the flag was not what you thought. Re-run Step 3 with `FLAG=4294967295` before doing anything else.

#### Step 3b — Stop the off-chain money

A pause does not stop the backend. While the contract is paused:

- The indexer will keep processing; that is fine and desirable, you want it caught up when you unpause.
- Check that the keeper jobs are not spinning on failed withdrawals: see `GET /api/v1/admin/queues/health` and `.../queues/metrics`.
- If the frontend is showing wrong state, consider a [rollback (§5b)](#5b-roll-back-a-deploy) at the same time as the pause. Pausing and rolling back are independent and can both be true.

#### Step 4 — Communicate

Post the holding statement ([§6](#6-communication-templates)) now, before you understand the bug. Users can tell that transactions are failing; silence makes it look like theft.

#### Step 5 — Unpause

Only when the IC has approved it, the reason is written in the incident log, and the fix is verified.

```bash
# Undo exactly what you did in Step 3. For a global pause, this is the ONLY flag that works:
soroban contract invoke \
  --id "$CONTRACT_ID" --source "$ADMIN_KEY" --network "$NETWORK" \
  -- unpause --caller "$ADMIN_ADDR" --flag 4294967295

# Verify (expect false for the flag you unpaused, true for the ones you left set)
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_paused_at
```

Then post the resolution notice (§6) and schedule the postmortem (§7).

#### Footguns in the pause mechanism

Read these before your first incident. Each one produces a silent no-op rather than an error.

1. **Unpausing a global pause with a granular flag does nothing.** The pause state is a bitmask (`storage.rs:463-478`). After a global pause the mask is `0xFFFFFFFF`; clearing one bit leaves every other bit set, so the contract stays paused. The only unpause that lifts a global pause is `unpause --flag 4294967295`.
2. **An unknown `--flag` value is a silent no-op.** `PauseFlag::from_u32` maps anything other than `0, 1, 2, 4, 8, 16, 4294967295` to `PauseFlag::None` (`types.rs:119-130`). There is no error. Verify in Step 3a or you will believe you are paused when you are not.
3. **A granular pause erases the emergency-withdrawal timestamp.** `set_pause_flags` only stamps `PausedAt` when the `All` bit is set, and removes it otherwise (`storage.rs:427-441`). A granular pause of `Tips` will clear a `PausedAt` left by an earlier global pause, resetting the 7-day emergency-withdrawal clock. Mixing granular and global modes is a trap; pick one and stay in it.
4. **A global pause arms a 7-day fee-free withdrawal.** After 7 days from `PausedAt`, any registered creator can call `emergency_withdraw_tips` and leave with their balance fee-free, even while paused (`tips.rs:599-633`). This is a deliberate anti-exploit design, not a bug. It does mean a forgotten pause becomes a revenue and support problem after 7 days — put the unpause date in the incident log with an owner.
5. **Pausing `Withdrawals` while leaving `Tips` open makes things worse.** Users can still send money you are contractually unable to pay out. If withdrawals are suspect, pause `All`.
6. **`pause` needs the caller's signature.** The CLI's `--source` and the `--caller` argument must be the same account. A mismatch returns `NotAuthorized`.
7. **Multisig changes the entrypoint.** If `get_multisig_config` is non-null, the plain `pause` call fails with `MultisigRequired`. Check before you panic.

### 5b. Roll back a deploy

Deploys to production come from two places: the frontend via Vercel (`.github/workflows/deploy.yml`, automatic on push to `main`) and the contract via `deploy-testnet.yml`, which pushes a new `CONTRACT_ID` back to `main` as a bot commit. Roll back the thing that is actually broken.

#### 5b-1. Frontend (Vercel)

```bash
npx vercel ls                                    # find the last known-good deployment
npx vercel rollback --token="$VERCEL_TOKEN" --yes # roll back to the previous deployment
# or promote a specific one:
npx vercel promote <previous-deployment-url> --token="$VERCEL_TOKEN"
# or in the dashboard: Deployments → pick the previous one → "Promote to Production"
```

CI already attempts this automatically: `verify-deployment` and the `rollback` job in `.github/workflows/deploy.yml:173-193` run `npx vercel rollback` when post-deploy verification fails.

**Know what the automated check does and does not cover.** `scripts/verify-deployment.ts:28-39` issues its `/health` request against `DEPLOYMENT_URL`, which for production is the Vercel frontend host. `vercel.json` has no API rewrite, so that request resolves through the SPA rewrite and returns the app's HTML with a 200 — it does not prove the backend is healthy. A green deploy therefore does **not** mean the backend is up. After any frontend rollback, check the backend by hand:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "$BACKEND_URL/health/ready"
```

If the bad deploy was purely an environment variable (`VITE_CONTRACT_ID`, `VITE_NETWORK_PASSPHRASE`, `VITE_SOROBAN_RPC_URL`), fix the variable and redeploy rather than rolling back code — a rollback restores the old value too. **A wrong `VITE_CONTRACT_ID` is a SEV1** (§2a) and the priority is stopping users from sending to it, which means rolling back or hotfixing first and investigating the second.

#### 5b-2. Backend

There is no pinned known-good backend image or release, so rollback means reverting code and redeploying.

```bash
# Identify the bad commit
git log --oneline -10 origin/main

# Revert it on a branch and let CI prove the revert is safe
git switch -c revert/<bad-sha> origin/main
git revert --no-edit <bad-sha>
git push -u origin revert/<bad-sha>       # open a PR; pr-checks, contract-ci, frontend-ci, security-audit must pass
```

Branch protection (`.github/branch-protection.json`) requires signed commits, a passing `frontend-ci` / `contract-ci` / `pr-checks` / `security-audit`, one approving review, and linear history. **Do not disable branch protection during an incident.** If the revert is blocked, hold the paused contract and get the review — a slower correct deploy beats a fast unreviewed one. The exception is a credential leak in a commit: rotate the credential first, then revert.

If the incident is a stuck process rather than bad code, a restart is the rollback — no code change needed.

#### 5b-3. Database

Follow `docs/DEPLOYMENT.md` §5 (migration rollback runbook) and `docs/BACKUP.md`. The short version:

```bash
npx prisma migrate status                                  # what is applied, what is not
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/prisma/migrations/<migration>/down.sql          # if a sibling down.sql exists
```

If the migration is irreversible, restore the last known-good dump to an isolated database, validate it with `npm run backup:verify` against a scratch `SCRATCH_DATABASE_URL`, then promote it and replay verified post-snapshot writes. Indexer-derived tables (`Tip`, `Refund`, `EventLog`, `IndexerCursor`) can instead be rebuilt from chain by setting `INDEXER_START_LEDGER` to the cursor and letting the indexer replay — projections are idempotent, so this is the cheaper path when only projections are wrong.

#### 5b-4. Contract

There are three cases, in order of preference.

**a. Roll back a WASM upgrade you just performed.** The previous WASM is in the `deployment-artifacts` GitHub Actions artifact (retained 30 days) or in a local `contracts/target/` build. Install it, then propose and execute the upgrade — the contract ID and all storage are preserved.

```bash
soroban contract install --wasm ./tipz_contract.wasm \
  --source "$ADMIN_KEY" --network "$NETWORK"          # prints the new WASM hash
export OLD_WASM_HASH=<printed hash>

soroban contract invoke --id "$CONTRACT_ID" --source "$ADMIN_KEY" --network "$NETWORK" \
  -- propose_upgrade --admin "$ADMIN_ADDR" --new_wasm_hash "$OLD_WASM_HASH"

soroban contract invoke --id "$CONTRACT_ID" --source "$ADMIN_KEY" --network "$NETWORK" \
  -- execute_upgrade --admin "$ADMIN_ADDR" --new_wasm_hash "$OLD_WASM_HASH"

soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_version
```

`get_version` only ever increments, so it is not a rollback indicator — compare the executed WASM hash and your release tag instead. `propose_upgrade` has **no timelock**; there is no cooling-off window between proposing and executing.

**b. The contract was redeployed and `CONTRACT_ID` changed.** `deploy-testnet.yml` commits the new ID to `main` as `chore: update contract bindings and env for testnet [skip ci]`, and the frontend picks it up on the next production deploy. Reverting that commit and redeploying the frontend repoints users at the previous contract. Note the user's balances live in the contract, not the user account, so this moves the whole problem rather than fixing it — prefer (a).

**c. A bad contract is already live and the old WASM is gone.** Redeploy the fixed WASM (`./scripts/deploy-testnet.sh --build`), then update the frontend to the new `CONTRACT_ID` and re-register affected creators. There is no automatic state migration; plan the creator migration explicitly and tell users what to expect.

### 5c. Handle a key compromise

#### 5c-1. Know which key, and what it can do

| Key | Where it lives | What it controls |
| --- | --- | --- |
| Contract admin identity (e.g. `tipz-admin`) | `~/.config/soroban/identities` on the key holder's machine | **Everything.** Pause, unpause, WASM upgrade with no timelock, fee collector, verification, multisig config, token whitelist. Not recoverable — see below. |
| `PAYOUT_KEEPER_SECRET_KEY` | backend environment secret | Signs pre-authorised creator payouts. Cannot move funds to arbitrary addresses (ADR-008). |
| `SUBSCRIPTION_KEEPER_SECRET_KEY` | backend environment secret | Signs subscription charges for existing authorisations. |
| `JWT_SECRET` / `JWT_SECRETS` + `JWT_CURRENT_KID` | backend environment secret | Forges API sessions. Rotation map is already supported, which is what makes this recoverable. |
| `WEBHOOK_SIGNING_SECRET` | backend environment secret | Forges inbound webhook calls. |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub Actions secrets | Deploys the frontend. Can also read build env. |
| `BACKUP_READ_AWS_*` | GitHub Actions secrets | Reads the production database backups. |
| `GITHUB_TOKEN` with `contents: write` | `deploy-testnet.yml` | Pushes to `main`, bypassing review. |

**There is no admin revocation.** `set_admin` unconditionally returns `NotAuthorized` (`admin.rs:546-552`); the only path is `propose_admin_change` + `confirm_admin_change`, and *both* require the current admin's authorisation. A compromised admin can also `propose_upgrade` + `execute_upgrade` in two consecutive transactions with no timelock. Concretely: **if the admin key is lost or stolen, the contract cannot be recovered by the team. The only exits are the 7-day `emergency_withdraw_tips` path (if the WASM was not replaced) and a full redeploy.** This is why §4b's key-holder row matters and why [§8](#8-known-gaps) lists adding a revocation or timelocked-upgrade path as a blocking pre-mainnet item.

#### 5c-2. Procedure

Work off-chain first. That is where you still have control, and it is where the clock matters.

**Minute 0-5 — stop the bleeding you can reach.**

1. If the key was on a machine, isolate the machine. Do not log into it again.
2. If it was in a secret store or CI, revoke it there first: rotate the GitHub secret, the Vercel token, the AWS read key, `JWT_SECRET` (publish the new value in `JWT_SECRETS` with a new `kid` and move `JWT_CURRENT_KID` — the rotation map exists for exactly this), `WEBHOOK_SIGNING_SECRET`.
3. Assume every secret from the same machine or repository is exposed, not just the one you found.

**Minute 5-20 — on-chain triage.**

```bash
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_version
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_admin_audit_history --limit 50 --offset 0
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_admin_change_history --limit 20 --offset 0
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_pending_proposals
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_proposed_upgrade
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_stats   # includes fee_collector
```

4. `get_version` is higher than your last deploy, or `get_proposed_upgrade` returns a hash you did not propose → **the attacker has code execution.** Do not try to out-race them on-chain; go to step 6.
5. The `fee_collector` in `get_stats` is not the address you set, or `get_admin_audit_history` shows a `set_fee_collector` or `propose_upgrade` you did not author → **SEV1**, and note the timestamp: it bounds the exposure window. Nothing unexpected in the audit log → the key may be exposed but unused; rotate everything anyway, because the audit ring buffer holds 100 entries and absence of evidence is not evidence of absence.

**Minute 20-45 — contain the user-facing path.**

6. Deploy a frontend build that tells users to stop interacting with the contract (a maintenance notice, or disable tipping if a feature flag covers the affected path). Until the frontend ships such a switch, the fastest lever is a Vercel rollback to a build that predates the problem plus an X post telling users not to transact.
7. If the WASM was replaced, you are in the redeploy path (§5b-4c). Users' balances are in the old contract's storage; plan the migration and communicate it honestly rather than letting people discover it.
8. If the WASM was not replaced, the 7-day `emergency_withdraw_tips` path is the user exit. It only opens 7 days after `PausedAt`, so a global pause you set *now* delays it. Decide deliberately, and say so in the comms.

**Hour 1-24 — tell people, then fix.**

9. Open a private GitHub Security Advisory if the compromise came from a vulnerability, and follow the disclosure timeline in `SECURITY.md`.
10. Notify SDF security (<https://www.stellar.org/foundation/security>) and post the user notice from §6.
11. Move to a hardware wallet and enable multisig with at least two signers on independent devices. Treat this as mandatory before any further privileged action, not as a follow-up.
12. Postmortem with the blameless template (§7). "The key was on a machine with weak isolation" is a finding about our system, not about a person.

### 5d. Corrupt or lost indexer / database data

1. **Check whether the chain is actually fine.** It usually is. Compare `get_stats()` on-chain with the backend. If the chain is right, this is SEV2 and users are looking at wrong numbers, not missing money.
2. **Let the indexer reorg recovery run.** On a checkpoint hash mismatch the indexer deletes `EventLog` and the projection rows above the fork, deletes the checkpoints above it, resets `IndexerCursor`, and re-projects on the next tick (`docs/DEPLOYMENT.md` §5a, `backend/src/indexer/reorg.test.ts`). Watch `indexer_reorgs_total` on `/metrics` and let it converge before touching the database.
3. **Rebuild rather than restore when the data is derived.** Set `INDEXER_START_LEDGER` to the cursor and let the indexer replay. Restoring a dump into a database whose chain has moved forward can re-introduce the inconsistency you are trying to fix.
4. **Restore from backup only for data the chain cannot supply** — user accounts, sessions, notification preferences. Follow `docs/BACKUP.md`, and run `npm run backup:verify` against a scratch database before promoting anything.
5. **Tell users what is wrong in the UI terms:** "the amount shown on the site was wrong; your funds were never affected" is only true if you have verified `get_stats()` and the balance events. Verify it first.

---

## 6. Communication templates

### 6a. Channels and timing

| Audience | Channel | When |
| --- | --- | --- |
| Responders | Private thread / DM group | Immediately on classification, and on every severity change |
| IC, key holder, TL | Direct message, not email | Immediately for SEV1; the key holder must be *interrupted*, not cc'd |
| Users | X `@TipzApp` + GitHub Discussions | Holding statement within 30 min (SEV1) / 4 h (SEV2) |
| Affected creators | Direct, per-creator, if a named creator is impacted | Within 4 h |
| External researchers | Private advisory thread | Per `SECURITY.md` SLAs |
| Stellar ecosystem | Stellar Discord, SDF security | SEV1 always; SEV2 if it is a protocol or contract issue |

### 6b. Rules

1. **Post early, post boringly.** A holding statement that says "we are investigating" beats twenty minutes of silence.
2. **Never speculate about funds.** "We don't believe funds are at risk" is only publishable after you have checked the chain. Otherwise write "we have paused all contract operations while we investigate".
3. **Every update is timestamped in UTC** and says what changed since the last one. "Still investigating" is a valid update, but pair it with the next scheduled update time.
4. **Say what the user should do**, even if it is "wait". A reader with no action is a reader who invents one.
5. **Never include** full Stellar addresses of users, transaction details tying a username to a balance, or any secret. Log redaction is automatic in the backend; your prose is not covered by it.
6. **Do not open a public GitHub issue for a vulnerability or a live exploit.** Public issue templates exist and are not embargo-safe.

### 6c. Templates

**Internal — first acknowledgement (private channel)**

```
SEV{1-4} — {one line: what is broken}
Detected: {HH:MM UTC} by {source}
Suspected cause: {one line, or "unknown"}
Funds at risk: {yes/no/unknown — say which, and how you checked}
Action taken: {e.g. "global pause flag=4294967295, tx {hash}"}
IC: {name}  TL: {name}  Key holder: {name}
Next update: {HH:MM UTC}
```

**Holding statement — public (SEV1, within 30 minutes)**

```
We are investigating an issue affecting Stellar Tipz and have paused contract
operations as a precaution. No funds have moved as a result.

What we know so far:
- {facts only}
- {facts only}

What we don't yet know:
- {explicit unknowns}

What this means for you:
- {e.g. "Tipping and withdrawals are paused. Funds already in the contract are
  unaffected. Nothing is required from you right now."}

Next update: {time, UTC} or "within 2 hours".
```

**Investigating / identified update**

```
Update {N} — {HH:MM UTC}

Status: {investigating | cause identified | fixing | monitoring}
Since our last update: {what actually changed}
Cause: {one sentence, or "still narrowing it down"}
Impact: {who was affected, for how long, what it looked like}
Funds: {verified statement with the evidence you used}
What we're doing now: {one or two concrete actions}
What this means for you: {action or "nothing to do"}
Next update: {time, UTC}
```

**Resolution / monitoring notice**

```
Resolved — {HH:MM UTC}

The issue was {cause}. It affected {scope} between {start} and {end} (UTC).

What happened: {2-3 sentences, no jargon}
Impact: {what users experienced; be specific about amounts affected and what
happened to them}
What we changed: {the fix, in user terms}
Your funds: {the sentence you most need users to trust, and the evidence for it}
Follow-up: {postmortem link, expected date}
```

**Funds-specific notice — when money is affected**

```
Funds update — {HH:MM UTC}

{State plainly one of: "No user funds were lost." / "Some funds were lost; here
is exactly what and what we are doing." / "We do not yet know; here is what we
have verified so far."}

Verified by: {the on-chain evidence — contract, ledger, or event you checked}
If you are affected: {concrete action, with a deadline if there is one}
If you are not affected: {reassurance, still specific}
```

**GitHub Discussions post** — same content as the public notice, but lead with the postmortem link when it exists, and keep the discussion open for questions so replies stay in one place.

**Credit score / leaderboard notice (SEV2, data shown was wrong)**

```
The {credit score / leaderboard / balance} shown on the site between {start} and
{end} (UTC) was incorrect because {cause}. The data on-chain was always correct —
only our indexer was behind.

This has been fixed and the affected data has been recomputed. If your numbers
look wrong now, reply here and we will check your account individually.
```

---

## 7. Blameless postmortem

### 7a. The rules

1. **No names.** Roles, not people.
2. **No "human error."** It is not a cause. "The responder was not paged" becomes "there is no paging integration and no escalation timer", which is fixable.
3. **No hindsight.** "They should have checked X" is banned. Write what was knowable at the time, with the information available at that moment.
4. **Systems, not heroes.** The question is why the system made the wrong outcome easy, not who was brave enough to fix it.
5. **Every action item has an owner and a link.** An action item without both is a wish.
6. **The reader must be able to reproduce your reasoning.** Link the tx hash, the deploy SHA, the workflow run, the log line.

This applies to the incident itself, not just the write-up. A team that is punished for surfacing an incident will not surface the next one.

### 7b. When it is required

| Severity | Postmortem | Due |
| --- | --- | --- |
| SEV1 | Required, published | 5 business days |
| SEV2 | Required, internal | 10 business days |
| SEV3 | Optional, at the IC's discretion | — |
| SEV4 | No | — |

A SEV1 postmortem is published even if the cause is never fully determined. "We do not know, and here is what we are doing to find out" is a valid conclusion.

### 7c. Template

Copy this into `docs/postmortems/YYYY-MM-DD-<short-title>.md` and open a PR. Link the incident log.

```markdown
# Postmortem: <one-line title>

- **Incident ID:** INC-YYYYMMDD-NN
- **Severity:** SEV{n} (final, after any reclassification)
- **Started (UTC):** YYYY-MM-DDTHH:MM:SSZ
- **Detected by:** {system or channel, not a person}
- **Mitigated (UTC):** YYYY-MM-DDTHH:MM:SSZ
- **Resolved (UTC):** YYYY-MM-DDTHH:MM:SSZ
- **Duration:** {total} (detection to mitigation: {x})
- **Author / reviewers:** {roles}
- **Incident log:** {link}
- **Status:** Draft | Final

## Summary

{Three sentences: what broke, who was affected, what we did. A reader who
reads only this should not be misled.}

## Impact

- **Users affected:** {number or "unknown — and why we cannot say"}
- **Funds:** {at risk / lost / frozen, with amounts and the on-chain evidence}
- **Creators unable to withdraw:** {yes/no, for how long}
- **Requests / transactions affected:** {counts, from /metrics or logs}
- **Data affected:** {what was wrong, and whether the chain disagreed with the backend}

## Timeline

All times UTC. Include the gap between "should have been noticed" and "was
noticed" — that gap is usually the most actionable part.

| Time (UTC) | Event | Actor (role) |
| --- | --- | --- |
| HH:MM | {first signal, and what it actually said} | {system} |
| HH:MM | {severity assigned} | IC |
| HH:MM | {action, with the tx hash or deploy SHA} | {role} |
| HH:MM | {public statement posted} | Comms |
| HH:MM | {verification step completed} | {role} |

## On-chain state at the time

{For contract incidents. This is the part nobody can reconstruct later.}

- Contract ID: `{C...}`
- Network: {testnet | pubnet}
- `get_version` at detection: {n} — expected: {n}
- Pause flags at detection: {Tips/Withdrawals/Registration/Subscriptions/Refunds, or "not paused"}
- `get_paused_at`: {timestamp or null}
- Multisig enabled: {yes(threshold n) | no}
- Unexpected `get_admin_audit_history` entries: {tx hashes, or "none in the last 100"}
- Circuit breaker status: {output}
- Unexpected WASM upgrade: {yes(hash) | no}

## What happened

{The technical narrative. Explain the mechanism, not the fix.}

## What went well

{Specific, and about the system where possible: "the pause flag design meant we
could stop fund movement in one transaction with no deploy" — not "the responder
was great".}

## What went badly

{Specific and system-level. For each, ask what made it easy to do the wrong
thing. Note every point where the runbook was wrong, missing, or misleading —
those are the highest-value findings in this document.}

## Where we got lucky

{Near-misses. This section is how you find the SEV1 that did not happen.}

## Action items

| # | Action | Type | Owner (role) | Link | Due |
| --- | --- | --- | --- | --- | --- |
| 1 | {specific, verifiable change} | {Fix / Detect / Prevent / Document} | {role} | {issue/PR} | {date} |

Every item needs an owner and a link. "Improve monitoring" is not an action item;
"alert when `indexer_lag` exceeds 20 ledgers, wired to the on-call webhook" is.

## Follow-up on this postmortem

Revisit {date}, after the action items have had time to land. Note which items
shipped, which were closed without shipping, and what the metric looks like now.
```

### 7d. Platform-specific questions the postmortem must answer

- Which `PauseFlag` was set, by whom, and how long was it live? Was `PausedAt` stamped — and if not, did that reset the 7-day emergency-withdrawal clock?
- Did the pause work on the first attempt? If it reverted, what was the error (`MultisigRequired`, `NotAuthorized`, an unknown flag that silently no-op'd)?
- Did the automated rollback fire, and did it actually roll back the right thing?
- Did the operator have to guess? Name every command in this runbook that was wrong, ambiguous, or missing, and fix it in the same PR as the postmortem.
- For key incidents: why was the key where it was, and what would have to change for it to be somewhere safer?

---

## 8. Known gaps

These are open as of this commit. Each one is an incident waiting to happen, and each needs an issue before mainnet.

| Gap | Incident impact | Suggested fix |
| --- | --- | --- |
| **No admin revocation.** `set_admin` always returns `NotAuthorized`; a lost admin key is unrecoverable (§5c-1). | A single stolen key ends the contract. | Add a timelocked admin-change path callable without the current admin (e.g. a guardian address), and a timelock on `execute_upgrade`. |
| **`propose_upgrade` + `execute_upgrade` have no timelock.** | A compromised admin replaces the WASM in two transactions. | Require a delay between propose and execute, mirroring `ADMIN_CHANGE_TIMELOCK_SECS`. |
| **No known-good WASM pin.** | Rolling back a bad upgrade depends on a 30-day Actions artifact being present. | Pin the current WASM hash and its source tag in the repo and in this runbook after every release. |
| **`scripts/verify-deployment.ts` checks `/health` on the Vercel frontend host**, which has no API rewrite. | A green deploy can hide a dead backend. | Point the health check at the backend origin and assert on the JSON body, not on HTTP 200. |
| **The backend admin pause API targets `pause_contract` / `unpause_contract`** (`backend/src/modules/admin/config.service.ts:371-376`), which are not contract entrypoints. The real ones are `pause` / `unpause` with a `flag`. | The admin UI's pause button cannot work. | Update the backend to call `pause` / `unpause` with the flag, and add an `is_paused` read so the UI can show the current state. |
| **No frontend kill switch or maintenance banner**, though `docs/DEPLOYMENT.md` §7 assumes one. | During an incident the only way to stop users transacting is a code change and a deploy. | Add a remote-config kill switch read at app start. |
| **No public `get_admin()`** entrypoint. | You cannot confirm off-chain which address holds admin; you find out when a call returns `NotAuthorized`. | Expose a read-only admin getter. |
| **A pause is not an admin control.** Admin entrypoints — `set_fee_collector`, `add_accepted_token` / `remove_accepted_token`, `verify_domain`, `cleanup_inactive_profiles`, `set_domain_reverify_interval` — are not gated by any `PauseFlag`, so they keep working while the contract is globally paused. Goal tracking (`set_goal`, `cancel_goal`) is likewise ungated. | A pause does not stop a compromised admin, and is not a complete stop. | Audit every state-changing entrypoint against the pause check, document the exceptions, and add a separate kill switch for admin actions. |
| **No CLI examples for the privileged entrypoints.** Nothing in the repo invokes `pause`, `unpause`, `propose_upgrade`, `execute_upgrade`, or `migrate`; §5a is the first. | Operators guess argument names under pressure. | Add these to `scripts/` as documented, `--dry-run`-able helpers. |
| **No on-call rotation, no paging integration** beyond `BACKUP_ALERT_WEBHOOK_URL`, empty key-holder table in §4b. | A SEV1 can sit undetected until a user complains. | Fill §4b, wire the webhook to a real pager. |
| **`.github/health-metrics/uptime.csv` has a header and no rows**, and no producer. | Looks like monitoring exists. It does not. | Write it from a scheduled job or delete it. |
| **`lighthouse.yml`'s only job is disabled** (`if: false`). | A gate that appears to run but never does. | Enable it or remove the workflow. |
| **The PGP key in `SECURITY.md` is a placeholder** (`0xEXAMPLE`). | Sensitive reports cannot be encrypted as documented. | Publish a real key or remove the claim. |

---

## 9. Quick reference card

Print this. Contract ID, key name, and network are the only things you must supply.

```bash
# 0. Pin
export NETWORK=testnet
export CONTRACT_ID=C...
export ADMIN_KEY=tipz-admin
export ADMIN_ADDR=$(soroban keys address "$ADMIN_KEY")
export BACKEND_URL=https://...        # backend origin, not the Vercel frontend host

# 1. Read the state before you change it
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_version
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_multisig_config
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_admin_audit_history --limit 20 --offset 0

# 2. PAUSE EVERYTHING (flags: 1 tips, 2 withdrawals, 4 registration, 8 subscriptions, 16 refunds)
soroban contract invoke --id "$CONTRACT_ID" --source "$ADMIN_KEY" --network "$NETWORK" \
  -- pause --caller "$ADMIN_ADDR" --flag 4294967295

# 3. VERIFY — a wrong flag succeeds and pauses nothing
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1   # must be true
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- get_paused_at

# 4. SAY SOMETHING (30 min, SEV1) — §6c holding statement

# 5. INVESTIGATE — §3b three questions

# 6. UNPAUSE (IC approval + reason in the incident log)
soroban contract invoke --id "$CONTRACT_ID" --source "$ADMIN_KEY" --network "$NETWORK" \
  -- unpause --caller "$ADMIN_ADDR" --flag 4294967295
soroban contract invoke --id "$CONTRACT_ID" --network "$NETWORK" -- is_paused --flag 1  # must be false

# Backend health, by hand — the CI check does not cover this
curl -sS "$BACKEND_URL/health/ready"
```

**Three rules that matter more than the commands:**

1. Pause before you understand, if money is moving.
2. Verify the pause actually paused something.
3. A global pause is only lifted by `unpause --flag 4294967295`.

---

## 10. Drills

An untested runbook is a guess. Run these on testnet, quarterly, and after any change to the pause mechanism, the deploy pipeline, or the key inventory.

| Drill | How | Pass criteria |
| --- | --- | --- |
| **Pause and unpause** | Global pause on testnet, verify all five flags, unpause, verify `false`. Time it with a stopwatch. | Under 5 minutes end to end, from a cold shell, by someone who did not write this document. |
| **Granular footguns** | Attempt `unpause --flag 1` after a global pause. Attempt `pause --flag 7`. | Both behave exactly as [§5a's footgun list](#footguns-in-the-pause-mechanism) describes. If either surprises you, the contract changed — update this document in the same PR. |
| **Frontend rollback** | Break the frontend, run `npx vercel rollback`, then run the manual `curl` health check. | Rollback completes and the backend check still tells you the truth. |
| **Key rotation** | Rotate `JWT_SECRET` using the `JWT_SECRETS` map and a new `kid`. | Sessions invalidate cleanly; no user-facing error storm. |
| **Comms** | Write the holding statement for a fictional SEV1 in under 10 minutes. | It contains no speculation about funds, and states what users should do. |
| **Postmortem** | Run a blameless postmortem for a SEV3 that already happened. | The action items all have owners and links. |

Record drill results in the repository alongside this document, and open an issue for anything the drill exposed. A drill that finds a problem is a successful drill.

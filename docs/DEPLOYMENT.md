# Deployment Guide

> How to deploy the Stellar Tipz contract and frontend to Testnet and Mainnet.

---

## Prerequisites

- Soroban CLI installed (`soroban --version` → 21.0+)
- Rust + `wasm32-unknown-unknown` target
- A funded Stellar account (Testnet: use Friendbot; Mainnet: real XLM)
- Node.js 18+ (for frontend)
- Vercel CLI (optional, for frontend deployment)

---

## Pre-Deployment Checklist

Complete **before** any deployment (and re-verify before mainnet):

**Security**
- [ ] `cargo test` passes for the contract (`contracts/tipz`)
- [ ] `cargo fmt --check` and `cargo clippy -- -D warnings` are clean
- [ ] For mainnet: third-party security audit completed and findings resolved
- [ ] Admin key custody decided (hardware wallet or multisig for mainnet)
- [ ] Fee basis points reviewed and within the contract cap (≤ 1000 bps / 10%)

**Testing**
- [ ] Full happy path exercised on testnet (register → tip → withdraw)
- [ ] Edge cases verified (dust withdrawal fee, overflow, unregistered profile)
- [ ] Frontend smoke-tested against the deployed testnet contract

**Resource / cost estimates**
- [ ] Wasm built in `--release` and (for mainnet) `soroban contract optimize` run
- [ ] Deploy + `initialize` resource fees estimated with `--sim` / dry-run
- [ ] Deployer account funded with enough XLM for deploy **and** storage rent
- [ ] Storage TTL strategy understood (see `docs/adr/ADR-004-storage-strategy.md`)

## Environment Configuration per Network

| Setting | Testnet | Mainnet |
|---------|---------|---------|
| `VITE_NETWORK` / `REACT_APP_NETWORK` | `TESTNET` | `PUBLIC` |
| Network passphrase | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| Soroban RPC URL | `https://soroban-testnet.stellar.org` | a mainnet RPC provider |
| Native XLM SAC (`--native_token`) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | resolve via `soroban contract id asset --asset native --network mainnet` |
| Deployer funding | Friendbot | real XLM |
| Admin key | dev keypair | hardware wallet / multisig |

---

## 1. Contract Deployment

### Build the Wasm Binary

```bash
cd contracts

# Run tests first
cargo test

# Build optimized release binary
cargo build --target wasm32-unknown-unknown --release

# The Wasm file will be at:
# target/wasm32-unknown-unknown/release/tipz.wasm
```

### Deploy to Testnet

```bash
# Generate a deploy key (one time)
soroban keys generate tipz-deployer --network testnet

# Fund it via Friendbot
curl "https://friendbot.stellar.org?addr=$(soroban keys address tipz-deployer)"

# Deploy
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tipz.wasm \
  --source tipz-deployer \
  --network testnet

# Save the contract ID! Example output:
# CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

### Initialize the Contract

```bash
CONTRACT_ID="<your-contract-id>"
DEPLOYER_ADDR="$(soroban keys address tipz-deployer)"

# Resolve the native XLM SAC address for testnet:
NATIVE_TOKEN=$(stellar contract id asset --asset native --network testnet)
# Testnet default: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

soroban contract invoke \
  --id $CONTRACT_ID \
  --source tipz-deployer \
  --network testnet \
  -- \
  initialize \
  --admin $DEPLOYER_ADDR \
  --fee_collector $DEPLOYER_ADDR \
  --fee_bps 200 \
  --native_token $NATIVE_TOKEN
```

### Verify Deployment

```bash
# Check contract stats
soroban contract invoke \
  --id $CONTRACT_ID \
  --source tipz-deployer \
  --network testnet \
  -- \
  get_stats
```

---

## 2. Frontend Deployment

### Environment Setup

Create `frontend-scaffold/.env`:

```env
CONTRACT_ID=<deployed-contract-id>
REACT_APP_NETWORK=TESTNET
```

### Build

```bash
cd frontend-scaffold
npm install --legacy-peer-deps
npm run build
```

The production build will be in `frontend-scaffold/build/`.

### Deploy to Vercel

The repo includes a `vercel.json` at the root:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (from repo root)
vercel

# Or deploy to production
vercel --prod
```

Vercel configuration in `vercel.json` handles:
- Build command: `cd frontend-scaffold && npm install --legacy-peer-deps && npm run build`
- Output directory: `frontend-scaffold/build`
- SPA rewrites: all routes → `index.html`

### Deploy via Docker (Alternative)

```bash
cd frontend-scaffold

# Build image
docker build -t stellar-tipz-frontend .

# Run locally
docker run -p 8080:80 stellar-tipz-frontend
```

---

## 3. Frontend Error and Performance Monitoring

Production observability for the frontend uses **Sentry** to capture, deduplicate, and correlate errors with backend activity. This section covers setup, configuration, and operation.

### 3a. Sentry Setup

1. **Create a Sentry project** at https://sentry.io
   - Project name: `stellar-tipz-frontend`
   - Platform: `React`
   - Alert threshold: 10 errors per minute (adjustable)

2. **Capture your DSN** (Data Source Name) — looks like `https://<key>@<org>.ingest.sentry.io/<project-id>`

3. **Add to deployment environment**:
   ```env
   # frontend-scaffold/.env or Vercel environment variables
   VITE_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project-id>
   ```

   If `VITE_SENTRY_DSN` is not set, Sentry is disabled and errors are only logged locally.

### 3b. Source Maps & Release Tracking

**Why this matters:** Stack traces in production are minified and unreadable without source maps. The integration automatically uploads them on build.

1. **Build configuration**
   - `frontend-scaffold/vite.config.ts` already sets `sourcemap: true` in the production build
   - Git commit SHA is injected via `VITE_GIT_COMMIT` (set by CI/CD or build environment)
   - Release version is derived from `package.json` + git commit, e.g., `stellar-tipz@0.1.0+abc1234`

2. **Upload source maps to Sentry** (recommended for Mainnet)
   ```bash
   # Install Sentry CLI
   npm install -g @sentry/cli

   # After building (npm run build)
   sentry-cli releases files upload-sourcemaps \
     --org <org> \
     --project stellar-tipz-frontend \
     ./build/assets
   ```

   For CI/CD (GitHub Actions, etc.), automate this step after a production build.

3. **Vercel integration** (easiest path for Vercel deployments)
   - Connect your Sentry project to Vercel in Vercel dashboard
   - Sentry automatically uploads source maps on every deploy

### 3c. Frontend-to-Backend Request Correlation

**This is the highest-value part:** Errors are tagged with a `request_id` that matches the backend request, enabling a complete trace from user action → frontend error → backend logs.

**How it works:**

1. **Backend** generates a unique `x-request-id` header for every request (set by `requestId` middleware in `backend/src/common/middleware/requestId.ts`)
2. **Frontend API client** (`frontend-scaffold/src/services/api/client.ts`) extracts the `x-request-id` response header
3. **Sentry context** is updated with `setRequestId(requestId)`, attaching the ID to all subsequent errors
4. **Error events** in Sentry include the `request_id` tag, linking frontend and backend traces

**Example trace:**
```
User clicks "Tip" button
  → Frontend error: TypeError in tipping service
    → Error event includes request_id: "a1b2c3d4-e5f6-7890..."
    → Backend logs for x-request-id: a1b2c3d4-e5f6-7890...
      → Full stack: database query, contract interaction, response
```

### 3d. PII Scrubbing

Sentry automatically scrubs **Personally Identifiable Information** before transmission:

- **Stellar addresses** (56-char G/C/S keys) → `[REDACTED]`
- **Private keys** (64+ hex chars) → `[REDACTED]`
- **Email addresses** → `[REDACTED]`
- **Phone numbers** → `[REDACTED]`
- **Sensitive keys** (password, token, secret, apiKey, privateKey) → `[REDACTED]`

All error messages, stack traces, breadcrumbs, and tags are automatically scrubbed via the `beforeSend` hook in `frontend-scaffold/src/services/sentry.ts`.

**Verify scrubbing:**
- Look at a captured error in Sentry dashboard
- Breadcrumbs, tags, and exception messages should not contain full addresses or keys

### 3e. Sampling & Cost Control

The frontend uses **distributed sampling** to balance observability with cost:

- **Traces:** 10% of page loads generate a full performance trace (detects slow interactions, API latency)
- **Profiles:** 10% of transactions include profiling data (optional, provides CPU/memory details)
- **Error events:** 100% captured and deduplicated (duplicates → 1 fingerprint in Sentry)

**Adjust sampling** in `frontend-scaffold/src/services/sentry.ts` if cost or quota is an issue:

```typescript
tracesSampleRate: 0.05,  // 5% instead of 10%
profilesSampleRate: 0.05,
```

### 3f. Route & Navigation Tracking

Every route change is captured as a breadcrumb with the route path and query parameters:

- Enables filtering errors by page (e.g., "Errors on `/profiles/:username`")
- Helps reproduce issues with exact user navigation flow
- Automatically integrated via `useSentryRouteTracking()` hook in `App.tsx`

### 3g. Monitoring Checklist

Before production rollout:

- [ ] `VITE_SENTRY_DSN` configured in all deployment environments
- [ ] Source maps uploaded to Sentry (test with a minified error on staging)
- [ ] Backend `x-request-id` header present in all API responses (verify via browser DevTools)
- [ ] One test error event captured and visible in Sentry dashboard
- [ ] Scrubbing verified: test event contains no full addresses, keys, or PII
- [ ] Sampling configured appropriately for your error volume
- [ ] Team has access to Sentry project and knows how to filter/search errors

### 3h. Troubleshooting

**Errors not appearing in Sentry:**
- Check `VITE_SENTRY_DSN` is set and valid
- Check browser console for Sentry initialization errors
- In DevTools Network tab, look for `https://<org>.ingest.sentry.io/...` requests

**Source maps not working (stack traces still minified):**
- Confirm `sourcemap: true` in `vite.config.ts` build config
- Upload source maps via `sentry-cli` or Vercel integration
- Verify map files are in `build/assets/` and have corresponding `.map` extensions

**PII not being scrubbed:**
- Update PII patterns in `beforeSend` hook if new formats are discovered
- Test in staging by intentionally logging sensitive data and checking Sentry

**High error volume or quota exceeded:**
- Adjust `tracesSampleRate` lower (e.g., 0.05 for 5%)
- Enable server-side filtering in Sentry project settings to ignore non-critical errors
- Use `ignoreErrors` configuration to skip known harmless errors

---

## 4. Mainnet Deployment (Future)

> ⚠️ Mainnet deployment requires a security audit first.

### Additional Steps for Mainnet

1. **Security audit** — Third-party audit of the Soroban contract
2. **Config changes**:
   - Update `REACT_APP_NETWORK=PUBLIC`
   - Update RPC URL to mainnet
   - Update network passphrase to `Public Global Stellar Network ; September 2015`
3. **Real XLM** — Deployer account needs real XLM for deployment
4. **Admin key security** — Use a hardware wallet or multisig for the admin key
5. **Monitoring** — Set up event monitoring and alerting

---

## 5. Database migration rollback runbook

Database migrations are forward-only in Prisma, so rollback is an incident
procedure rather than `prisma migrate down`.

1. Stop application deploys and pause workers that write to the affected
  tables. Record the current migration name with `npx prisma migrate status`.
2. Assess whether the newest migration has a sibling `down.sql`. Review it
  before execution; down SQL must be specific to that migration and must not
  contain an unbounded data rewrite.
3. Take or verify a database snapshot, then rehearse the down SQL against a
  restored copy. On the production database, execute it using the approved
  change-control connection, for example:

  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f backend/prisma/migrations/<migration>/down.sql
  ```

4. Deploy the compatible application version, run health checks, and verify
  `npx prisma migrate status` plus the affected API workflows. Do not edit the
  `_prisma_migrations` history by hand; record the rollback and follow-up
  forward migration in the incident log.

Some migrations are intentionally irreversible. If data has already been
 dropped, a down SQL file cannot reconstruct it. Restore the last known-good
 snapshot to an isolated database, validate it, promote it according to the
 disaster-recovery procedure, and replay only verified writes captured after
 the snapshot. Treat the migration as failed, preserve the failed database for
 forensics, and create a new forward migration after recovery. The CI
 `migration-safety` job requires an explicit `.irreversible` marker for this
 case and still requires the destructive-operation acknowledgement.

The pull-request CI rehearses the newest migration against a seeded PostgreSQL
16 database: it applies the complete history, runs the Prisma seed, executes
the newest `down.sql`, and verifies that the database schema changed.

## 5a. Chain finality & indexer reorg handling (issue #1257)

**Finality policy.** Stellar reaches agreement through SCP: a ledger is either
*externalized* (final) or it is not — there is no probabilistic confirmation
and deep reorgs of externalized ledgers do not occur in normal operation. The
indexer nonetheless keeps a small confirmation buffer so a transient RPC-level
inconsistency (a node briefly serving an un-externalized candidate, a
load-balanced RPC pool momentarily disagreeing) can never reach a projection.

- `INDEXER_FINALITY_DEPTH` (default **10** ledgers, ~50s): the poll loop only
  projects events at ledgers `<= head - INDEXER_FINALITY_DEPTH`. Events past
  that boundary are left for a later tick. Set to `0` to process at head
  (not recommended for production).
- `INDEXER_REORG_LOOKBACK` (default **64**): how many recently-processed
  `(ledger, hash)` pairs are retained in `LedgerCheckpoint` for detection.
  Keep it well above `INDEXER_FINALITY_DEPTH`.

**Detection.** After each successful tick the indexer records the ledger hash
of the highest ledger it processed (`LedgerCheckpoint`, keyed by
`topic + ledger`). At the start of every tick it re-fetches the current hash
of its most recent checkpoints from Horizon and compares. A mismatch means
the chain history under a ledger we already projected has changed — a reorg.

**Recovery.** On detection the indexer:

1. Walks its checkpoints newest→oldest to find the **fork ledger** — the
   highest ledger whose stored hash still matches the chain.
2. In a single transaction: deletes `EventLog` and ledger-stamped projection
   rows (`Tip`, and `Refund` by cascade) above the fork ledger, deletes
   `LedgerCheckpoint` rows above it, and resets `IndexerCursor` to the fork
   ledger.
3. Logs at `error` and increments the `indexer_reorgs_total` signal
   (`monitor.noteReorg`) so alerting fires — a reorg is always page-worthy,
   even when recovery succeeds.
4. Returns; the next tick re-reads from `forkLedger + 1` and re-projects the
   canonical events. Projections keyed deterministically (`Goal`,
   `Subscription`, `CreditScore`, …) self-heal on re-projection; only the
   ledger-stamped tables need explicit deletion.

Because `INDEXER_FINALITY_DEPTH > 0`, a reorg shallower than the finality
depth is corrected **before any projection happened** — detection there just
resets the checkpoint window. The rollback path only runs for the
(operationally near-impossible) case of a reorg deeper than the finality
buffer.

Tests: `backend/src/indexer/reorg.test.ts` drives fixtures simulating reorgs
at depths 1, 5, and 15 (below, at, and beyond the finality depth).

## 7. Helper Scripts

Located in `scripts/`:

### `deploy-testnet.sh`

Fully automated testnet deployment — builds, deploys, and initializes the
contract in one step.

```bash
# Deploy with the pre-built wasm (default):
./scripts/deploy-testnet.sh

# Build the contract first, then deploy:
./scripts/deploy-testnet.sh --build

# Use an optimized wasm (run `soroban contract optimize` first):
./scripts/deploy-testnet.sh --optimized

# Validate inputs and wasm path without actually deploying:
./scripts/deploy-testnet.sh --dry-run

# Use a custom key name (defaults to "tipz-deployer"):
./scripts/deploy-testnet.sh my-key-name

# Override the native XLM SAC address via env var:
NATIVE_TOKEN_ID=<SAC_ADDRESS> ./scripts/deploy-testnet.sh
```

The script automatically funds the deployer account via Friendbot and calls
`initialize` with `--native_token` set to the testnet XLM SAC address
(`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` by default,
overrideable via the `NATIVE_TOKEN_ID` environment variable).

### `fund-account.sh`

Fund a testnet account:

```bash
./scripts/fund-account.sh <PUBLIC_KEY>
```

### `generate-bindings.sh`

Generate TypeScript bindings from the deployed contract:

```bash
./scripts/generate-bindings.sh <CONTRACT_ID>
```

---

## 6. Post-Deployment Checklist

- [ ] Contract deployed and initialized
- [ ] `get_stats()` returns expected initial values
- [ ] Test `register_profile()` with a test account
- [ ] Test `send_tip()` between two test accounts
- [ ] Test `withdraw_tips()` and verify fee deduction
- [ ] Frontend `.env` updated with contract ID
- [ ] Frontend builds successfully
- [ ] Frontend deployed and accessible
- [ ] Freighter wallet connects on deployed frontend
- [ ] End-to-end happy path works (register → tip → withdraw)

---

## 7. Emergency Procedures and Rollback

> **For anything that is actually happening right now, use [`docs/INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md).**
> It supersedes this section: it has severity definitions, escalation paths, exact
> pause commands, rollback procedures, key-compromise handling, user-facing
> communication templates, and the postmortem template. The summary below is
> orientation only — in particular, the pause commands in §5a of the runbook
> carry a required `flag` argument that the lines below omit.

### Contract pause (first response)

The contract supports an admin **pause** that blocks state-changing entry
points (tips, withdrawals) while reads stay available. On a suspected exploit or
critical bug:

1. As admin, call the contract's `pause(caller, flag)` to halt the affected
   operations — `flag` is required and selects which operations stop
   (see `admin.rs` and the runbook §5a).
2. Communicate status to users (social / Discussions) — there is no maintenance
   banner in the frontend yet (runbook §8).
3. Investigate with on-chain events and logs before resuming.
4. Call `unpause(caller, flag)` only once the issue is understood and mitigated.
   A global pause is only lifted by `unpause(caller, 4294967295)`.

### Frontend rollback

The frontend is immutable per deployment, so rollback is instant:

```bash
# List recent deployments and promote a known-good one
vercel ls
vercel promote <previous-deployment-url>
# or, in the Vercel dashboard: Deployments → previous → "Promote to Production"
```

If the issue is purely a bad `VITE_CONTRACT_ID`/network value, fix the env var
and redeploy rather than rolling back code.

### Contract upgrade vs. redeploy

- **Upgrade (preferred):** the contract is upgradeable (`ContractVersion` is
  bumped on upgrade). Ship a fixed Wasm via `soroban contract install` +
  the admin-gated upgrade path; storage and the contract ID are preserved.
- **Redeploy (last resort):** if state is corrupt or the ID must change, deploy
  a fresh contract, migrate/re-initialize required state, then point the
  frontend at the new contract ID. There is no automatic state migration — plan
  it explicitly.

### Key compromise

If the admin key is compromised, there is **no admin revocation path**:
`set_admin` always returns `NotAuthorized`, and rotating the admin requires
`propose_admin_change` (48 h timelock) plus confirmation by the *new* admin —
neither of which the current admin's key can be forced through after it is
lost. Assume the contract is attacker-controlled, rotate every off-chain secret
first, and work the redeploy path. See runbook §5c.

### Post-incident

- [ ] Root cause documented (consider a new `docs/adr/` entry if architectural)
- [ ] Regression test added under `contracts/tipz/src/test`
- [ ] Fix deployed and verified against the post-deployment checklist above

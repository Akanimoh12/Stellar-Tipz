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

## 3. Mainnet Deployment (Future)

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

## 4. Database migration rollback runbook

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

## 4a. Chain finality & indexer reorg handling (issue #1257)

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

## 5. Helper Scripts

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

## 5. Post-Deployment Checklist

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

## 6. Emergency Procedures and Rollback

### Contract pause (first response)

The contract supports an admin **pause** that blocks state-changing entry
points (tips, withdrawals) while reads stay available. On a suspected exploit or
critical bug:

1. As admin, call the contract's `pause` (see `admin.rs`) to halt mutations.
2. Communicate status to users (status page / social) — the frontend should
   surface a maintenance banner.
3. Investigate with on-chain events and logs before resuming.
4. Call `unpause` only once the issue is understood and mitigated.

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

If the admin key is compromised: pause immediately, transfer admin to a new
secure key (hardware wallet / multisig) via the admin-transfer path, rotate any
related operational secrets, and post-mortem before unpausing.

### Post-incident

- [ ] Root cause documented (consider a new `docs/adr/` entry if architectural)
- [ ] Regression test added under `contracts/tipz/src/test`
- [ ] Fix deployed and verified against the post-deployment checklist above

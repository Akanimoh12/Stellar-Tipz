# Stellar Tipz — Backend

[![Contributing Guide](https://img.shields.io/badge/Contributing-Backend%20Guide-0e8a16?style=flat-square)](docs/BACKEND_CONTRIBUTING.md)
[![Base branch](https://img.shields.io/badge/PR%20target-test--implement--drips-1d76db?style=flat-square)](../../tree/test-implement-drips)

The off-chain, real-time backend for Stellar Tipz. It provides the REST API, an
on-chain **indexer** that mirrors Soroban contract events into PostgreSQL, credit
scoring, X (Twitter) integration, notifications, and a WebSocket layer for live updates.

## Want to contribute?

> **All backend PRs must target `test-implement-drips` — not `main`.**
> Branch off `test-implement-drips`, implement one issue per PR, and open your pull
> request back into `test-implement-drips`.

Read the full workflow in **[docs/BACKEND_CONTRIBUTING.md](docs/BACKEND_CONTRIBUTING.md)**.
It covers the definition of done, module conventions, and local verification steps.

### How to claim an issue

1. **Find a task** — browse open issues labelled [`backend`](https://github.com/Akanimoh12/Stellar-Tipz/labels/backend). Each issue is atomic and lists acceptance criteria plus file hints.
2. **Comment to claim it** — leave a short comment on the issue (for example: _"I'd like to work on this"_). Wait for a maintainer to assign you so two contributors don't start the same work.
3. **Branch off `test-implement-drips`:**
   ```bash
   git checkout test-implement-drips
   git pull
   git checkout -b feat/<short-name>-<issue-number>
   ```
4. **Implement, verify, and open a PR against `test-implement-drips`** — reference the issue (`Closes #123`) and run:
   ```bash
   cd backend
   npm run typecheck && npm run lint && npm run test
   ```

---

## Testing

Stellar Tipz uses a **two-layer testing strategy** to balance speed and confidence:

### Unit Tests (Fast, Mocked)

Unit tests use heavy mocking (Prisma, external services) for fast feedback during development.  
They verify business logic, validation, error handling, and HTTP contracts.

```bash
npm run test           # Run all unit tests
npm run test:watch     # Watch mode for development
npm run test:coverage  # Generate coverage report
```

**When to use:** TDD, refactoring, quick validation of business logic changes.

### Integration Tests (Real Database)

Integration tests run against a **real Postgres instance** to catch issues that mocks cannot detect:
- **Constraint violations** (unique, foreign key, check constraints)
- **Transaction bugs** (deadlocks, isolation issues)
- **Migration drift** (schema changes that break existing code)
- **Concurrent operations** (race conditions, P2002 handling)

```bash
# Start test database (isolated from dev DB)
npm run test:db:up

# Run integration tests
npm run test:integration

# Watch mode for integration tests
npm run test:integration:watch

# Stop test database
npm run test:db:down

# Reset test database (clean slate)
npm run test:db:reset
```

**Test database:** Runs on port `5433` (different from dev DB on `5432`) to avoid conflicts.  
Each test runs in **isolation** — the database is cleaned before every test.

**Critical flows covered:**
- Auth: challenge creation, user registration, token lifecycle
- Tips: recording with P2002 handling, user relations, status transitions
- Refunds: unique constraint enforcement, concurrent request handling (#1249)
- Withdrawals: balance calculations, duplicate prevention, cascade deletes

### CI Behavior

Both test suites run in parallel on every PR:
- **Unit tests:** Fast feedback (< 1 minute)
- **Integration tests:** Real Postgres via GitHub service containers, migrations applied  
  to verify schema validity before deploy

See `.github/workflows/backend-integration-tests.yml` for CI configuration.

### Migration Validation

Integration tests apply migrations at suite start — **this is a major win by itself**.  
If a migration is broken, CI fails before the code reaches production.

---

## Tech stack

| Concern        | Choice                               |
| -------------- | ------------------------------------ |
| Language       | TypeScript (Node.js ≥ 20, ESM)       |
| HTTP framework | Express                              |
| ORM / DB       | Prisma + PostgreSQL                  |
| Cache / queues | Redis + BullMQ                       |
| Realtime       | Socket.IO                            |
| Chain access   | `@stellar/stellar-sdk` (Soroban RPC) |
| Validation     | Zod                                  |
| Logging        | Pino                                 |
| Tests          | Vitest + Supertest                   |

---

## Quick start

```bash
# 1. From the repo root, switch to the working branch
git checkout test-implement-drips

# 2. Start Postgres + Redis
docker compose up -d postgres redis

# 3. Install deps
cd backend
npm install

# 4. Configure env
cp .env.example .env   # then fill in values

# 5. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 6. (Optional) Seed realistic development data
npm run db:seed

# 7. Run the dev server
npm run dev
# → http://localhost:4000/health
```

---

## Seeding the database

`npm run db:seed` runs [`prisma/seed.ts`](prisma/seed.ts), which populates every
table with **realistic, deterministic** data: creators and tippers with varied
credit-score signals, a skewed tip distribution (a few whales, a long tail),
streaks, goals, subscriptions in every lifecycle state, webhook subscriptions and
deliveries, notifications, leaderboard snapshots, analytics rollups, and ops tables.

```bash
npm run db:seed                      # default: scale "small", seed "stellar-tipz"
SEED_SCALE=medium npm run db:seed    # more volume
SEED_SCALE=large  npm run db:seed    # performance-testing scale (tens of thousands of tips)
```

### Configuration

All options are environment variables:

| Variable               | Default         | Purpose                                                                 |
| ---------------------- | --------------- | ----------------------------------------------------------------------- |
| `SEED`                 | `stellar-tipz`  | Random seed. The **same value always produces the same database**.      |
| `SEED_SCALE`           | `small`         | Volume preset: `small`, `medium`, `large`, or `xl`.                     |
| `SEED_USERS`           | _(unset)_       | Override the user count directly; other volumes scale from it.          |
| `SEED_CLEAN`           | `true`          | Wipe all tables first. Set `false` to append.                           |
| `SEED_DRY_RUN`         | `false`         | Generate **in memory only** and verify integrity — no database needed.  |
| `SEED_ALLOW_PRODUCTION`| `false`         | Required to run with `NODE_ENV=production` (the seed refuses otherwise). |

Approximate volumes per scale:

| Scale    | Users   | Tips      | Use case                              |
| -------- | ------- | --------- | ------------------------------------- |
| `small`  | ~25     | ~150      | Everyday local UI work                |
| `medium` | ~200    | ~1.5 k    | Lists, pagination, leaderboards       |
| `large`  | ~2 k    | ~10 k     | Performance testing (#101, #118)      |
| `xl`     | ~10 k   | ~65 k     | Stress testing                        |

### Determinism

Seeding is **fully deterministic**: it uses a single seeded PRNG (no `Math.random`,
no `faker`, no `cuid()`) and anchors all timestamps to a fixed instant, so a given
`SEED` always yields byte-identical rows — including primary keys and dates. When a
bug reproduces only with seeded data, share the exact command and anyone can recreate
the dataset:

```bash
SEED="my-repro-case" SEED_SCALE="medium" npm run db:seed
```

### Edge cases included

The dataset always contains, regardless of scale or seed:

- **Zero-tip creator** (`usr_zero_tip`) — a creator who has never sent or received a tip.
- **Maximum-length fields** (`usr_maxlen`) — long username, display name, bio, tip
  message, and goal title, to surface UI truncation/overflow bugs.
- **Expired items** — expired goals, subscriptions, refresh tokens, and auth challenges.
- **Every lifecycle state** — goals, subscriptions (incl. `PAST_DUE`/`FAILED` dunning),
  tips (incl. `REFUNDED`), and webhook deliveries each appear in all of their statuses.
- **Anti-gaming signals** — self-tips and circular "wash" tips.

Credit scores are derived by the credit module from these signals (total confirmed
tips received, account age, streak, and X metrics), so the spread of signals produces
a realistic spread of scores.

### Verifying without a database

`SEED_DRY_RUN=true` runs the entire generator against an in-memory recorder and
asserts referential integrity (unique primary keys, valid foreign keys, edge-case
presence). It needs **no Postgres**, so it is ideal for CI or a quick sanity check:

```bash
SEED_DRY_RUN=true SEED_SCALE=large npm run db:seed
```

---

## Project layout

```
backend/
├── src/
│   ├── config/        # validated env + app config
│   ├── common/        # middleware, errors, utils shared across modules
│   ├── db/            # Prisma client
│   ├── modules/       # feature modules (auth, profiles, tips, credit, ...)
│   ├── indexer/       # Soroban event indexer
│   ├── jobs/          # BullMQ queues + workers
│   ├── realtime/      # Socket.IO gateway
│   ├── app.ts         # Express app assembly
│   └── server.ts      # process entry point
├── prisma/schema.prisma
├── tests/
└── docker-compose.yml
```

## Local development loop

The dev server uses [`tsx watch`](https://github.com/privatenumber/tsx) — no nodemon needed.

```bash
npm run dev          # starts tsx watch src/server.ts → http://localhost:4000/health
```

**Git hooks**

After `npm install`, Husky installs a `pre-commit` hook that runs `lint-staged` on
staged `backend/**/*.ts` files. It will auto-fix lint issues (ESLint) and apply
Prettier formatting where possible; if a file cannot be fixed automatically the
commit is blocked so you can fix it manually.

```bash
cd backend
npm install          # runs `husky` via the prepare script and installs the hook
```

To skip the hook in an emergency: `git commit --no-verify`.

**Hot reload behaviour**

| Change type             | Behaviour                                                                 |
| ----------------------- | ------------------------------------------------------------------------- |
| TypeScript source files | Automatic restart (tsx watch detects the change)                          |
| `.env` file             | **Not** auto-reloaded — restart the process manually after editing `.env` |
| `prisma/schema.prisma`  | Run `npm run prisma:generate` then restart                                |

**Port config** — set `PORT` in your `.env` (default `4000`). The value is
validated at startup via `src/config/env.ts`; the server refuses to start if
required vars are missing.

---

## Indexer backfill tooling

After fixing a projection bug, you may need to reindex a range of ledgers. A
standalone CLI reindexes an explicit ledger range idempotently **without
disrupting live indexing** — it uses its own dedicated backfill cursor and runs
in its own process.

```bash
cd backend

# Reindex the last 1,000 ledgers up to the current chain head
npm run indexer:backfill -- --from 3500000

# Reindex an explicit range
npm run indexer:backfill -- --from 3490000 --to 3501000

# See what would change without writing anything
npm run indexer:backfill -- --from 3490000 --to 3501000 --dry-run

# Ignore the stored backfill cursor and start fresh
npm run indexer:backfill -- --from 1000 --force --dry-run
```

Behaviour (issue #1259):

- **Explicit range** — `--from`/`--to` (inclusive); defaults are stored-cursor+1
  to the current chain head.
- **Non-disruptive** — uses a separate `backfill_tip_events` cursor, so it never
  touches the live indexer's progress.
- **Resumable** — re-running continues from where the last run stopped.
- **Progress** — logs periodic progress and prints a per-topic summary.
- **Dry-run** — `--dry-run` reports what would change without writing a thing.
- **Idempotent** — projections are upserts and EventLog is keyed uniquely, so
  re-running a range never double-counts.

**Convenience via Makefile**

```bash
make backend-dev      # same as npm run dev
make backend-db-up    # docker compose up (Postgres + Redis)
make backend-migrate  # run Prisma migrations
```

---

## Module conventions

Each feature module lives in `src/modules/<name>/` and typically contains:

```
<name>.routes.ts       # Express router
<name>.controller.ts   # request/response handling
<name>.service.ts      # business logic (no Express here)
<name>.schema.ts       # Zod request/response schemas
<name>.types.ts        # shared types
<name>.test.ts         # Vitest tests
```

Mount the router in `src/app.ts`. Throw `AppError` subclasses (`src/common/errors`)
for HTTP errors — the global error handler formats them.

## Metrics

Every process serves Prometheus metrics on `METRICS_HOST:METRICS_PORT`
(default `127.0.0.1:9464`): default Node.js process metrics, RED metrics per
HTTP route, and business outcomes (tips, volume, withdrawals, registrations,
subscription charges) split into user-caused and system-caused failures. The
Grafana dashboard and alert rules are in `observability/`. See
[`docs/METRICS.md`](./docs/METRICS.md).

## Contributing

Start with **[docs/BACKEND_CONTRIBUTING.md](docs/BACKEND_CONTRIBUTING.md)** — it is the
canonical guide for claiming issues, branching, and opening PRs.

Quick reminders:

- **Comment on an issue before you start** so maintainers can assign it to you.
- **Open every backend PR against `test-implement-drips`** (never `main`).
- **One issue per PR** — keep changes small and focused.
- Issues are atomic and self-contained; each lists acceptance criteria and file hints.

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
docker compose -f backend/docker-compose.yml up -d

# 3. Install deps
cd backend
npm install

# 4. Configure env
cp .env.example .env   # then fill in values

# 5. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 6. Run the dev server
npm run dev
# → http://localhost:4000/health
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

**Convenience via Makefile**

```bash
make -C backend dev      # same as npm run dev
make -C backend db-up    # docker compose up (Postgres + Redis)
make -C backend migrate  # run Prisma migrations
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

## Contributing

Start with **[docs/BACKEND_CONTRIBUTING.md](docs/BACKEND_CONTRIBUTING.md)** — it is the
canonical guide for claiming issues, branching, and opening PRs.

Quick reminders:

- **Comment on an issue before you start** so maintainers can assign it to you.
- **Open every backend PR against `test-implement-drips`** (never `main`).
- **One issue per PR** — keep changes small and focused.
- Issues are atomic and self-contained; each lists acceptance criteria and file hints.

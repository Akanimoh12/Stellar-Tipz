# Coverage Policy

This document explains how coverage is configured, what is enforced, and how to
raise a threshold.

## How it works

Coverage is enforced by two cooperating pieces:

| Piece | File | Role |
| --- | --- | --- |
| Policy | `scripts/coverage-policy.mjs` | Declares per-module floors, tiers, and critical paths |
| Ratchet | `scripts/check-coverage.mjs` | Reads Vitest output, enforces the floors, reports uncovered critical lines |

`codecov.yml` mirrors the same intent for the hosted Codecov dashboard, but the
local ratchet is the authoritative gate because it runs even if the Codecov
upload fails.

```bash
# produce the coverage data (writes <component>/coverage/*)
cd backend && npm run test:coverage
cd frontend-scaffold && npm run test:coverage

# enforce the ratchet (also works from the repo root)
npm run coverage:check
```

## Tiers

Floors are deliberately non-uniform. Modules are grouped by the consequence of
an untested branch:

- **critical** — money movement, authentication, and authorization. Tightest
  floors and full uncovered-line reporting.
- **financial** — moves value but is not directly attacker-reachable
  (subscriptions, credit, tip accounting).
- **standard** — ordinary application logic.
- **excluded** — entrypoints, wiring, and generated code with no meaningful
  unit-test surface.

See `scripts/coverage-policy.mjs` for the floor and rationale of every module.

## Where the numbers come from

Every floor is seeded from coverage measured on commit `9f1369f`, minus a small
tolerance, so the ratchet starts from the true current state rather than an
aspiration. The committed total baselines live in `coverage-baseline.json`.

## Flakiness tolerance

Both suites currently have flaky tests, so coverage moves a little between runs.
Baseline comparisons therefore allow a small band, declared as `tolerance` in
each policy (`1.0` point for backend, `1.5` for the flakier frontend). A module
must fall more than its tolerance below baseline to be reported as `REGRESSED`.
Enforced floors are separate and keep a wider ~2 point headroom, so run-to-run
noise cannot trip them.

## Raising a floor

1. Add the tests.
2. Run `npm run test:coverage` then `npm run coverage:check` for the component.
3. Update the `floor` and `baseline` for that module in
   `scripts/coverage-policy.mjs`, and if total coverage improved, update
   `coverage-baseline.json`.

**Never lower a floor or baseline to make a build pass.** Floors only move up.

## Critical-path reporting

`scripts/check-coverage.mjs` cross-references the generated `coverage-final.json`
and lists the exact uncovered line numbers inside the critical paths. On a pull
request this is posted as a comment and included in the job's step summary.

## Known gaps

Two modules are pinned to a deliberately low floor and flagged `knownGap` in the
policy:

| Component | Module | Measured | Floor | Why |
| --- | --- | --- | --- | --- |
| backend | `auth` | 12.84% | 10% | Challenge/verify and token issuance are exercised by database-backed integration tests |
| backend | `admin` | 10.08% | 8% | Privileged routes are exercised by database-backed integration tests |

The low baseline is a real risk. The ratchet prevents further regression, and a
follow-up should add unit coverage so these floors can be raised.

## Pre-existing suite failures

Thresholds were seeded while both suites already had failing tests. Coverage is
still emitted because `coverage.reportOnFailure` is enabled in both Vitest
configs, but the failures are real and out of scope for the coverage work:

- **Frontend**: 137 of 783 tests fail. Mostly Vitest 4 upgrade fallout (the
  removed `Snapshots` export) and components wrapped in a nested `<Router>`.
- **Backend**: 279 of 705 tests fail locally because Postgres and Redis are not
  available; the new `coverage-backend` CI job provides both as service
  containers.

Because of this, the `Run ... coverage` steps in `.github/workflows/coverage.yml`
use `continue-on-error: true` so the ratchet can run. Remove that once the suites
are green, so test failures block the build directly.

## Other pre-existing blockers surfaced by enabling CI

Running CI for the first time exposed two unrelated, pre-existing problems:

- **Broken migration history.** `prisma migrate deploy` fails on a fresh database
  because `20260623124048_add_refund_notification_xaccount_indexer_models`
  recreates the `"User"` table already created by
  `20250623120000_initial_schema` (`P3018` / `42P07`). The backend coverage job
  therefore prepares its test database with `prisma db push --force-reset`, which
  derives the schema from `schema.prisma`. The migration history still needs a
  separate fix for real deployments.
- **Contracts do not compile.** The `coverage-rust` job cannot produce coverage
  (unresolved `crate::storage::DataKey`, missing event helpers), so it is marked
  non-blocking to avoid masking the backend and frontend ratchets. Remove that
  once the contracts build.

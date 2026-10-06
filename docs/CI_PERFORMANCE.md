# CI performance model

## Baseline

Before this change, the repository had 22 workflow files. The consolidated
`PR Checks` workflow started migration, contract, and frontend jobs for every
PR touching any supported path. Dedicated workflows then repeated the same
stack checks. A docs-only change could therefore allocate all three stacks,
including PostgreSQL, Rust tooling, and Playwright-dependent frontend jobs.

The baseline was measured from the workflow definitions on the issue branch:
the `migration-safety`, `contract`, and `frontend` jobs had no path-aware job
conditions, while the dedicated frontend and contract workflows already had
partial path filters.

## After

`PR Checks` now runs a lightweight `dorny/paths-filter` gate first and starts
only the affected stack:

| Changed paths | Migration | Contract | Frontend |
| --- | ---: | ---: | ---: |
| `backend/**` or migration script | yes | no | no |
| `contracts/**` | no | yes | no |
| `frontend-scaffold/**` | no | no | yes |
| documentation-only | no | no | no |

The dedicated contract, coverage, E2E, frontend, and visual workflows also
avoid stale duplicate runs through path filters and concurrency cancellation.
Cargo caches now restore from the nearest compatible key instead of requiring
an exact lockfile hash.

This makes the expected PR feedback cost proportional to the changed stack.
The workflow summary and GitHub Actions run durations provide the before/after
runtime measurement after this change is merged; no historical run-duration
data was available in the repository checkout.


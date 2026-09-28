# Contributing to Stellar Tipz

Thank you for your interest in contributing to **Stellar Tipz**! This guide will walk you through the process from fork to merged PR.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Branch Strategy](#branch-strategy)
4. [Branch Protection Rules](#branch-protection-rules)
5. [Workflow](#workflow)
6. [Branch Naming](#branch-naming)
7. [Commit Messages](#commit-messages)
8. [Pull Request Process](#pull-request-process)
9. [Code Standards](#code-standards)
10. [Review Criteria](#review-criteria)

---

## Branch Strategy

We use a **trunk-based** model with short-lived feature branches:

| Branch | Purpose | Merges into |
|--------|---------|-------------|
| `main` | Production-ready code — always deployable | — |
| `develop` | Integration branch for in-progress work | `main` (via PR) |
| `feature/<short-description>` | New features and enhancements | `develop` or `main` |
| `fix/<short-description>` | Bug fixes | `main` (hot-fix) or `develop` |
| `chore/<short-description>` | Dependency updates, refactors, CI | `develop` or `main` |
| `docs/<short-description>` | Documentation-only changes | `main` |

**Rules:**
- Never commit directly to `main` — always open a PR.
- Keep feature branches short-lived (< 1 week ideally).
- Rebase or squash before merge to keep `main` history linear.
- Delete the remote branch after it is merged.

---

## Branch Protection Rules

The `main` branch is protected with the following settings (configured in repository Settings → Branches):

| Rule | Setting |
|------|---------|
| Require a pull request | ✅ Enabled |
| Required approvals | 1 reviewer minimum |
| Dismiss stale reviews on new push | ✅ Enabled |
| Require status checks to pass | ✅ Enabled — see CI jobs below |
| Require branches to be up to date | ✅ Enabled |
| Require signed commits | ✅ Enabled |
| Allow force pushes | ❌ Disabled |
| Allow deletions | ❌ Disabled |
| Require linear history | ✅ Enabled (rebase or squash merge only) |

**Required status checks** (must pass before merge):

- `frontend-ci` — lint, type-check, unit tests
- `contract-ci` — Soroban contract build and tests
- `pr-checks` — PR validation (title format, linked issue)
- `security-audit` — dependency vulnerability scan

The full branch protection configuration is documented in [`.github/branch-protection.json`](../.github/branch-protection.json).

---

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

---

## Getting Started

1. **Fork** this repository to your GitHub account
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/stellar-tipz.git
   cd stellar-tipz
   ```
3. **Set upstream** remote:
   ```bash
   git remote add upstream https://github.com/akan_nigeria/stellar-tipz.git
   ```
4. Follow the [Setup Guide](./SETUP.md) to configure your local environment

---

## Architecture Overview

Stellar Tipz is a monorepo with two halves: a Soroban smart contract (the
source of truth) and a React frontend that reads/writes it over RPC.

```text
┌──────────────────────────────┐        ┌──────────────────────────────────┐
│  frontend-scaffold/          │        │  contracts/tipz/  (Soroban, Rust) │
│  React 18 + Vite             │        │                                   │
│  ├─ features/  (UI)          │        │  lib.rs        ← contract entry    │
│  ├─ Zustand store (ADR-005)  │  RPC   │  ├─ profile / tips / token         │
│  └─ contract bindings  ──────┼──────► │  ├─ credit.rs     (ADR-003)        │
│                              │ invoke │  ├─ leaderboard.rs                 │
│  Freighter wallet (signing)  │        │  ├─ fees.rs       (ADR-006)        │
└──────────────────────────────┘        │  ├─ admin.rs / multisig.rs         │
                                         │  └─ storage.rs    (ADR-004)        │
                                         │        │                          │
                                         │        ▼ instance/persistent/temp  │
                                         │   Soroban storage (TTL-managed)    │
                                         └──────────────────────────────────┘
```

- **Frontend** holds only light client state in a Zustand store; all durable
  state lives on-chain. Transactions are signed with the Freighter wallet.
- **Contract** is module-per-concern; `storage.rs` is the single gateway to
  on-chain state and its TTL discipline.

For the full picture see [`ARCHITECTURE.md`](../ARCHITECTURE.md) (directory
layout, module boundaries, data flow) and the decision records in
[`docs/adr/`](./adr/README.md).

---

## Workflow

We use a **fork-and-branch** workflow:

```
1. Fork repo → 2. Create branch → 3. Implement → 4. Test → 5. PR → 6. Review → 7. Merge
```

### Step-by-step

1. **Sync your fork** before starting new work:
   ```bash
   git checkout main
   git pull upstream main
   git push origin main
   ```

2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b <branch-name>
   ```

3. **Implement** the changes described in the issue

4. **Test** your changes:
   - **Contract changes**: `cd contracts && cargo test`
   - **Frontend changes**: `cd frontend-scaffold && npm run build`

5. **Commit** with a clear message (see [Commit Messages](#commit-messages))

6. **Push** to your fork:
   ```bash
   git push origin <branch-name>
   ```

7. **Open a Pull Request** against `main` on the upstream repo

---

## Branch Naming

Use this convention:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<issue-number>-<short-description>` | `feat/12-send-tip-function` |
| Bug fix | `fix/<issue-number>-<short-description>` | `fix/25-withdraw-overflow` |
| Test | `test/<issue-number>-<short-description>` | `test/30-credit-score-tests` |
| Docs | `docs/<issue-number>-<short-description>` | `docs/5-contract-spec-update` |

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer: Closes #<issue-number>]
```

### Types

| Type | Use |
|------|-----|
| `feat` | New feature |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `refactor` | Code restructuring (no feature/fix) |
| `ci` | CI/CD changes |
| `chore` | Maintenance tasks |

### Examples

```
feat(contract): implement send_tip function

- Validate tip amount > 0
- Transfer XLM from tipper to contract
- Update creator balance in storage
- Emit TipSent event

Closes #12
```

```
test(contract): add unit tests for credit score calculation

Closes #18
```

---

## Pull Request Process

### Before Submitting

- [ ] Code compiles without errors
- [ ] All existing tests pass
- [ ] New tests are written for new functionality
- [ ] Code follows project style guidelines
- [ ] Branch is up to date with `main`

### PR Description

Use the [PR template](../.github/PULL_REQUEST_TEMPLATE.md). Include:

1. **What** — What does this PR do?
2. **Why** — Link to the issue it resolves
3. **How** — Brief technical approach
4. **Testing** — How you verified it works
5. **Screenshots** (for frontend changes)

### Review Timeline

- PRs are reviewed within **48 hours**
- Address review feedback promptly
- Maintainer will merge once approved

---

## Code Standards

### Rust (Smart Contracts)

- **Format**: Run `cargo fmt` before committing
- **Lint**: `cargo clippy -- -D warnings` must pass with zero warnings
- **Tests**: Every public function must have tests
- **Documentation**: Add `///` doc comments to public functions and types
- **Error handling**: Use custom `ContractError` enum, never `panic!`

### TypeScript (Frontend)

- **Lint**: ESLint must pass (`npm run lint`)
- **Types**: No `any` types — use proper TypeScript types
- **Components**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Imports**: Absolute imports from `src/` using tsconfig paths

### General

- No hardcoded secrets or private keys
- No `console.log` in production code (use proper error handling)
- Keep functions focused and under 50 lines where possible

---

## Review Criteria

PRs are evaluated on:

| Criteria | Weight |
|----------|--------|
| **Correctness** — Does it solve the issue? | High |
| **Tests** — Are edge cases covered? | High |
| **Security** — No vulnerabilities introduced? | High |
| **Code quality** — Clean, readable, idiomatic? | Medium |
| **Performance** — No unnecessary computation? | Medium |
| **Documentation** — Clear comments where needed? | Low |

---

## Resources

**Project docs**
- [Setup Guide](./SETUP.md) — get running locally in < 30 minutes
- [Architecture](../ARCHITECTURE.md) and [ADRs](./adr/README.md) — how & why
- [Deployment Guide](./DEPLOYMENT.md), [Contract Spec](./CONTRACT_SPEC.md),
  [Credit Score](./CREDIT_SCORE.md), [Security](./SECURITY.md)

**External**
- [Soroban docs](https://developers.stellar.org/docs/build/smart-contracts/overview)
- [Soroban SDK (Rust) reference](https://docs.rs/soroban-sdk)
- [Stellar developer docs](https://developers.stellar.org/docs)
- [Freighter wallet](https://www.freighter.app/)
- [Rust book](https://doc.rust-lang.org/book/) · [Conventional Commits](https://www.conventionalcommits.org/)

---

## Pre-commit Hooks

Stellar Tipz uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to enforce code quality before every commit. The hooks run automatically once you have installed dependencies.

### What the pre-commit hook does

1. **Blocks `.env` files from being staged.** Files named exactly `.env` are rejected. `.env.example` and other variant names are permitted.
2. **Scans for secret patterns.** Any staged file containing a line that matches `PRIVATE_KEY`, `SECRET_KEY`, `API_KEY`, `ACCESS_TOKEN`, or `PASSWORD` followed by a quoted value of 8 or more characters triggers an error. Review and remove the offending line before committing.
3. **Runs lint-staged** inside `frontend-scaffold/`, applying ESLint auto-fixes and Prettier formatting to all staged TypeScript and JavaScript source files.

### Setup

The hooks are installed automatically when you run `npm install` at the repo root (via the `prepare` script). If you cloned the repository without running install, or if hooks are not firing, run:

```bash
npm install
```

To verify the hook is in place:

```bash
ls -la .husky/
# pre-commit should be listed and executable
```

### Skipping hooks (not recommended)

If you need to make an emergency commit that bypasses the hooks (for example, to commit a work-in-progress without fixing lint errors first), you can use:

```bash
git commit --no-verify -m "wip: ..."
```

Use this sparingly. The CI pipeline enforces the same checks, so the branch will not be mergeable until they pass.

---

## Visual Regression Baselines

The Playwright visual suite in `frontend-scaffold/tests/visual` screenshots the
landing, leaderboard, help, register and 404 pages at desktop, tablet and mobile
widths and compares them against committed baselines in
`frontend-scaffold/tests/visual/__screenshots__`. It runs on every PR that
touches `frontend-scaffold/` and it is a real check: a failure is not ignored
and the PR should not be merged over it.

### How a failure shows up

- The **Visual Regression Tests** check fails and the job's step summary lists
  every snapshot that differs, why (pixel diff with the ratio, missing baseline,
  size mismatch, fonts not loaded) and which files to look at.
- The same table is posted as a sticky comment on the PR (same-repository
  branches only; fork PRs rely on the step summary).
- The `visual-diffs` artifact holds `expected`, `actual` and `diff` PNGs for
  each failure; the `playwright-visual-report` artifact opens a side-by-side
  viewer.

### Reviewing and approving a baseline change

1. Open the diff images. Decide whether the change is intentional (part of the
   PR) or a regression.
2. A regression is fixed in the PR like any other bug.
3. An intentional change needs new baselines. Baselines are only ever rendered
   inside the pinned Playwright container, never on a laptop, so they are
   byte-for-byte comparable in CI:
   - A maintainer adds the `visual-baselines:update` label to the PR after
     reviewing the diffs. The **Visual Baselines** workflow regenerates the
     PNGs, re-runs the suite three times to prove they are stable, commits them
     to the branch and removes the label.
   - For a PR from a fork the workflow cannot push. It uploads a
     `visual-baselines` artifact instead; copy its contents to
     `frontend-scaffold/tests/visual/__screenshots__/` and commit them.
   - Maintainers can also run the workflow by hand from the Actions tab for any
     branch (`workflow_dispatch`, input `ref`).
4. The reviewer looks at the new PNGs in the PR diff as part of the review. A
   baseline update without a visible design change in the same PR is a red
   flag.

To reproduce the CI rendering locally, run the suite in the same image:

```bash
cd frontend-scaffold
docker run --rm -it -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -c "npm ci --legacy-peer-deps && npm run test:visual"          # compare
# add `:update` to regenerate baselines, `:flaky` to run each snapshot 3 times
```

Running `npm run test:visual` outside the container is fine for a quick look,
but expect font and antialiasing differences; never commit baselines produced
that way. The image tag must match `@playwright/test` in
`frontend-scaffold/package-lock.json`; bump both together.

### Writing a deterministic visual test

Every test goes through `openForScreenshot` from `tests/visual/fixtures.ts`,
which pins the things that made the old suite flaky: time (`Date` is frozen),
`Math.random` (seeded), theme, reduced motion and the first-visit tour (set
through the app's own localStorage keys and media emulation), language,
viewport and device scale factor, and the network (only the app origin and Google Fonts are reachable;
every `/api/v1` call answers a fixed 503 so components render their error and
empty states; RPC, Horizon, analytics and Sentry are blocked). The app is built
with `--mode visual`, which enables `VITE_USE_MOCK_DATA` so pages that read the
chain render fixtures. Screenshots wait for the web fonts and fail with a clear
message if they are not loaded, and inherently dynamic elements
(`DYNAMIC_SELECTOR`) are masked.

When adding a page:

- Add a scenario to `tests/visual/visual-regression.spec.ts`; do not call
  `page.goto` directly.
- If the page shows live values, give the element a `data-testid` from
  `DYNAMIC_SELECTOR` or extend that list rather than widening
  `maxDiffPixelRatio`.
- Run `npm run test:visual:flaky` (each snapshot three times). A snapshot that
  does not pass three consecutive runs is flaky: mask or stabilise the source
  of variation, or remove the snapshot. Never raise thresholds or add retries
  to make it pass; the config deliberately has `retries: 0`.

## Questions?

- Open a [Discussion](https://github.com/akan_nigeria/stellar-tipz/discussions) for general questions
- Comment on the relevant issue for task-specific questions
- Tag `@akan_nigeria` for urgent matters

---

**Thank you for contributing to Stellar Tipz! Every contribution helps empower creators worldwide. 💫**

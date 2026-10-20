# ADR-008: Soroban SDK Version Pinning and Upgrade Policy

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Core Team

## Context

The Stellar Tipz smart contract depends on `soroban-sdk` (currently v21.7.4). The SDK releases frequently with new features, bug fixes, and occasionally breaking changes. Uncontrolled upgrades can introduce:

- Breaking API changes that require contract code modifications
- Changed WASM semantics affecting on-chain behavior
- New dependencies that increase contract size or compilation time
- Incompatibilities with the target network's runtime version

Conversely, never upgrading misses performance improvements, security patches, and new Soroban features (e.g., host functions, storage improvements).

We need a documented, repeatable policy for when and how to upgrade the SDK.

## Options Considered

1. **Pin indefinitely (never upgrade)** — Maximum stability, but misses all improvements and security fixes. Risk of incompatibility with future network upgrades.

2. **Upgrade on every release** — Always latest, but high maintenance burden; frequent breaking changes disrupt development.

3. **Scheduled minor/patch upgrades with full test gate** — Upgrade patch versions immediately after CI passes; minor versions after extended testing; major versions only with dedicated migration sprint. (Selected)

4. **Upgrade only when blocked by network runtime** — Reactive; minimal work but may force emergency upgrades under pressure.

## Decision

We adopt **Option 3**: a structured upgrade policy with automated gates.

### Versioning Scheme

| SDK Version | Policy | Gate |
|-------------|--------|------|
| **Patch** (21.7.x → 21.7.y) | Auto-upgrade weekly | `cargo test --all-targets` passes; `cargo build --release` size ≤ previous +5% |
| **Minor** (21.x → 21.y) | Monthly review | Full test suite + mutation testing (`cargo mutants`); WASM size budget; integration testnet deploy |
| **Major** (21.x → 22.x) | Dedicated sprint | All minor gates + formal audit of breaking changes; admin-signed migration plan |

### Upgrade Procedure

1. **Patch**: Dependabot PR opened weekly. Merge if:
   - All CI checks pass (`test`, `build`, `clippy`, `fmt`)
   - `contract-size` CI job reports ≤5% increase
   - No new `unsafe` blocks introduced

2. **Minor**: Monthly issue created by maintainers. Before merging:
   - Run full mutation test suite (`cargo mutants --all-targets`)
   - Deploy to testnet and run integration test suite (`make testnet-integration`)
   - Verify WASM size within budget (see `BUNDLE_SIZE_OPTIMIZATION_SUMMARY.md`)
   - Update `Cargo.lock` and document any API migrations in `CHANGELOG.md`

3. **Major**: Tracked as epic. Requires:
   - Breaking change audit (list all `#[deprecated]` and removed APIs used)
   - Storage schema migration plan if `soroban-sdk` storage APIs change
   - Load test on testnet with production-like data
   - Security review of new host functions used

### Test Gates

The following CI jobs **must pass** before any SDK version bump is merged:

| Job | Command | Purpose |
|-----|---------|---------|
| `unit-tests` | `cargo test --workspace --all-targets` | Regression detection |
| `mutation-tests` | `cargo mutants --all-targets` (minor/major) | Test quality assurance |
| `build-release` | `cargo build --release --target wasm32v1-none` | WASM compiles, size check |
| `clippy` | `cargo clippy --workspace -- -D warnings` | Lint regressions |
| `fmt` | `cargo fmt --check` | Formatting consistency |

### Pinning Mechanism

- Version pinned in `contracts/Cargo.toml` under `[workspace.dependencies]`
- `Cargo.lock` committed to repo for reproducible builds
- `renovate.json` or Dependabot config automates patch PRs
- Major/minor upgrades tracked via GitHub issues with `sdk-upgrade` label

### Rollback Procedure

If a merged upgrade causes testnet/mainnet issues:
1. Revert `Cargo.toml` and `Cargo.lock` to previous version
2. Tag `sdk-rollback-<version>` for audit trail
3. File issue with root cause analysis

## Rationale

Option 3 balances stability with progress. Patch upgrades are low-risk and automated; minor upgrades get thorough validation; major upgrades get the scrutiny they deserve. The explicit test gates prevent "works on my machine" merges.

## Consequences

- **Positive**: Predictable upgrade cadence; automated patch updates reduce drift; test gates catch regressions early; clear escalation path for major versions.
- **Negative/Cost**: Requires maintaining CI infrastructure for mutation testing and testnet integration; minor/major upgrades consume engineering time.
- **Risks**: Network-mandated upgrades (e.g., protocol version change) may force off-schedule major upgrades; mitigate by monitoring Stellar/Soroban release channels.

## Follow-ups

- Add `renovate.json` for automated patch PRs
- Document testnet integration test suite in `CONTRIBUTING.md`
- Consider `cargo audit` in CI for supply-chain security
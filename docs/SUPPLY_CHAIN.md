# Supply Chain Security

This document describes the supply chain security controls for Stellar Tipz and
explains the authoritative package manager for each sub-project.

---

## Package Manager Policy

### Authoritative package managers

| Sub-project | Authoritative PM | Lockfile |
| ----------- | ---------------- | -------- |
| Root (`/`) | npm | `package-lock.json` |
| `frontend-scaffold/` | npm | `package-lock.json` |
| `backend/` | npm | `package-lock.json` |
| `contracts/` (Rust) | Cargo | `Cargo.lock` |

`frontend-scaffold/` contains a legacy `pnpm-lock.yaml` that was generated
during an earlier evaluation of pnpm. **It is not used.** All CI workflows
install via `npm ci`. The pnpm lockfile is kept in the repository only to
avoid a potentially disruptive rebase; it must not be updated and will be
removed when the branch is rebased against a clean base.

### Rule

> **Do not run `pnpm install` in `frontend-scaffold/`.** All installs must use
> `npm ci`.

If you need to add a dependency, use `npm install <pkg>` so that only
`package-lock.json` is updated.

---

## Strict Lockfile Installs in CI

All CI jobs install dependencies with `npm ci` (never `npm install`), which:

- Installs the exact versions recorded in `package-lock.json`.
- Fails the build if `package-lock.json` is out of sync with `package.json`.
- Prevents any implicit resolution of fresh package versions.

For Cargo, `Cargo.lock` is committed and `cargo build`/`cargo test` respect it.

---

## Dependency Provenance

- **npm provenance**: GitHub Actions workflows run `npm ci` with the lock file
  checked in to the repository so every install is reproducible.
- **Cargo**: `Cargo.lock` is committed. `cargo-deny` enforces the registry
  allow-list (`allow-registry = ["https://github.com/rust-lang/crates.io-index"]`)
  and blocks unknown git sources.
- **Dependabot** is configured (`.github/dependabot.yml`) to open PRs for
  outdated packages in all three npm scopes and for Cargo.

---

## New Dependency Review

Before merging a PR that introduces a new direct dependency:

1. Check the package's maintenance status, download count, and known advisories
   on [npmjs.com](https://npmjs.com) or [crates.io](https://crates.io).
2. Prefer packages with a clear ownership story (official SDK, well-known OSS
   project, or actively maintained by a known team).
3. Flag packages whose names look like typosquats of common libraries.
4. The CODEOWNERS rule on lockfiles ensures a maintainer must review every
   lockfile diff before it can be merged.

---

## Build Reproducibility

Run `npm ci` from a clean `node_modules/` directory to reproduce an identical
install. The hash embedded in `package-lock.json` detects any tampering with
published package tarballs.

To verify Cargo reproducibility, run `cargo build` with the committed
`Cargo.lock` — any mismatch causes an error.

---

## Lockfile CODEOWNERS

Changes to any lockfile require a review from `@Akanimoh12` as defined in
`.github/CODEOWNERS`. This means no new transitive dependency enters the tree
without an explicit human approval.

---

## References

- [npm ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- [cargo-deny documentation](https://embarkstudios.github.io/cargo-deny/)
- [Dependabot configuration](.github/dependabot.yml)
- [Dependency Vulnerability Policy](../SECURITY.md#dependency-vulnerability-policy)

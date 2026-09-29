# SAST (Static Application Security Testing)

Dependency scanning (`security-audit.yml`) answers "is a package I depend on
known-vulnerable?". It cannot answer "did *we* concatenate user input into a SQL
query", "is there a hardcoded credential in our source", or "are we rendering
unescaped HTML".

SAST covers that gap. This document is the reference for what is scanned, which
rules run, how findings are triaged, and how merges are gated.

- Issue: #1373 (audit items 228/250)
- Workflow: `.github/workflows/sast.yml`
- Tool: [CodeQL](https://codeql.github.com/) for `javascript-typescript` and `rust`

## Why CodeQL

Three acceptance criteria drive the choice:

| Criterion | How CodeQL satisfies it |
| --- | --- |
| Results appear in the GitHub Security tab | Native code-scanning upload; no third-party integration |
| New high-severity findings block merges | Code scanning surfaces as a check that branch protection can require |
| Findings are triaged and suppressed | Alerts can be dismissed in the UI with a justification, which is recorded |

The alternative, wiring up a standalone scanner, would have needed extra
machinery for both the Security tab and merge gating.

## Scan scope

| Language | Paths | What is included |
| --- | --- | --- |
| `javascript-typescript` | `frontend-scaffold/`, `backend/` | All first-party `.ts`/`.tsx`/`.js`/`.jsx`. |
| `rust` | `contracts/tipz/` | The Soroban contract crate. |

Deliberately **out of scope**:

- `node_modules/`, `target/`, `dist/`, `build/` — third-party or generated code.
- Test files (`*.test.ts`, `*.spec.ts`, `__tests__/`) — see [Noise](#noise-and-
  suppressions). They are analysed (the extractor cannot cleanly separate them)
  but findings in them are suppressed as non-shipping code.
- Solidity / WASM / any other language we do not ship.

## Ruleset

Both jobs keep the default `security-and-quality` suite and narrow it by
excluding query tags:

```yaml
queries: security-and-quality
query-filters:
  - exclude:
      tags:
        - maintainability
        - usability
        - experimental
        - external/cwe
```

This is the tuning the issue asks for, and it is deliberate:

- `maintainability` and `usability` are the style and design queries. On this
  codebase they produce hundreds of findings that are not security problems,
  which is exactly how SAST ends up switched off.
- `experimental` and `external/cwe` are lower-confidence and would add volume
  before anyone has triaged a baseline.

What remains is the high-confidence security-focused set: injection (including
SQL/command/code), hardcoded credentials, unsafe deserialisation, path
traversal, SSRF, XSS, and cryptography misuse.

### Why not `queries: security`

The obvious spelling — `queries: security` — **does not work**. There is no
standalone query pack named `security`; it fails during `database init` with:

```
A fatal error occurred: Query pack security cannot be found. Check the spelling of the pack.
```

This was confirmed in CI on both languages, not assumed. The `security-*` names
that do exist are full suites (`security-extended`, `security-and-quality`), and
selecting one of those cannot be combined with a tag filter to mean "security
only". Filtering tags off a known suite is the approach that actually works.

### What the security suite is expected to catch here

Not a claim that the code is clean — the point of running it. Based on a manual
review of the highest-risk sinks in this repository, the queries that matter
most are:

| Concern | Where it lives in this repo |
| --- | --- |
| SSRF | `backend/src/modules/webhooks/` — user-supplied webhook target URL, dispatched outbound |
| XSS | `frontend-scaffold/src/features/profile/` — `dangerouslySetInnerHTML` over user bios |
| Secret handling | `backend/src/config/env.ts` — JWT secret parsing and strength validation |
| Unsafe deserialisation | JSON parsing of webhook payloads and API request bodies |
| Cryptography misuse | `frontend-scaffold/src/helpers/` — encryption and signature helpers |
| Authorization | `backend/src/modules/admin/` — privileged routes |

## Noise and suppressions

Some findings are true rules that do not apply to this code. Suppress them in
the source with an explicit reason, so the reason survives in code review:

```ts
// codeql[js/insecure-randomness]: not used for security purposes — this value
// is a cache-busting UI nonce, not a token.
const nonce = Math.random();
```

Rules for the suppression register:

- Every suppression carries a justification in the comment. A bare
  `codeql[...]` marker with no reason is not acceptable in review.
- Suppress at the narrowest scope that works — the expression, not the file.
- A suppression of a rule we actually care about is a finding to revisit, not a
  permanent answer. The register below is reviewed each quarter.

### Current register

Populated from the first real scan; see the PR for the initial triage table. At
the time of writing the manual review above found no confirmed issues, and the
`dangerouslySetInnerHTML` uses are covered by `sanitizeHTML` with a tag and
attribute allowlist, so they are expected to be triaged as false positives.

## Gating policy

Findings block merges according to severity:

| Severity | Action |
| --- | --- |
| High / Critical | **Blocks merge.** Must be fixed or dismissed with justification. |
| Medium | Reported, does not block. Triaged within one sprint. |
| Low / Note | Reported only. Reviewed at the quarterly pass. |

Two levels of "blocks merge" are in play, and the distinction matters:

1. **The workflow** always uploads results, including on failure, so alerts
   exist in the Security tab even when the run is red.
2. **Branch protection** is what actually stops a merge. Add
   `SAST (TypeScript)` and `SAST (Rust)` to the repository's required status
   checks in **Settings → Branches → Branch protection rules**. This is a
   repository setting, not a file in the repository, so it cannot be applied
   from a pull request — a maintainer must enable it.

Until that setting is on, SAST is advisory: results are visible in the Security
tab but a red run will not by itself prevent a merge.

## Running locally

CodeQL's CLI is a large download and there is no Docker in every environment, so
local runs are optional. To reproduce CI exactly:

```bash
# 1. Fetch the CLI bundle matching the version CI uses
mkdir -p ~/codeql && cd ~/codeql
# download from https://github.com/github/codeql-action/releases

# 2. Build the project as the extractor would
cd /path/to/Stellar-Tipz
frontend-scaffold$ npm ci --legacy-peer-deps && npm run build
contracts$ cargo build

# 3. Analyse
~/codeql/codeql database create db --language=javascript-typescript --source-root=.
~/codeql/codeql database analyze db security --format=sarif-latest --output=ts.sarif

~/codeql/codeql database create db-rust --language=rust --source-root=contracts/tipz
~/codeql/codeql database analyze db-rust security --format=sarif-latest --output=rust.sarif
```

## Schedule

Weekly on Monday at 04:27 UTC, alongside a manual trigger
(`workflow_dispatch`) and every push and PR to the default branch. The weekly run
exists so a CodeQL rule update or a newly reachable sink surfaces even when no
PR touches the scanned paths.

## Related

- [`docs/SECURITY.md`](SECURITY.md) — dependency vulnerability remediation, severity SLAs
- [`contracts/SECURITY.md`](../contracts/SECURITY.md) — contract audit findings
- `.github/workflows/security-audit.yml` — dependency scanning (SAST's complement)

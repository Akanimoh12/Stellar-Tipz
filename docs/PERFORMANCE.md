# Continuous load testing and performance regression detection

Stellar Tipz runs a mixed-traffic k6 workload against **staging every Monday**
at 03:00 UTC, plus on manual dispatch. It intentionally does not run on each
pull request: the workload takes several minutes, consumes a shared staging
RPC quota, and must use signed staging-only transactions. The scheduled
workflow is [`.github/workflows/load-test.yml`](../.github/workflows/load-test.yml).

## Realistic workload

[`scripts/load-test.js`](../scripts/load-test.js) concurrently exercises the
three production RPC journeys instead of hammering a single endpoint:

| Journey | RPC call | Load shape | Purpose |
|---|---|---|---|
| Tip submission | `sendTransaction` with an approved signed staging XDR | 10 → 50 → 100 VUs | captures writes, transaction admission, and queueing |
| Leaderboard read | `getLedgerEntries` | ramps to 60 VUs | captures shared read/storage contention |
| Profile read | `getLedgerEntries` | ramps to 60 VUs | captures the profile lookup path |

When no transaction or ledger-key test fixture is supplied, the script sends
`getLatestLedger` health traffic rather than manufacturing a transaction.
Scheduled staging runs must provide the named staging-only variables below, so
the regression guard uses the actual paths.

```bash
RPC_URL=https://staging-rpc.example \
SIGNED_TIP_XDRS='...' LEADERBOARD_KEY_XDR='...' PROFILE_KEY_XDR='...' \
k6 run --summary-export=load-summary.json scripts/load-test.js
npm run load:compare -- load-summary.json scripts/load-test-baselines/staging.json
```

Use only funded, disposable staging accounts. Never place a production secret,
account, or signed production transaction in GitHub variables or in the output
artifact.

## Approved baseline and regression policy

[`scripts/load-test-baselines/staging.json`](../scripts/load-test-baselines/staging.json)
is the committed, approved baseline envelope. The comparator fails when a
summary exceeds any limit:

- HTTP and RPC failure rate: 2% maximum;
- p50: 350 ms maximum;
- p95: 1,200 ms maximum; and
- p99: 2,500 ms maximum.

These values leave headroom above the API SLO’s 300 ms / 1 s / 2.5 s user
experience targets while still detecting a staging regression before it reaches
production. Update the baseline only after reviewing several successful runs,
recording the reason in the pull request, and obtaining performance-owner
approval; never update it merely to turn a failed job green.

## Tracking over time

Each scheduled run publishes the p50, p95, p99, and error rate in the GitHub
Actions job summary and retains the full `load-summary.json` artifact for 90
days. Compare these artifacts by run date to detect gradual degradation, not
only a threshold crossing. The current baseline’s `capturedAt`, workload, and
commit fields document its provenance; refresh them when an approved new
baseline replaces it.

## Running and investigating

Install [k6](https://k6.io/docs/get-started/installation/) locally, then run
`npm run load:test` for an exploratory run or the two commands above for the
same regression check used by CI. A failure is actionable only after checking:

1. the staging endpoint and fixtures were valid;
2. the scenario mix completed (not merely fallback health traffic);
3. `http_req_failed` and `rpc_failures` failure modes; and
4. latency by operation and any corresponding Stellar RPC rate limit.

Record the result, endpoint version, fixture type, and any bottleneck in the
PR or performance log. Do not treat a one-off public-network outage as a new
application baseline.

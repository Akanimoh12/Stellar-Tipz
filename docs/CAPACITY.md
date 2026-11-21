# Capacity planning and load-test protocol

**Status:** Baseline model awaiting instrumented staging measurements. Do not treat the numbers below as measured production capacity. This document records a reproducible method, model assumptions, bottleneck order, and cost sensitivity.

## Workload and benchmark procedure

The existing `scripts/load-test.js` k6 suite generates Soroban RPC load; without `SIGNED_TIP_XDRS`, `PROFILE_KEY_XDR`, and `LEADERBOARD_KEY_XDR` it substitutes `getLatestLedger` health calls. **Those results cannot be used to claim tip, profile, or leaderboard throughput.** The existing `scripts/db-pool-load-test.js` measures API pool behaviour separately.

1. Use a dedicated staging environment with production-like CPU limits, PostgreSQL/Redis tiers, and a rate-limited RPC provider; do not submit reusable signed transactions to mainnet. Record the exact image SHA, machine size, SQL pool settings, ledger height and provider quota.
2. Collect 10-minute idle baselines, then 10-minute steady-state stages at 10/25/50/100/200 requests per second; repeat each stage three times. Test separately API reads, writes, actual signed tips on testnet, indexing catch-up, queue recompute, and a realistic mixed workload. Stop at sustained error rate >2%, API p95 >1.2s, queue backlog growing for two stages, or contract/provider rate limiting.
3. Run `k6 run scripts/db-pool-load-test.js` with `BASE_URL` and `DATABASE_POOL_SIZE`; run `k6 run scripts/load-test.js` with a *dedicated testnet* `RPC_URL` and valid workload fixtures. Export JSON summaries and store dated results in `docs/capacity-results/` before calling the model measured.
4. At every stage capture API RPS and p50/p95/p99, HTTP 5xx, RPC 429/timeout rates, active DB connections, pool acquisition timeouts, PostgreSQL CPU/IO, Redis memory/queue depth, Node CPU/RSS/event-loop lag, indexer cursor lag, and provider ledger height. Mark the first saturated subsystem.
5. Derive per-unit coefficients from the slope between two non-saturated load levels: CPU millicores per RPS = 1000 × ΔCPU-cores/ΔRPS, RSS MiB per RPS = ΔRSS/ΔRPS, and SQL connections per RPS = Δactive-connections/ΔRPS. Use observed p95 concurrency, not average utilisation, when sizing pools. Record error bars across repeats.

## Model and capacity limits

Let `R` = sustained API RPS, `W` = event writes/second, `I` = active API instances, `C` = per-instance SQL pool size, `P` = database max usable connections after maintenance reserve, and `Q` = contracted RPC calls per second.

* SQL connection ceiling: `I × C <= P`. With the default `DATABASE_POOL_SIZE=10`, five API instances can reserve up to 50 connections *before* worker/indexer pools. Allocate a separate budget for each process and leave at least 20% DB headroom (planning assumption).
* RPC call ceiling: `R × rpcCallsPerRequest + W × rpcCallsPerEvent <= 0.7 × Q` (30% operational margin is an assumption, not a benchmark result). Indexer polling and reconciliation also consume quota.
* Worker capacity: `arrivalRate < completedJobsPerSecond` for a stable queue. For six-hour credit recompute, `userCount × observedSecondsPerScore` must complete comfortably below six hours.
* Indexer: per #116, **single-leader indexing cannot be horizontally scaled for throughput**. Standby replicas improve availability only. Improve batch sizes, projection/query efficiency, provider quotas and catch-up performance; never multiply leader throughput by replica count.
* API/realtime stateless replicas can scale horizontally when Socket.IO uses the Redis adapter. Redis, PostgreSQL, and provider quotas need independent vertical/managed capacity planning. Job workers can scale only where their job's idempotency and scheduling semantics allow concurrency; do not run duplicate singleton schedules.

## Expected bottleneck investigation order (hypotheses, not measurements)

1. PostgreSQL connection exhaustion / slow queries as API replicas increase; validate `tipz_db_pool_saturation_total`, query time and connection budget.
2. Soroban RPC / Horizon quotas, latency and stale ledger providers; verify 429 and timeout rates plus remote ledger sequence.
3. Single-leader indexer throughput / catch-up lag; verify processed events per tick and `INDEXER_LAG_THRESHOLD_LEDGERS`.
4. Redis queue lag, memory and realtime fan-out; verify p95 queue wait and consumer throughput.
5. API instance CPU, memory, and event loop lag; verify `nodejs_eventloop_lag_p99_seconds`.

## Cost scenarios (illustrative arithmetic; replace unit prices with vendor quotes)

The table uses **explicit hypothetical monthly prices**: API instance $35, jobs instance $35, single active indexer plus standby $70 total, managed PostgreSQL base $100, Redis $30, and RPC allocation $100 per 1 million billable requests. Data egress, storage growth, monitoring, backups, network fees and taxes are **excluded**. None of these figures is a current vendor quote.

| Planning tier | API instances | Jobs instances | Database multiplier | RPC calls/month | Example monthly subtotal |
|---|---:|---:|---:|---:|---:|
| Small | 1 | 1 | 1 | 1M | $370 |
| Medium | 3 | 2 | 2 | 5M | $975 |
| Large | 8 | 4 | 4 | 20M | $2,920 |

Formula: `35 × API + 35 × jobs + 70 + 100 × DB multiplier + 30 + 100 × RPC millions`. The table is scenario budgeting only; benchmark results must validate service capacity at every tier before purchasing resources.

## Recording actual measurements

For each dated run record: git SHA, UTC timestamp, target and achieved RPS, test fixtures, API replicas/CPU/RSS, SQL connections/p95 query, RPC provider/limit/429 count, indexer lag, queue backlog, p95 latency, error rate and USD quote links. Recalculate the slopes and cost tiers with measured values; no extrapolation beyond the largest successful test stage. Include a rollback trigger and re-run after changes to schema, indexes, provider or worker concurrency.

**Operational alerts:** use `backend/observability/prometheus/alerts.yml` for DB saturation, 5xx ratio, event-loop lag and treasury; link the applicable SLO runbooks under `docs/runbooks/`. 

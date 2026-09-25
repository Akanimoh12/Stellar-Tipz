# Metrics

The backend exposes Prometheus metrics from every process: the API server, the
indexer and the jobs runner. Three layers build on one registry
(`src/common/observability/prometheus.ts`):

| Layer | Module | Issue |
|---|---|---|
| Registry, default process metrics, `/metrics` endpoints, access control | `prometheus.ts`, `metricsServer.ts`, `metrics.ts` | #1346 |
| RED metrics (rate, errors, duration) per HTTP route | `httpMetrics.ts` | #1347 |
| Business outcomes: tips, volume, withdrawals, registrations, subscription charges | `businessMetrics.ts` | #1348 |

Dashboards and alert rules live in `backend/observability/`.

## Endpoints

Every process starts an internal listener on `METRICS_HOST:METRICS_PORT`
(default `127.0.0.1:9464`) that serves only `GET /metrics`. The API process
additionally keeps `GET /metrics` on its public port for existing deployments.

| Variable | Default | Meaning |
|---|---|---|
| `METRICS_PORT` | `9464` | Port of the internal listener. `0` disables it. Give each process its own port when they share a host (the example scrape config uses 9464/9465/9466). |
| `METRICS_HOST` | `127.0.0.1` | Interface to bind. Keep it on loopback unless a token is set. |
| `METRICS_BEARER_TOKEN` | unset | When set, every `/metrics` endpoint requires `Authorization: Bearer <token>` (constant-time comparison). Minimum 16 characters. |

Access rules, implemented once in `evaluateMetricsAccess`:

- A configured token is always enforced (401 without it).
- Without a token, the internal listener is open on loopback. Binding it to a
  non-loopback interface without a token logs a warning at startup and, in
  production, answers 404.
- Without a token the API's public `/metrics` route answers 404 in production,
  because the API port is reachable from the internet. Set the token or scrape
  the internal listener instead.

The API route keeps the legacy JSON report: send `Accept: application/json`.
Plain `curl` and Prometheus receive the text exposition format.

```bash
curl -s http://127.0.0.1:9464/metrics | head
curl -s -H 'Accept: application/json' http://localhost:4000/metrics | jq .indexer
curl -s -H "Authorization: Bearer $METRICS_BEARER_TOKEN" http://api.internal:9464/metrics
```

`backend/observability/prometheus/prometheus.example.yml` is a scrape
configuration for the three processes.

## Naming conventions

- Custom metrics are prefixed `tipz_` (added by the helpers; passing an
  already-prefixed name throws). Default Node.js and process metrics keep their
  standard `process_` and `nodejs_` names so existing dashboards work.
- `snake_case`, base units in the name (`_seconds`, `_bytes`, `_stroops`),
  `_total` on counters, no unit on gauges that count things.
- Labels are bounded sets: route patterns, not paths; result enums, not
  messages; classifier codes, not free text. A label that could grow with the
  number of users is a bug.
- Every metric carries the default labels `service="stellar-tipz-backend"` and
  `process="api|indexer|jobs"`.

Register a metric through the helpers so it lands on the shared registry and
survives module re-imports:

```ts
import { createCounter } from '../common/observability/prometheus.js';

const refundsTotal = createCounter({
  name: 'refunds_total',
  help: 'Refunds processed, by result',
  labelNames: ['result'] as const,
});
refundsTotal.inc({ result: 'success' });
```

`createGauge` and `createHistogram` work the same way; a gauge accepts a
`collect` callback for values read on scrape.

## Metric reference

### Process (default collectors)

Registered by `initProcessMetrics` in every process: `process_cpu_seconds_total`,
`process_resident_memory_bytes`, `nodejs_heap_size_used_bytes`,
`nodejs_eventloop_lag_seconds` plus `_p50/_p90/_p99/_mean/_max`,
`nodejs_gc_duration_seconds` (histogram by GC kind), `nodejs_active_handles`,
`nodejs_active_requests`. Event loop lag p99 is the single most useful Node
signal and is alerted on.

### HTTP (API process)

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `tipz_http_requests_total` | counter | `method`, `route`, `status_code`, `status_class` | Requests handled. `status_class` is `2xx`..`5xx`; a socket closed before a response is `499`. |
| `tipz_http_request_duration_seconds` | histogram | `method`, `route`, `status_class` | Duration from middleware entry to response finish. Buckets 5ms to 10s. |
| `tipz_http_requests_in_flight` | gauge | `method` | Requests currently being handled. |

`route` is the Express pattern (`/api/v1/profiles/:username`), never the raw
path. Requests that match no route share `unmatched`; `router.use` handlers such
as Swagger UI are labelled by their mount path. Identifier-looking segments
(transaction hashes, Stellar addresses, UUIDs, numbers) in a mount path are
replaced with `:id` as a second line of defence. `method` is bounded to the
standard verbs plus `OTHER`.

Useful queries:

```promql
sum by (route) (rate(tipz_http_requests_total[5m]))                                   # rate
sum by (route) (rate(tipz_http_requests_total{status_class="5xx"}[5m]))
  / sum by (route) (rate(tipz_http_requests_total[5m]))                               # error ratio
histogram_quantile(0.99, sum by (le, route) (rate(tipz_http_request_duration_seconds_bucket[5m])))
```

### Business outcomes

| Metric | Type | Labels | Emitted from |
|---|---|---|---|
| `tipz_tips_total` | counter | `source`=`api`\|`indexer`, `result` | `recordTip` (POST /tips) and the indexer's tip projection |
| `tipz_tip_volume_stroops_total` | counter | `source` | Same, successes only |
| `tipz_withdrawals_total` | counter | `operation`=`submit`\|`scheduled_payout`, `result` | `submitWithdrawal` and the payout sweep |
| `tipz_withdrawal_volume_stroops_total` | counter | `operation` | Same, successes only |
| `tipz_registrations_total` | counter | `source`=`auth`\|`indexer`, `result` | First wallet sign-in (`verifyChallenge`) and `profile_register` events |
| `tipz_subscription_charges_total` | counter | `source`=`job`\|`indexer`, `result`, `failure_code` | The charge worker and confirmed `sub_exec` events |
| `tipz_subscription_charge_volume_stroops_total` | counter | `source` | Confirmed charges |

`result` is one of `success`, `duplicate` (idempotent replay, not a failure),
`user_error`, `system_error`, `unparseable` (malformed on-chain payload) or
`skipped`. The user/system split is what makes these alertable:

- `user_error`: validation failures, insufficient balance, revoked
  authorisation, an on-chain transaction the network rejected. Expected in
  normal operation.
- `system_error`: database errors, RPC or Horizon outages, keeper
  misconfiguration, persistence failures. `classifyFailure` maps every 4xx
  `AppError` and `ZodError` to the user, everything else to the system, and a
  code path can override that with `markFailureClass` when the HTTP status does
  not reflect the cause (a withdrawal whose RPC submission failed is reported
  to the user as 400 but counted as `system_error`).
- Subscription charge codes from the classifier are split by
  `classifySubscriptionFailure`; `failure_code` is bounded to the known codes
  plus `UNKNOWN`, `PERSIST_ERROR` and `none`.

Volumes are summed as doubles; a single increment above 2^53 stroops (about
900 million XLM) would lose precision.

### Legacy counters

The JSON report's counters are mirrored: `tipz_db_slow_queries_total`,
`tipz_db_pool_saturation_total`, `tipz_retention_rows_pruned_total{model}`,
`tipz_indexer_unknown_events_total` and the gauge
`tipz_indexer_last_processed_ledger`.

## Dashboard and alerts

- `backend/observability/grafana/stellar-tipz-platform-health.json`: import into
  Grafana (Dashboards, New, Import) and pick the Prometheus datasource. Rows:
  business health (tips per minute, volume, registrations, withdrawals, today
  vs yesterday), user-caused vs system-caused failures, RED per route, process
  health.
- `backend/observability/prometheus/alerts.yml`: rule groups
  `stellar-tipz-business`, `stellar-tipz-http`, `stellar-tipz-process`.
  `TipsFlowStopped` is the primary outage signal: successful tips at zero for
  15 minutes while the same window yesterday had traffic. Baseline comparisons
  (`offset 1d`) keep low-traffic hours quiet. Business alerts only reference
  `system_error`, never `user_error`. Validate with
  `promtool check rules backend/observability/prometheus/alerts.yml`.

`src/common/observability/observabilityAssets.test.ts` parses both files and
fails if any referenced metric is not emitted by the code, so the assets cannot
drift from the registry.

## Overhead of the HTTP middleware

Measured with `scripts/bench-http-metrics.ts`, which runs each server variant in
its own process (JIT state does not leak between variants) with the load
generator in the parent process, 5 rounds, order rotated per round, medians
reported. The endpoint is a trivial JSON echo, which is the worst case: real
requests spend milliseconds in Postgres and Redis, so the share is far smaller
in production.

| Variant | Server CPU per request | Client p50 (8 connections) |
|---|---|---|
| no middleware | 118 µs | 705 µs |
| no-op middleware | 113 µs | 716 µs |
| RED middleware | 159 µs | 943 µs |

The middleware costs about 41 µs of CPU per request on this endpoint (Node 24,
laptop-class CPU). Client-observed latency under 8 concurrent connections grows
by more because a single-threaded server queues requests, so CPU per request is
the number to compare. The synthetic loop that runs only the middleware, with
no HTTP stack, measures 6.5 µs; the difference is prom-client label hashing and
the response listeners executing cold inside event callbacks rather than inlined
in a hot loop. On a request that takes 5 ms this is under 1%.

```bash
NODE_ENV=test npx tsx scripts/bench-http-metrics.ts 5000 5
BENCH_CONCURRENCY=1 NODE_ENV=test npx tsx scripts/bench-http-metrics.ts 3000 5
NODE_ENV=test npx tsx scripts/bench-http-metrics.ts 3000 3 --breakdown   # one variant per component
```

`httpMetrics.test.ts` also asserts an upper bound on the synthetic cost so a
regression in the middleware itself fails the unit suite.

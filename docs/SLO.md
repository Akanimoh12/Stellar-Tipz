# Service-level objectives and error budgets

This document defines what “working well enough” means for the public API and
its chain-data indexer. SLOs apply to production traffic only; staging and
synthetic probes have the `environment="staging"` label and are deliberately
excluded. A request that the client cancelled, or a validation/authorization
response in the `4xx` range, is not an API failure: the service did what it was
asked to do. A `5xx`, timeout, or malformed upstream response is a failure.

## Objectives

| User journey | Indicator and target | Why this target protects users | Error budget (30 days) |
|---|---|---|---:|
| API availability | At least **99.5%** of eligible API requests succeed. | A creator can tolerate a rare retry, but a 0.5% failure allowance caps failures at about 3h 36m/month before routine browsing and tip confirmation become unreliable. | 0.5% = 216 minutes of equivalent full outage |
| API latency | **p50 ≤ 300 ms**, **p95 ≤ 1 s**, and **p99 ≤ 2.5 s** for successful eligible API requests. The error-budget SLI is at least **99% ≤ 1 s**. | The median keeps normal navigation immediate; one second keeps the slow path from feeling stalled; 2.5 seconds is the longest wait before users are likely to retry or abandon a tip flow. | 1% of requests slower than 1 s = 432 minutes of equivalent full slow service |
| Indexer freshness | At least **99.9%** of one-minute observations have lag **≤ 60 seconds** from the latest finalized Stellar ledger. | Tips, balances, and leaderboards need to appear within roughly a ledger cycle; a 60-second bound allows transient RPC delay without showing materially stale creator data. | 0.1% = 43.2 minutes/month of stale observations |

The percentile targets are not round-number aspirations: they reflect the
interaction boundaries above. Availability and the p95 latency SLI use
request counts, while freshness uses one-minute observations. The p50 and p99
are additionally recorded on the SLO dashboard so regressions at either end
of the latency distribution are visible even when the p95 budget remains
healthy.

## Measurement contract

Instrument the services with these Prometheus metrics and labels:

- `app_http_requests_total{service="api",environment="production",code}` —
  increment once after every API request.
- `app_http_request_duration_seconds_bucket{service="api",environment="production",le}` —
  histogram observed for the same request population. Use buckets that include
  `0.3`, `1`, and `2.5` seconds.
- `indexer_last_processed_ledger{environment="production"}` and
  `stellar_latest_finalized_ledger{environment="production"}` — gauges
  scraped at least once a minute. Convert ledger difference to seconds with
  the configured `STELLAR_LEDGER_CLOSE_SECONDS` (default 5 seconds).

Dashboards must show the 30-day good/total ratio, remaining budget
`100 × (1 - bad_ratio / allowed_bad_ratio)`, current burn rate, and the three
latency percentiles. The recording rules in
[`monitoring/prometheus/rules/slo-alerts.yml`](../monitoring/prometheus/rules/slo-alerts.yml)
provide these series. Missing telemetry is an operational defect and is
covered by the telemetry alert, rather than silently counted as good.

## Error-budget calculation and policy

For each SLO over the rolling 30-day window:

```text
bad ratio        = bad events / eligible events
budget remaining = max(0, 1 - bad ratio / (1 - objective)) × 100
burn rate        = bad ratio / (1 - objective)
time to exhaust  = 30 days / burn rate
```

Example: 1.5% of API requests fail in the last hour. The availability budget
is 0.5%, so the burn rate is `1.5 / 0.5 = 3`; if it continued, the monthly
budget would be exhausted in ten days. Recording rules publish the ratios,
budget remaining, and both fast and slow burn rates under the `tipz:slo:*`
prefix. A release that would intentionally consume more than 10% of any
remaining budget requires the on-call owner’s approval; pause feature work and
prioritize reliability once a 30-day budget is exhausted.

## Burn-rate alerting

Alerts are **not** based on raw latency or error thresholds. They page only
when a short and a long window both burn the same budget rapidly, which filters
brief blips:

| Alert | Windows and burn rate | Budget consumed if sustained | Notification |
|---|---|---:|---|
| Fast burn | 5m and 1h both > 14.4× | 2% in 1h | Page (critical) |
| Slow burn | 30m and 6h both > 6× | 5% in 6h | Ticket/urgent Slack (warning) |
| Indexer freshness fast burn | 5m and 1h both > 14.4× | 2% in 1h | Page (critical) |

The exact alert rules, severity labels, and runbook URLs are versioned as
code in [`monitoring/prometheus/rules/slo-alerts.yml`](../monitoring/prometheus/rules/slo-alerts.yml).
Every alert has a runbook; see [`docs/runbooks/`](runbooks/README.md).

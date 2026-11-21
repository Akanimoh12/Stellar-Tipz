# Cost monitoring — #1368

Tracked drivers: IPFS pinning, Soroban RPC, Horizon, PostgreSQL storage/CPU/connection load, and Redis memory/commands. Request counts and operator-set per-call estimates are exposed as `tipz_paid_service_requests_total` and `tipz_estimated_variable_cost_usd_total`. **Estimates are not actual provider bills:** use daily billing exports for IPFS stored bytes, RPC overage, managed PostgreSQL, Redis and egress. Tie invoices to corresponding Prometheus usage and investigate discrepancies.

Compute `actual daily USD cost / unique real active users that day` and `actual daily USD cost / successful confirmed real tips that day`. If the denominator is zero, show N/A. Compare daily, 7-day and monthly baselines before acting. Run the synthetic monitor with a physically separate testnet database, metrics tenant and leaderboard; exclude its traffic from production unit economics. Set cloud vendor budget caps and alert routes outside this repository.

`backend/src/common/middleware/rateLimiter.ts` currently applies a Redis-backed 20 requests/minute upload limit before Multer parses a paid-IPFS request. On Redis outage the limiter fails closed. Keep gateway/client IP trust settings strict and impose reverse proxy upload limits. Paid-service request spikes have separate alerts in `backend/observability/prometheus/cost-alerts.yml`.

**Optimization examples (estimates, not observed savings):** if an RPC provider bills $20/day for requests, caching 30% of repeatable calls saves approximately $6/day assuming no fixed minimums. Compressing 25% of $40/day IPFS storage costs saves up to $10/day if billed bytes reduce proportionally. Evaluate Redis cache hits, storage retention and query indexes monthly.

Set validated environment parameters `COST_IPFS_REQUEST_USD`, `COST_SOROBAN_RPC_REQUEST_USD`, and `COST_HORIZON_REQUEST_USD` to current contracted *variable per-call* prices; defaults are zero and **do not imply a free service**. Cloud fixed fees, storage and other usage must be supplied from provider billing exports.

Run `node backend/scripts/cost-report.mjs invoice.json` with a daily provider invoice JSON document in the shape `{"date":"YYYY-MM-DD","services":{"ipfs":2,"soroban_rpc":1,"horizon":1,"postgres":5,"redis":1},"activeUsers":20,"confirmedTips":100}` to compute invoiced USD per real active user and tip without mixing denominators. Never commit invoice contents or PII to Git.

# Synthetic testnet transaction monitoring — #1370

The hourly/manual workflow `.github/workflows/synthetic-testnet.yml` uses a funded TESTNET-only secret in the `synthetic-testnet` environment. Configure `SYNTHETIC_TESTNET_SECRET` secret plus `SYNTHETIC_RECIPIENT`, `SYNTHETIC_CONTRACT_ID`, `SYNTHETIC_API_URL` variables. Provision dedicated sender/recipient accounts; the recipient must already be registered on the dedicated testnet backend. Allow only funded testnet accounts, never a real-money secret.

The script prepares the transaction via the API, signs it, sends an actual 0.01 XLM Soroban tip, polls RPC until confirmed, then checks the indexer's projection via public GET /tips. It logs latency and the failing stage; workflow failure must be wired to an on-call notification integration. Timeout is 90 seconds. First scheduled successful run is required before claiming monitoring is live.

**Non-negotiable metric isolation:** deploy this monitor against a separate TESTNET backend **with its own database, Redis, analytics, Prometheus tenant and leaderboard**, never the production database. Synthetic transactions must not be included in production metrics, active-user/tip denominators, rewards, leaderboards or cost-per-tip figures. Do not copy isolated synthetic data into production. Use infrastructure account chargeback for synthetic monitoring overhead.

The isolated API hostname must contain `testnet` or `synthetic`; this prevents accidentally targeting the public production API. A successful on-chain tip that takes more than `SYNTHETIC_LATENCY_ALERT_MS` (default 60000 ms) still fails the scheduled check and identifies an end-to-end latency breach.

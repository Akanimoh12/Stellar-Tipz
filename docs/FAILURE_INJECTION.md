# Failure Injection Checks

The backend failure-injection suite records the expected degradation contract
for the API and runs with the disposable PostgreSQL and Redis test services in
CI.

Run locally with:

```bash
cd backend
npm run test:failure-injection
```

| Injected fault | Expected behavior | Recovery assertion |
| --- | --- | --- |
| Database unavailable | `GET /health/ready` returns `503` with a `postgres` failure check. `GET /health/live` remains available. | Restoring the database probe returns readiness to `200` without restarting the health service. |
| Redis unavailable | Readiness returns `503` with a `redis` failure check. Realtime projection publishing is best-effort and does not throw or alter the event. | Restoring Redis returns readiness to `200`; a later projection is published with the original payload. |
| RPC error | Readiness returns `503` with a `soroban-rpc` failure check and a generic unavailable message. | A successful subsequent probe returns readiness to `200`. |
| RPC timeout | Readiness returns `503` with `soroban-rpc timed out after 20ms`; the request is bounded rather than hanging. | A successful subsequent probe returns readiness to `200`. |

Readiness failures are intentionally explicit for orchestration and monitoring,
while liveness remains dependency-independent so a transient outage does not
cause a healthy process to be restarted. The suite uses injectable dependency
probes, so no test can corrupt the real database or chain state.

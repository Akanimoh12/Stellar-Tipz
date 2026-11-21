# Progressive production deployment runbook

## Preconditions

The repository uses Vercel for its frontend and a separate backend, database and Stellar contract. The `canary-release.yml` workflow manages **Vercel traffic only**. It does not split backend traffic or safely migrate the database automatically.

Vercel Rolling Releases must be enabled for the linked project (requires a compatible paid Vercel plan). Configure **manual-approval** stages of 10%, 50%, then 100% before running the workflow:

```sh
vercel rolling-release configure --cfg='{"enabled":true,"advancementType":"manual-approval","stages":[{"targetPercentage":10},{"targetPercentage":50},{"targetPercentage":100}]}'
```

The production environment must have Vercel credentials (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) and the following Prometheus configuration:

- `PROMETHEUS_URL`: HTTPS address to the Prometheus server.
- `PROMETHEUS_TOKEN`: optional bearer token; keep it in **secrets**, not variables.
- `BASELINE_ERROR_QUERY` and `CANARY_ERROR_QUERY`: PromQL instant-vector selectors each returning precisely one numeric series representing request error fraction (0–1) for stable and canary deployments in equivalent windows.
- `BASELINE_LATENCY_QUERY` and `CANARY_LATENCY_QUERY`: equivalent p95 latency in seconds. Both use the same observation window.

Queries **must** select stable vs canary deployment labels and represent real user traffic. If metrics are absent/ambiguous, the workflow fails instead of promoting. Default alert gates: canary error rate can exceed stable by at most **1 percentage point**, and canary p95 may be at most **1.25×** stable. Customize with `MAX_ERROR_RATE_INCREASE` and `MAX_LATENCY_RATIO` if the thresholds are separately approved. Low-traffic deployments may not generate enough samples for a statistically meaningful decision; treat this as no-go, not as a pass.

## Procedure

1. Verify the production deployment's smoke checks and that the previous stable deployment is still available.
2. Run **Canary Promotion** from the GitHub Actions tab using the Vercel release candidate deployment URL.
3. Inspect actual sampled traffic, error rates, latency, and Sentry alerts during the 10% and 50% stages. Do not promote solely based on a zero-error sample with no requests.
4. The workflow compares both metrics at each stage. A failed query or regression prevents further promotion and invokes `vercel rolling-release abort`. If the Vercel control plane cannot abort, page an operator to use the Vercel dashboard's rollback and verify the stable version is restored.
5. Review the final 100% metrics and record the deployment URL, commit SHA, stage transitions, and observed metrics in the change log.

The standalone comparator can also be invoked with `node scripts/check-canary-metrics.mjs`, using the same environment configuration. It exits nonzero on missing/unusable metrics or regressions.

### Database migration compatibility

Before enabling a canary, enforce expand/contract:
- **Expand:** deploy additive/nullable columns, backward-compatible API behavior, and dual reads/writes when needed; validate both old and new binaries against the expanded schema.
- **Transition:** backfill safely and run canary while both code versions remain compatible.
- **Contract:** only after full rollout and rollback window, remove unused schema fields in a separate change.

Never deploy irreversible destructive migrations with a canary. On rollback, leave the expanded schema intact until both application versions are confirmed healthy.

## Important limitations

This workflow requires the project administrator to configure Rolling Releases, secret scopes, stage percentages, deployment labels, and metric queries. It cannot safely infer those settings. It also cannot automatically guarantee that a rollback succeeds during a provider outage. Run a deliberate rollback drill against a nonproduction release before enabling production promotion.

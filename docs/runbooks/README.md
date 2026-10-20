# Operations runbooks

No alert may be merged unless its `runbook_url` points to a runbook in this
directory. Each runbook uses the template below and is owned by the service
team named in its alert label.

## Runbook template

```markdown
# <Alert name>

## Page criteria
- Severity, SLO, and user impact.

## Diagnose
1. Confirm the alert and inspect the SLO dashboard.
2. Check recent deploys, dependencies, and logs/traces.

## Mitigate
1. Take the lowest-risk action that restores the user journey.
2. Escalate if the action is not reversible or funds could be affected.

## Verify and follow up
1. Verify the burn rate falls below the alert threshold.
2. Record timeline, budget spent, cause, and corrective work.
```

## Testing alert changes

Run this before merging a rule change (Docker supplies a pinned Prometheus
binary, so no host installation is required):

```bash
docker run --rm -v "$PWD:/repo:ro" -w /repo prom/prometheus:v2.54.1 \
  promtool check rules monitoring/prometheus/rules/slo-alerts.yml
docker run --rm -v "$PWD:/repo:ro" -w /repo prom/prometheus:v2.54.1 \
  promtool test rules monitoring/prometheus/tests/slo-alerts.test.yml
```

The first command validates rule syntax. The fixture feeds sustained `5xx`
traffic and must make the fast availability-burn alert fire; it prevents a
rule edit from silently disabling paging. For every changed alert, also use a
staging-only failure injection (never production): inject a sustained error,
latency, or indexer delay for longer than its `for` duration; confirm the
specified route reaches the expected severity and its runbook URL; then remove
the injection and confirm resolution. Document the result in the change or
incident record.

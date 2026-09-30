# Missing SLO telemetry

## Page criteria

`SloTelemetryMissing` is a warning because an absent metric makes the SLO
untrustworthy rather than proving user impact. It must still be investigated
within the on-call shift.

## Diagnose

1. Confirm the affected production scrape target and whether the service is
   running. Check Prometheus target health, relabeling, and recent metric-name
   changes.
2. Compare exporter logs and `/metrics` output with the measurement contract
   in [`docs/SLO.md`](../SLO.md).

## Mitigate

1. Restore the scrape target, revert an incompatible instrumentation change,
   or repair labels so production series are emitted.
2. Do not fabricate metrics or treat missing data as successful requests.

## Verify and follow up

1. Confirm metrics return, recording rules evaluate, and dashboards show a
   fresh sample for ten minutes.
2. Add a regression test or deployment guard for the reason telemetry stopped.

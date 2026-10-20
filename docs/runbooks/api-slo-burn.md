# API availability or latency SLO burn

## Page criteria

`ApiAvailabilityBudgetFastBurn` or `ApiLatencyBudgetFastBurn` pages at
critical severity when both the five-minute and one-hour windows burn more
than 14.4 times their respective 30-day budget. `ApiAvailabilityBudgetSlowBurn`
is warning-only and creates an urgent ticket. Users cannot reliably load data
or may abandon/retry a tip because requests fail or exceed one second.

## Diagnose

1. Acknowledge the alert and open the SLO dashboard. Verify both windows, the
   30-day remaining budget, error codes, and p50/p95/p99; do not act on a
   single raw-threshold spike.
2. Correlate the start time with deploys, configuration/feature-flag changes,
   RPC provider health, rate limiting, and application logs/traces.
3. Segment by route, status code, region, and upstream. Confirm whether the
   impact includes `sendTransaction`; transaction safety takes priority over
   throughput.

## Mitigate

1. Roll back or disable the most recent unsafe change if correlation is clear.
2. If the Stellar RPC dependency is degraded, fail over to the approved
   provider, reduce nonessential read traffic, and communicate degraded
   service. Do not retry or resubmit customer transactions blindly.
3. Scale or shed optional traffic only after preserving tip submission and
   transaction-status reads. Escalate to the incident commander if the fast
   burn persists for 15 minutes or a customer-fund flow is uncertain.

## Verify and follow up

1. Confirm both burn windows fall below their threshold and request success
   and p95 latency recover. Monitor at least one long-window evaluation.
2. Record customer impact, budget consumed, root cause, mitigation, and a
   follow-up item. Review the SLO only after the incident; never loosen it to
   silence an alert.

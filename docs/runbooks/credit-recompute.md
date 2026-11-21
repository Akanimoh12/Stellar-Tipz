# Credit score recomputation: stalled or anomalous

**Signals:** `CreditScoreRecomputeStalled`, `CreditScoreOldestStale`, `CreditScoreRecomputeFailure`; `tipz_credit_score_distribution{bucket=...}` drift between runs.

1. Verify the jobs process is alive and the `CREDIT_RECOMPUTE_CRON` (default every six hours) is registered. Check BullMQ `credit-recompute` queue for failed or waiting tasks.
2. Inspect logs for `Failed to recompute credit score` and `Credit recompute job failed`. Look for database connectivity, tip aggregates and partial failures. A partial run is failed deliberately, not reported as healthy.
3. Compare `tipz_credit_score_distribution` against the previous successful run; an abrupt shift despite zero processing failures can mean a scoring-formula regression. Pause deployment and verify the score formula vectors in `backend/tests/credit-score-vectors.test.ts`.
4. Check `tipz_credit_score_oldest_age_seconds` and `tipz_credit_recompute_last_success_timestamp_seconds` across the **jobs** process. Ensure the metrics endpoint is scraped and the alert rules are loaded; an absent series may mean the jobs process has never run and needs a separate absent-metric rule.
5. Once the root cause is fixed, retry the failed BullMQ job safely and monitor the score age, recompute duration and distribution until normal. Do not edit scores manually.

**Caveat:** The age gauge is sampled at recomputation time and not continuously incremented. `time() - tipz_credit_recompute_last_success_timestamp_seconds` is the continuous stalled-job signal; missing-score coverage should be audited separately. Metric labels never contain user identities.

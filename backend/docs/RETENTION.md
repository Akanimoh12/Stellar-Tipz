# Data retention

Retention runs daily at `RETENTION_PRUNE_CRON` (03:00 UTC by default) in the
BullMQ jobs process. `RETENTION_BATCH_SIZE` caps every selected ID slice and
defaults to 500 rows. A run selects IDs, deletes only that slice, and repeats;
there is no unbounded delete. If the worker stops, the next run starts with
the remaining eligible rows.

| Model | Retention | Policy | Justification |
| --- | ---: | --- | --- |
| `AuthChallenge` | Until `expiresAt` | Delete | One-use authentication nonces are invalid after expiry and contain no audit value. |
| `Notification` | 90 days | Delete | User-facing delivery history is operational data; the user can export current account data before deletion. |
| `WebhookDelivery` | 90 days | Delete | Delivery attempts are operational diagnostics; the webhook payload is not an audit record. |
| `AnalyticsDaily` | 730 days | Delete | Two years supports product reporting while avoiding unbounded aggregates. |
| `EventLog` | 365 days live | Archive, then delete | Raw on-chain events support audit/replay and are copied to `EventLogArchive` before removal. |

Event-log archival and deletion happen in one transaction per batch. Archive
inserts use `skipDuplicates`, so an interrupted/retried batch is idempotent.
Only after the archive insert succeeds are source rows deleted.

The `/metrics` response exposes cumulative `retention.rows_pruned_total`
counters by model. These counters reset when the process restarts; the archived
event rows and job logs remain the durable operational record.
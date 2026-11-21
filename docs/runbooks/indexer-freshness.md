# Indexer freshness SLO burn

## Page criteria

`IndexerFreshnessBudgetFastBurn` is critical when indexed data is more than 60
seconds behind the latest finalized ledger in both burn windows. Users may see
old tips, balances, or leaderboards even while the chain is healthy.

## Diagnose

1. Confirm the difference between `stellar_latest_finalized_ledger` and
   `indexer_last_processed_ledger`, verify the configured five-second ledger
   close conversion, and check both source metrics are fresh.
2. Inspect indexer logs for failed ledger fetches, decode errors, database
   backpressure, and consumer lag. Check Stellar RPC and database health.
3. Identify the earliest missing ledger and whether the indexer can replay it
   idempotently. Do not skip ledgers to make the gauge look healthy.

## Mitigate

1. Restore the RPC/database dependency or roll back the correlated indexer
   release. Pause nonessential indexing work if it competes with ledger ingest.
2. Restart only the failed consumer after preserving its checkpoint. Replay
   from the earliest missing finalized ledger using the approved idempotent
   replay procedure.
3. Escalate before data deletion, checkpoint rewrites, or a replay that could
   duplicate externally visible events.

## Verify and follow up

1. Confirm the indexed ledger catches up, remains within 60 seconds, and both
   burn windows recover. Spot-check a recent tip and leaderboard entry.
2. Record gap size, affected interval, budget spent, cause, and remediation.

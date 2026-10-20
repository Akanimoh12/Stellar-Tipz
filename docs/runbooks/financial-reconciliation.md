# Daily financial reconciliation

Runs at 01:30 UTC for the prior UTC date. Inspect BullMQ queue `financial-reconciliation` and the `AuditLog` records with `action=financial_reconciliation` and `resourceId=<YYYY-MM-DD>`. Each report contains exact stroop totals and transaction hashes for mismatches; do not suppress discrepancies merely because aggregate totals match.

1. Check jobs process, queue failure state, indexer cursor lag and ledger continuity before concluding an event is missing.
2. Compare fee events with matching recorded withdrawal transactions, including the historical `fee_bps` and minimum one-stroop rule. Compare tips and refunds by transaction hash; `networkFee` is not the protocol fee.
3. Check the `tipz_financial_reconciliation_unresolved` gauge and `tipz_financial_reconciliation_discrepancies_total`; investigate every discrepancy (tolerance is **one stroop**, never an XLM or percentage allowance).
4. Preserve the audit record and export the relevant transaction and ledger IDs before any repair. Re-index missing events safely if a lagging indexer explains the gap.

**Known blocker:** `EventLog.createdAt` is the time an event was indexed, **not its authoritative ledger close time**. This initial implementation intentionally labels reports `unverifiable` and raises an alert until event ledger timestamps and a complete range watermark exist. Do not turn that safety guard off or claim fee reconciliation is proven without it. Store and retain complete ledger-day audit snapshots before enabling success alerts. This is an operational partial implementation of issue #1358, not yet a final reconciled financial control.

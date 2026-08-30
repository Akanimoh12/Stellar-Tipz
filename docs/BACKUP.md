# Database Backup & Restore-Verification

`docs/DEPLOYMENT.md` §4 covers migration rollback. This document covers the
Postgres data backup itself: the schedule, retention, the **automated restore
verification** that proves a backup is usable, and the measured RTO/RPO.

> An unverified backup is not a backup. The verification job in
> [`.github/workflows/backup-verify.yml`](../.github/workflows/backup-verify.yml)
> restores the latest dump into a throwaway database on a schedule and fails
> loudly if anything is wrong (issue #1256).

---

## 1. Backup schedule & retention

| Backup | Cadence | Tool | Retention |
|---|---|---|---|
| **Full logical dump** (`pg_dump -Fc`) | every 6h | managed provider snapshot **or** `pg_dump` to object storage | 7 days |
| **Daily full dump** | 02:00 UTC | `pg_dump -Fc` → object storage (`s3://<bucket>/pg/daily/`) | 30 days |
| **Weekly full dump** | Sunday 02:00 UTC | as above → `.../pg/weekly/` | 12 weeks |
| **PITR / WAL archiving** (managed provider) | continuous | provider-managed | 7 days |

Dumps are gzipped and server-side encrypted. The object-storage bucket has
versioning + a deny-delete policy on the `daily/` and `weekly/` prefixes so a
compromised app credential cannot erase history.

Naming: `tipz-<env>-<YYYYMMDDTHHMMSSZ>.dump.gz`. The verification job always
targets the **most recent** object under the `daily/` prefix.

## 2. RPO (Recovery Point Objective)

| Scenario | RPO |
|---|---|
| Managed provider with PITR | **≤ 5 min** (WAL replay to any point) |
| Object-storage dumps only (PITR unavailable) | **≤ 6 h** (the full-dump cadence) |

The off-chain store is a *projection* of on-chain events. Data newer than the
last backup is **recoverable by re-indexing** from the contract: set
`INDEXER_START_LEDGER` to the ledger at the backup's `IndexerCursor.lastLedger`
and let the indexer replay. Projections are idempotent (see
`backend/src/indexer/projections.ts`), so the effective RPO for
indexer-derived tables is **0** as long as the chain history is available;
the RPO above applies to user-authored data (auth sessions, notification
preferences, withdrawals in flight).

## 3. RTO (Recovery Time Objective)

**Target RTO: 60 min** from decision-to-restore to application serving reads.

Measured components (update after each real drill or a verification run — see
[§5](#5-measuring-rto)):

| Step | Assumed | Last measured | Date |
|---|---|---|---|
| Fetch latest dump from object storage | 2 min | _TBD_ | _TBD_ |
| `pg_restore` into a fresh database | 10 min | _see CI artifact_ | _see CI run_ |
| Run `prisma migrate deploy` (no-op if dump is current) | 1 min | _TBD_ | _TBD_ |
| App config swap + health check green | 5 min | _TBD_ | _TBD_ |
| Re-index gap (if PITR unavailable) | 15 min | _TBD_ | _TBD_ |

> **Do the drill.** Teams routinely find their real RTO is several times the
> assumption. The verification job records the actual `pg_restore` duration on
> every run; a quarterly full drill records the rest.

## 4. Automated restore verification

The **restore is the test.** [`backend/scripts/verify-backup-restore.ts`](../backend/scripts/verify-backup-restore.ts):

1. Downloads the latest `daily/` dump (or uses `BACKUP_DUMP_PATH` for a local file).
2. `pg_restore`s it into `SCRATCH_DATABASE_URL` (a disposable database — the CI
   job provisions a fresh Postgres service for this; **never** point it at prod).
3. Validates the restored copy:
   - **Schema version** — the newest row in `_prisma_migrations` matches the
     newest local `backend/prisma/migrations/` directory.
   - **Row counts** — every core table (`User`, `Tip`, `Refund`, `Goal`,
     `Subscription`, `EventLog`, `IndexerCursor`, `Withdrawal`) is non-empty
     for a production dump, and within a tolerance band of the previous
     verification's counts (a sudden drop is a corruption signal).
   - **Spot-check queries** — referential integrity (`Tip.fromAddress` /
     `toAddress` resolve to a `User` or are explicitly external), no
     `EventLog` gap wider than a threshold in the processed range, the
     `IndexerCursor` ledger is plausible vs. `EventLog.MAX(ledger)`.
4. Records the wall-clock restore duration and prints an **RTO line** the CI
   job uploads as an artifact and surfaces in the run summary.
5. **On any failure**: non-zero exit, a red CI run, and — if
   `BACKUP_ALERT_WEBHOOK_URL` is set — a POST to that webhook (Slack/PagerDuty
   incoming webhook shape) so it pages, not just emails.

Run locally against a file:

```bash
cd backend
SCRATCH_DATABASE_URL=postgres://postgres:postgres@localhost:5433/scratch \
BACKUP_DUMP_PATH=/path/to/tipz-prod-20260830T020000Z.dump \
npm run backup:verify
```

## 5. Measuring RTO

Every scheduled `backup-verify` run measures and logs the `pg_restore` step.
To measure the **full** RTO, run a quarterly drill:

1. Provision a database of production size.
2. `time backend/scripts/verify-backup-restore.ts` end to end.
3. Restore application config pointing at the drill database, hit
   `/health/ready`, confirm it goes green.
4. Update the "Last measured" column in [§3](#3-rto-recovery-time-objective)
   and file a follow-up if the total exceeds the 60-min target.

## 6. What is NOT covered here

- **Contract / chain state** — immutable and reconstructable; see
  `docs/DEPLOYMENT.md` §6.
- **Redis** — cache + realtime fan-out only; treated as ephemeral. A cold
  Redis rebuilds from Postgres + the chain on the next indexer tick.
- **Object storage (IPFS pins, uploads)** — separate backup policy owned by
  the media pipeline.

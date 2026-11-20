# Prisma migration rollback

How to revert a failed (or bad) Prisma migration safely in every environment.
This is the detailed, per-environment companion to the incident summary in
[`DEPLOYMENT.md` §5](./DEPLOYMENT.md#5-database-migration-rollback-runbook).
Policy for *writing* risky migrations lives in
[`DB_MIGRATION_POLICY.md`](./DB_MIGRATION_POLICY.md); backups and restore
verification live in [`BACKUP.md`](./BACKUP.md).

All commands run from `backend/` (where `prisma/schema.prisma` lives) unless
stated otherwise. Migration files are in `backend/prisma/migrations/`.

---

## 1. Ground rules

1. **Prisma has no `migrate down`.** Migrations are forward-only. "Rollback"
   means one of: (a) discard a disposable database, (b) run a hand-written
   `down.sql`, (c) restore a backup, or (d) ship a new forward migration that
   undoes the change.
2. **Never edit or delete an applied migration folder.** Prisma stores a
   checksum of every applied `migration.sql` in `_prisma_migrations`. Editing
   one makes every other environment report drift. Fix forward with a new
   migration instead.
3. **Never edit `_prisma_migrations` by hand.** The only supported way to
   change its state is `prisma migrate resolve` (see [§3](#3-recovering-from-a-failed-migration-p3009--p3018)).
4. **Snapshot before you touch anything** in staging or production, and record
   the output of `npx prisma migrate status` in the incident log.
5. **Stop writers first.** Pause deploys and workers (indexer, webhook /
   notification workers, schedulers) that write to the affected tables before
   running rollback SQL.
6. **A migration's `down.sql` is not run by any tool.** It is a reviewed,
   hand-executed script (`psql -v ON_ERROR_STOP=1 -f ...`). Only some
   migrations have one — see [§6](#6-which-migrations-can-be-rolled-back).

---

## 2. Decide which path you are on

```text
Did `prisma migrate deploy` fail part-way (P3009 / P3018 / non-zero exit)?
├─ Yes → §3 Recover from a failed migration, then pick a path below
└─ No, it succeeded but the change is wrong/harmful
        │
        ├─ Local / CI / ephemeral DB ───────────────→ §4.1 / §4.2 reset it
        ├─ Staging, migration has down.sql ─────────→ §4.3 run down.sql
        ├─ Production, migration has down.sql ──────→ §4.4 run down.sql
        ├─ Data was dropped / no down.sql ──────────→ §5 restore from backup
        └─ Change is additive & harmless to old code → leave it; ship a forward
                                                        fix (§7) — cheapest option
```

Prefer **forward-fix** whenever the old application version still runs against
the new schema (additive columns, new tables, new indexes). Roll the
*application* back, leave the schema, and fix forward on your own schedule.

---

## 3. Recovering from a failed migration (P3009 / P3018)

When a migration fails mid-deploy Prisma records it as failed in
`_prisma_migrations` (`finished_at IS NULL`, `rolled_back_at IS NULL`) and
**refuses to apply anything else** until you resolve it:

```text
Error: P3009
migrate found failed migrations in the target database, new migrations will
not be applied.
```

PostgreSQL runs a multi-statement migration script as one implicit
transaction, so a plain failing script normally leaves **no partial schema
changes** behind. Do not assume that, though — verify (step 2). Scripts that
contain explicit `COMMIT`s or statements that cannot run in a transaction
(`CREATE INDEX CONCURRENTLY`; note the comment in
`20260828000000_add_audit_indexes_concurrency`) can leave partial state.

1. **Inspect the failure.**

   ```bash
   npx prisma migrate status
   psql "$DATABASE_URL" -c \
     "SELECT migration_name, started_at, finished_at, rolled_back_at, logs
        FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL;"
   ```

2. **Check what actually changed.** Compare the failed `migration.sql` with the
   live schema (`psql "$DATABASE_URL" -c '\d "<Table>"'`). Three outcomes:

   | State of the database | Action |
   |---|---|
   | Nothing from the migration was applied | Mark it rolled back (step 3a) |
   | Partially applied | Manually undo the partial changes in a transaction, **then** mark it rolled back (3a) — or finish the remaining statements by hand and mark it **applied** (3b) |
   | Fully applied (e.g. failure was after the DDL, such as a timeout recording the result) | Mark it applied (3b) |

3. **Resolve the history.**

   ```bash
   # 3a. Failed and the DB is back to its pre-migration state
   npx prisma migrate resolve --rolled-back <migration_name>

   # 3b. The DB already matches what the migration intended
   npx prisma migrate resolve --applied <migration_name>
   ```

4. **Fix the migration source and redeploy.** If the migration had *not* been
   applied anywhere successfully, correct `migration.sql` in a PR. If it
   succeeded in another environment, **do not edit it** — add a new migration.
   Then run `npx prisma migrate deploy` again.

`prisma migrate resolve` only changes the bookkeeping row; it never runs SQL.

---

## 4. Per-environment procedures

| Environment | How migrations are applied | Rollback approach | Needs approval |
|---|---|---|---|
| Local dev (compose) | `migrate` service runs `prisma migrate deploy && npm run db:seed` (root `docker-compose.yml`); or `npm run prisma:migrate` (`migrate dev`) | Reset the database | No |
| CI / integration tests | `prisma migrate deploy` on a fresh Postgres 16 service (`pr-checks.yml`); integration tests use `prisma db push`, falling back to `migrate deploy` | Throw away the service container | No |
| Staging | `prisma migrate deploy` against the staging `DATABASE_URL` | `down.sql` rehearsed here, or restore snapshot | Team lead |
| Production | `prisma migrate deploy` against the production `DATABASE_URL` | `down.sql` (rehearsed in staging first) or restore backup | Incident commander + 2nd engineer |

### 4.1 Local development (Docker compose)

The database is disposable. Do not try to hand-reverse a bad local migration.

```bash
# Full stack (repo root): destroy the volume, re-apply every migration, re-seed
docker compose down -v
docker compose up        # `migrate` service re-runs migrate deploy + db:seed

# Backend-only stack (backend/docker-compose.yml)
docker compose -f backend/docker-compose.yml down -v
docker compose -f backend/docker-compose.yml up -d postgres
```

If you are using `prisma migrate dev` against your own local Postgres, reset
and re-apply (this **drops all data** in that database):

```bash
npx prisma migrate reset          # drop, re-apply all migrations, run seed
```

Working on a migration that is not merged yet and want to redo it? Delete the
*unmerged* migration folder, `migrate reset`, then run `npm run prisma:migrate`
again. Never do this for a migration that has been merged or deployed anywhere.

### 4.2 CI / integration tests

Nothing to roll back — each run starts from an empty PostgreSQL 16 container
and applies the full history. If `migration-safety` fails:

- **Failed to apply** → the migration SQL is broken or the history is out of
  order. Fix `migration.sql` in your PR branch (safe, it has not been
  released) and push. Reproduce locally with `npm run test:db:reset` from
  `backend/`, then `npx prisma migrate deploy` against that database.
- **Destructive-operation finding** → either restructure using the
  expand/contract phases in `DB_MIGRATION_POLICY.md`, or add the
  `migration-approved` label / `/migration-ack` comment, and include a
  `down.sql` or `.irreversible` marker next to the migration.
- **`down.sql` rehearsal failed** → fix the down script; it is executed against
  a seeded database in CI to prove it works.

### 4.3 Staging

Staging is where a rollback is rehearsed before anyone touches production.

1. Pause the staging deploy pipeline and the workers writing to the affected
   tables. Run `npx prisma migrate status` and note the migration name.
2. Take a snapshot (managed-provider snapshot, or
   `pg_dump -Fc "$STAGING_DATABASE_URL" > staging-pre-rollback.dump`).
3. Review `backend/prisma/migrations/<migration>/down.sql`. It must be specific
   to that migration and contain no unbounded data rewrite.
4. Execute it in one transaction-safe run that stops on the first error:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -f prisma/migrations/<migration>/down.sql
   ```

5. Reconcile the migration history.
   - If the migration was in a **failed** state, mark it rolled back:
     `npx prisma migrate resolve --rolled-back <migration>`.
   - If it had **finished successfully**, `_prisma_migrations` still lists it
     as applied and `resolve --rolled-back` does not apply to it. Do **not**
     edit the table by hand. The live schema now differs from the history, so
     ship a revert migration (§7) promptly; until then do not run
     `prisma migrate dev` against this database, and note that a fresh database
     built from the history will still contain the change.

6. Deploy the previous application version, run health checks, re-run
   `npx prisma migrate status`, exercise the affected API flows, and resume
   workers.
7. Record what you ran, then open the forward-fix PR (§7).

### 4.4 Production

Same procedure as staging with the additional controls below. Do not skip any.

1. **Declare an incident** (see [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md))
   and name an incident commander plus a second engineer who reads every
   command before it runs.
2. **Stop writers.** Pause deploys, the indexer, and the webhook / notification
   workers touching the affected tables. Prefer pausing to scaling to zero so
   in-flight jobs are retried, not lost.
3. **Snapshot.** Confirm a fresh managed-provider snapshot / PITR marker exists,
   or take `pg_dump -Fc`. Record its identifier. Verify it with
   `npm run backup:verify` against a scratch database if time allows
   (see [`BACKUP.md`](./BACKUP.md)).
4. **Rehearse.** Restore that snapshot to a scratch database and run the exact
   `down.sql` there first. Confirm it completes and the old application
   version works against the result.
5. **Execute** on production through the approved change-control connection:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -f backend/prisma/migrations/<migration>/down.sql
   ```

   Watch for lock waits (`SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';`).
   Set `lock_timeout` in the session if the table is busy so the rollback
   fails fast instead of queueing behind long transactions.
6. **Re-align the application.** Deploy the application version that matches
   the rolled-back schema, run health checks, and verify
   `npx prisma migrate status` and the affected API workflows.
7. **Resume workers**, then watch error rate and queue depth for at least one
   full job cycle.
8. **Follow up** with a forward migration (§7) and an incident write-up. Keep
   the failed state/logs for forensics.

> Never run `prisma migrate reset` or `prisma db push --force-reset` against
> staging or production.

---

## 5. When there is no `down.sql` (data loss / irreversible)

If the migration dropped or rewrote data, no down script can bring it back.

1. Pause deploys and writers; keep the failed database untouched for forensics.
2. Restore the last known-good snapshot / PITR point **to an isolated
   database**, never over the live one ([`BACKUP.md`](./BACKUP.md)).
3. Validate it: schema version matches the pre-migration state
   (`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;`),
   row counts look right, `npm run backup:verify` passes.
4. Promote the restored database per the disaster-recovery procedure and point
   the application at it.
5. Recover post-snapshot data:
   - **Indexer-derived tables** (`Tip`, `Refund`, `EventLog`, `IndexerCursor`)
     are rebuilt from chain: set `INDEXER_START_LEDGER` to the restored
     `IndexerCursor.lastLedger` and let it replay — projections are idempotent.
   - **User-authored data** (sessions, notification preferences, in-flight
     withdrawals) is only as fresh as the snapshot; replay verified writes from
     logs/audit records.
6. Create a corrective forward migration; do not reapply the failed one as-is.

---

## 6. Which migrations can be rolled back

A migration is hand-reversible only if it ships a sibling `down.sql` (or is
purely additive and can be reversed with a revert migration). Destructive
migrations (`DROP`, `SET NOT NULL`, column type change) **must** include either
`down.sql` or an `.irreversible` marker — enforced by the `migration-safety`
CI job.

Migrations that currently have a `down.sql`:

| Migration | Reverts |
|---|---|
| `20260826000000_add_event_log_archive` | drops `EventLogArchive` (derived compliance copy; `EventLog` untouched) |
| `20260830130000_add_ledger_checkpoint` | drops `LedgerCheckpoint` (derived data, rebuilt by indexer) |
| `20260926000000_add_indexer_leader_epoch` | drops `IndexerCursor.leaderEpoch` (only removes fencing) |
| `20260926000100_analytics_rollups_and_creator_index` | drops `TipperRollup` and `Tip_toAddress_status_createdAt_cover_idx` (derived; top-tippers falls back to aggregating `Tip`) |

Every other migration has no down script. For those, the options are the
forward-fix path (§7) or a snapshot restore (§5). Before relying on a
`down.sql`, re-read it: it was written for the schema at that point in time.

---

## 7. Forward-fix (the default for shared environments)

After any rollback — or instead of one — add a new migration that moves the
schema to the desired state:

```bash
# on a branch, against a local database at the current production schema
npx prisma migrate dev --name revert_<what_you_are_undoing>
```

Review the generated SQL, make it idempotent where possible
(`IF EXISTS` / `IF NOT EXISTS`), and ship it through the normal PR + CI path.
For anything destructive, follow expand/contract from `DB_MIGRATION_POLICY.md`
and add a `down.sql` or `.irreversible` marker.

---

## 8. Pre-flight checklist for risky migrations

- [ ] Migration applies cleanly from empty **and** from a copy of production
- [ ] Old application version still works against the new schema (expand phase)
- [ ] `down.sql` written and rehearsed, or `.irreversible` marker explains why not
- [ ] Fresh backup / PITR point exists and was verified recently
- [ ] Large-table changes avoid long locks (batch backfills; apply `CREATE INDEX
      CONCURRENTLY` manually outside Prisma where needed)
- [ ] Rollback owner and second reviewer named for the deploy window

## 9. Quick reference

| Goal | Command |
|---|---|
| What is applied / pending / failed | `npx prisma migrate status` |
| Apply pending migrations (staging / prod / CI) | `npx prisma migrate deploy` |
| Clear a failed migration after DB is clean | `npx prisma migrate resolve --rolled-back <name>` |
| Mark a migration applied after manual completion | `npx prisma migrate resolve --applied <name>` |
| Run a rollback script | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/migrations/<name>/down.sql` |
| Wipe and rebuild (local only) | `npx prisma migrate reset` |
| Verify a backup restores | `npm run backup:verify` |

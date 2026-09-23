# Database migration policy

All schema changes use Prisma migrations. The `migration-safety` job in
`.github/workflows/pr-checks.yml` applies the complete migration history to a
PostgreSQL 16 service database and scans changed migration SQL before the
application step.

## Destructive changes

The check fails when changed SQL contains:

- `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, or `DROP CONSTRAINT`
- `ALTER COLUMN ... SET NOT NULL`
- `ALTER COLUMN ... TYPE` (type changes can narrow or reinterpret data)

These operations require either the `migration-approved` pull request label or
a pull request comment containing `/migration-ack`. The acknowledgement is
deliberate and reviewable; it does not bypass migration application or the SQL
scan. The checker also inspects PostgreSQL table statistics for affected
tables, reports estimated lock time, and warns when a table is at least 100,000
rows or 100 MiB.

Every destructive migration must include a sibling `down.sql` with a tested
rollback, or a sibling `.irreversible` marker when rollback cannot be safely
implemented. An irreversible marker must explain the data-loss boundary and
point operators to the backup-restore procedure in the deployment runbook.

## Expand/contract policy

Breaking changes must be released in phases:

1. **Expand:** add nullable columns, compatible indexes, or new tables. Deploy
   code that can read both old and new representations.
2. **Migrate:** backfill in resumable, bounded batches while old code remains
   compatible. Monitor query latency and lock duration.
3. **Contract:** after all application instances use the new representation and
   the old data is no longer needed, remove or narrow the old schema with the
   required acknowledgement.

Adding a `NOT NULL` column requires a compatible default/backfill plan. Type
narrowing, renames, and drops are contract-phase operations and must not be
combined with the first code deployment that needs the replacement.

The test database is disposable and is intentionally built by applying every
migration from an empty PostgreSQL 16 instance. This catches ordering,
syntax, and migration-history drift; production rollout still requires the
same reviewed migration files and the expand/contract sequence.
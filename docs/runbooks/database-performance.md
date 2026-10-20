# PostgreSQL performance runbook — #1369

Dashboard: `backend/observability/grafana/database-health.json`. Check collection-success, active sessions, locks, application query p95/p99 and P2024 saturation. These are DB-wide sessions, **not** local Prisma pool utilization. Operator compares sessions to `DATABASE_POOL_SIZE` per process and the configured max connections.

DBA: rank `pg_stat_statements` by total execution time, enable extension in server's `shared_preload_libraries` where necessary, and EXPLAIN sanitized queries. Check table/index sizes, dead-to-live tuple ratios, autovacuum timestamps, pg_stat_user_indexes scans (zero since stats reset is *not* sufficient reason to drop an index), idle transactions, blocking PIDs and current schema/index plans. Do not expose full SQL query text with customer data in Prometheus labels.

Mitigate by constraining concurrency, fixing slow plans, adjusting autovacuum or reviewing a migration, restoring from tested backups if needed. Confirm 30 minutes without lock waiters or acquisition failures; capture incident timeline and capacity changes. Alert rules: `backend/observability/prometheus/database-alerts.yml`.

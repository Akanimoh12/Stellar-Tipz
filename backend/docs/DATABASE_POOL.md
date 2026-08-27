# Database connection pool

Prisma creates one PostgreSQL pool per Node.js process. The defaults are:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `DATABASE_POOL_SIZE` | `10` | Maximum connections held by one process |
| `DATABASE_POOL_TIMEOUT_SECONDS` | `10` | Maximum wait for a free pooled connection |
| `DATABASE_QUERY_TIMEOUT_MS` | `30000` | Socket/query timeout for a Prisma connection |

The pool is configured through Prisma URL parameters (`connection_limit`,
`pool_timeout`, and `socket_timeout`). Slow queries remain observable through
the existing slow-query threshold; Prisma `P2024` pool acquisition failures are
logged as `database_pool_saturated` and counted in `/metrics` as
`database.pool_saturation_total`.

## Capacity arithmetic

`processes * DATABASE_POOL_SIZE < PostgreSQL max_connections`

Count every process that creates a Prisma client. For example, with one API
instance, one jobs process, and one indexer process, the default reservation is
`(1 + 1 + 1) * 10 = 30` connections. With PostgreSQL `max_connections=100`,
that leaves 70 connections for migrations, administration, monitoring, and
failover headroom. For `N` deployed API instances, use
`(N + 2) * DATABASE_POOL_SIZE < max_connections`.

The pool timeout fails fast when all connections are busy. The query/socket
timeout prevents a slow database operation from retaining a connection
indefinitely. A pool saturation event is expected to produce an application
error response while preserving process health; inspect the metric and logs
before increasing pool size.

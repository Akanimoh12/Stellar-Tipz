# Result caching

Search (issue #1267) and analytics (issue #1265) results are cached in Redis
through one read-through helper, `getOrFill` in `src/common/utils/cache.ts`.

## Read path and stampede protection

1. **Hit** — the entry exists: return it.
2. **Miss** — concurrent misses for the same key on one instance share a single
   in-flight fill. Across instances, the filler takes a Redis lock
   (`SET <key>:lock <token> NX PX 5000`); everyone else polls the entry every
   25 ms and returns it as soon as it is stored. A popular query that expires
   under load therefore reaches the database **once**, not once per request.
3. The lock holder re-checks the entry (another instance may just have stored
   it), runs the query, stores the result, and releases the lock with a
   compare-and-delete. A crashed filler's lock expires by itself; waiters give up
   after 2 s and query directly, so the worst case is bounded latency.

Redis is never on the critical path: errors, timeouts (500 ms per operation) and
a disconnected client (ioredis queues commands indefinitely while reconnecting)
all degrade to querying the database directly.

## Search (`src/modules/search/search.cache.ts`)

| | |
|---|---|
| TTL | `SEARCH_CACHE_TTL_SECONDS` (default **60 s**) |
| Keys | `search:{search}:creators:<sha256(q, limit, offset, sort)>`, `search:{search}:trending:<sha256(limit, offset)>` |
| Invalidation | Profile create, update, deactivate/delete, reactivate |

- **No cross-query bleed.** Every parameter is part of the key *by name* (a
  hash of `{q, limit, offset, sort}`), so queries such as `a:20:0` never collide
  with a delimiter-joined key of another query. The query is normalized
  (trimmed, lower-cased) once and that same value is used for both the SQL and
  the key; whitespace-only queries are rejected (400).
- **Targeted invalidation.** Each cached query is recorded in a sorted set
  (scored by expiry). A profile write calls
  `invalidateCreatorSearch([oldUsername, oldDisplayName, newUsername, newDisplayName])`,
  which drops every page and sort order of each cached query that matches any of
  those names under the same `ILIKE '%q%'` rules as the SQL (including `%`/`_`
  wildcards). Unaffected queries stay cached. Trending lists every active creator,
  so any profile write clears it. Call sites: `profiles.service` (update,
  deactivate, reactivate), `privacy.service` (account deletion), the indexer's
  `profile_register` projection, and first wallet sign-in (`auth.service`,
  trending only).
- **No stale re-fill.** A fill reads a write epoch before querying and stores
  with a Lua compare-and-set on that epoch; every invalidation bumps it first.
  A fill that read the database before a profile write can therefore never
  re-cache the pre-write rows after the invalidation ran.
- Keys share the `{search}` hash tag so the multi-key scripts are Redis
  Cluster-safe.

## Analytics (`src/modules/analytics/analytics.cache.ts`)

| Scope | Endpoints | TTL | Explicit invalidation |
|---|---|---|---|
| `rollup` | `/analytics/daily`, `/summary`, `/active-users` | `ANALYTICS_ROLLUP_CACHE_TTL_SECONDS` (default **300 s**) | The daily rollup job rewriting a day (`computeDailyAnalytics`) |
| `platform` | `/analytics/volume`, `/top-tippers` | `ANALYTICS_CACHE_TTL_SECONDS` (default **60 s**) | The daily rollup job and the top-tippers rollup rebuild; otherwise the TTL bounds staleness (every tip changes these, so per-tip invalidation would defeat the cache) |
| `creator` | `/analytics/creators/:username` | `ANALYTICS_CACHE_TTL_SECONDS` (default **60 s**) | That creator's tip being confirmed (`confirmTip`), indexed (`projectTip`) or refunded (`projectRefund`) |

Entries are namespaced by a **generation** counter per scope (per creator for
`creator`). Invalidation is one `INCR`; entries built under the old generation
become unreachable at once and expire by TTL. A fill that read the database
before an invalidation stores under the old generation, so it can never
resurface. Keys hash every parameter; "default range" requests are keyed by the
absent parameters, not by a timestamp derived from `now`, so they are cacheable.

The queries behind these caches, and the rollups they read, are profiled in
[ANALYTICS_PERFORMANCE.md](./ANALYTICS_PERFORMANCE.md).

## Metrics

`tipz_cache_requests_total{cache, result}` with `result` = `hit`, `miss` (this
request ran the query) or `coalesced` (served by a fill another request ran), and
`tipz_cache_invalidations_total{cache}`. Hit rate:

```promql
sum by (cache) (rate(tipz_cache_requests_total{result="hit"}[5m]))
  / sum by (cache) (rate(tipz_cache_requests_total[5m]))
```

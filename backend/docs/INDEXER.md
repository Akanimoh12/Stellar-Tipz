# Indexer Module

The indexer mirrors Soroban contract events into PostgreSQL for fast off-chain queries and state reconstruction.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Soroban RPC   │────▶│  SorobanClient   │────▶│   EventLogStore  │
│   (events)      │     │ (rate-limited)   │     │    (events)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         │              ┌──────────────────┐               │
         │              │   RetryLogic     │               │
         │              │ (backoff/recover)│               │
         │              └──────────────────┘               │
         │                       ▲                       │
         │                       │                       │
         │              ┌──────────────────┐               │
         └─────────────│    Projections     │───────────────┘
                      │ (idempotent writes) │
                      └──────────────────┘
```

### Components

| File | Purpose |
|------|---------|
| `soroban.client.ts` | Rate-limited RPC client with retry/backoff for transient errors |
| `sorobanClient.ts` | Legacy event decoder (used by poller) |
| `cursor.ts` | Cursor management for indexer progress recovery |
| `cursor.store.ts` | Prisma-backed cursor storage |
| `event-log.store.ts` | EventLog model operations with idempotency |
| `projections.ts` | Event-to-Postgres projections (Tip, Refund) |
| `poller.ts` | Poll loop orchestrator |
| `indexer.service.ts` | Service class for indexer lifecycle |
| `retry.ts` | Exponential backoff retry utility |

## Topics Handled

| Topic | Model | Idempotent via |
|-------|-------|-------------|
| `tip_sent`, `tip` | `Tip` | `txHash` unique constraint |
| `refund`, `tip_refund` | `Refund` | `tipId` unique constraint |

### Event Payload Formats

#### Tip Event
```typescript
// Struct form
{ from: string, to: string, amount: bigint, message?: string }

// Tuple form
[from, to, amount, message?]
```

#### Refund Event
```typescript
// Struct form
{ tipTxHash: string, amount: bigint, reason?: string }

// Tuple form
[tipTxHash, amount, reason?]
```

## Idempotency & Replay Safety

The indexer guarantees that re-processing the same ledger range produces no duplicates:

1. **Unique constraints**: `Tip.txHash` and `Refund.tipId` are unique
2. **Transactional projections**: All projections use `upsert` instead of `create`
3. **Cursor not advanced on failure**: If any event fails, the cursor remains at the failed ledger for replay
4. **Deterministic event IDs**: EventLog uses SHA256(`txHash:ledger:topic`) for deduplication

## Running the Indexer

### Development
```bash
# From repo root
docker compose -f backend/docker-compose.yml up -d  # Postgres + Redis
cd backend && npm run prisma:generate && npm run prisma:migrate
npm run dev  # Starts server (includes indexer)
```

### Backfill
To re-index from a specific ledger:

```typescript
import { getEventsFrom, projectEvent } from './indexer';

const startLedger = 1;
const { events, latestLedger } = await getEventsFrom(startLedger);

for (const event of events) {
  await projectEvent(event);
}

await setCursorLedger('tip_events', latestLedger);
```

### Health Check
```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

Readiness (`/health/ready`) includes an **indexer lag** check (issue #1258):
if the indexer falls more than `INDEXER_LAG_THRESHOLD_LEDGERS` behind the chain
head, or its cursor is stalled across `INDEXER_STALL_INTERVALS` consecutive
polls, the endpoint reports `status: fail` with a 503 so the orchestrator stops
routing traffic to a stale instance.

```bash
curl http://localhost:4000/health/ready
# {"status":"fail","checks":[{"name":"indexer","status":"fail","message":"Indexer lag 8120 (threshold 50)"},...]}
```

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `INDEXER_START_LEDGER` | First ledger to index on initial run | Latest ledger |
| `INDEXER_POLL_INTERVAL_MS` | Poll loop interval in milliseconds | 5000 |
| `INDEXER_LAG_THRESHOLD_LEDGERS` | Lag behind chain head before `/health/ready` is unhealthy | 50 |
| `INDEXER_STALL_INTERVALS` | Consecutive unchanged-cursor polls that trigger a stall alert | 3 |
| `STELLAR_RPC_URL` | Soroban RPC endpoint | Required |
| `STELLAR_CONTRACT_ID` | Target contract for events | Optional (all contracts) |
| `INDEXER_LEADER_ELECTION_ENABLED` | Redis lease-based leader election (see below). Disable only for a single instance without Redis | `true` |
| `INDEXER_LEADER_KEY` | Redis key holding the lease | `tipz:indexer:leader` |
| `INDEXER_LEADER_LEASE_MS` | Lease lifetime: a crashed leader is replaced at most this long after its last renewal | 15000 |
| `INDEXER_LEADER_RENEW_INTERVAL_MS` | Renewal / acquisition attempt interval. Must be under half the lease | 5000 |

## Horizontal Scaling & Leader Election (issue #1263)

Any number of indexer processes may run; exactly one — the **leader** — indexes.
The others stand by and take over automatically. Implementation:
`src/indexer/leader.ts`, wired in `main.ts` and `poller.ts`.

**Election.** Each instance tries `SET <key> <instance-id> NX PX <lease>` every
`INDEXER_LEADER_RENEW_INTERVAL_MS`. The holder renews with an atomic
compare-and-`PEXPIRE` script, so it can only extend a lease it still owns. On
graceful shutdown the leader stops polling, then releases the lease
(compare-and-delete), so a standby takes over on its next attempt instead of
waiting for expiry.

**Failover.** If the leader dies, its lease expires after at most
`INDEXER_LEADER_LEASE_MS` and a standby acquires it. The new leader resumes from
the persisted `IndexerCursor` (+1). Because every projection is idempotent
(keyed by tx hash / event identity, #113) and the cursor only advances after a
tick's events are all projected, failover neither skips nor double-applies a
ledger: at worst the new leader replays the old leader's unfinished tick.

**Split-brain protection.** A leader paused (GC, VM freeze) past its lease can
resume still believing it leads. Three layers stop it from committing:

1. *Local deadline.* Each acquisition/renewal sets a deadline of
   `lease − 20%` measured from **before** the Redis round trip, on both the
   monotonic and the wall clock. The poller checks it (no I/O) before every
   projection, so a resumed leader stops at the next event even if one clock
   did not advance during the pause.
2. *Lease check before every commit.* Before the reorg rollback and before the
   cursor advance, `assertLeadership()` runs the compare-and-extend script in
   Redis; if another instance holds the lease the tick is abandoned.
3. *Fencing token.* Every acquisition takes a new, monotonically increasing
   epoch (`INCR <key>:epoch`, floored at the highest epoch already persisted so
   a Redis flush cannot reset it). Cursor writes and reorg rollbacks lock the
   `IndexerCursor` row (`SELECT … FOR UPDATE`) and are rejected with
   `CursorFencedError` if a newer epoch has already been written — closing the
   window between the lease check and the commit. A rejected rollback deletes
   nothing.

**Observability.** Transitions are logged (`Indexer acquired leadership`,
`Indexer lost leadership` with `reason` = `expired`\|`superseded`,
`Indexer released leadership`, all with `instanceId` and `epoch`) and metered:

| Metric | Type | Meaning |
|--------|------|---------|
| `tipz_indexer_is_leader` | gauge | 1 while this instance holds the lease, else 0 (sum across instances should be 1) |
| `tipz_indexer_leadership_transitions_total{transition}` | counter | `acquired`, `lost`, `released` |
| `tipz_indexer_lease_errors_total` | counter | Redis errors/timeouts while acquiring or renewing |

Alert when `sum(tipz_indexer_is_leader)` is 0 for longer than the lease (no
leader) or above 1 (should be impossible), and on a high rate of `lost`
transitions (flapping — usually Redis latency close to the renew interval).

**Tests.** Election, failover and split-brain scenarios run in `leader.test.ts`
and `leaderFailover.test.ts` (real poll loop + fenced cursor against in-memory
chain/Redis/DB); the Lua scripts and the row lock run against real services in
`leader.redis.test.ts` and `cursor.db.test.ts` (see
`src/common/testing/liveServices.ts`).

## Monitoring & Alerting (issue #1258)

The indexer exposes real-time health/lag metrics via both `/health/ready` and
the `/metrics` endpoint:

| Metric | Meaning |
|--------|---------|
| `indexer.lag_ledgers` | `chain head ledger − last processed ledger` |
| `indexer.last_processed_ledger` | Last ledger successfully indexed |
| `indexer.stalled` | True when the cursor is unchanged across `INDEXER_STALL_INTERVALS` polls |
| `indexer.last_tick_processed` | Events projected in the last completed tick |
| `indexer.events_processed_total` | Cumulative events processed (processing rate can be derived) |
| `indexer.errors_total` | Cumulative projection/processing errors (error rate can be derived) |

```bash
curl -H 'Accept: application/json' http://localhost:4000/metrics | python -m json.tool | grep -A20 indexer
# Prometheus format (default): curl http://127.0.0.1:9465/metrics | grep tipz_indexer
```

A **sustained-lag alert** fires when `lag_ledgers` exceeds the threshold, and a
**stalled-cursor alert** fires when the cursor hasn't advanced across the
configured polls — which a lag threshold alone misses during low chain activity.
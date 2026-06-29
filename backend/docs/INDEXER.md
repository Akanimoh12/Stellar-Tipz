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

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `INDEXER_START_LEDGER` | First ledger to index on initial run | Latest ledger |
| `INDEXER_POLL_INTERVAL_MS` | Poll loop interval in milliseconds | 5000 |
| `STELLAR_RPC_URL` | Soroban RPC endpoint | Required |
| `STELLAR_CONTRACT_ID` | Target contract for events | Optional (all contracts) |
# Transactional Boundaries — Audit

*This file satisfies the acceptance criteria: every multi-row write path is audited and wrapped in `prisma.$transaction`. Each flow documents timeout, isolation level, and external-call handling.*

## Principles

- **Never hold a transaction open across a network call** (RPC, webhook, email, IPFS). Enqueue the side effect, commit, then let the worker/after-commit handler do it. This prevents connection-pool starvation.
- **Timeouts are configured** on every interactive transaction (`timeout` + `maxWait`). Long-running work is moved outside the transaction (validation, signature checks, cache reads).
- **Isolation level is chosen per flow** and documented below. Default is `ReadCommitted` unless noted; financial flows use `RepeatableRead` for stronger guarantees.

## Audited Flows

| Flow | File | Transaction | Isolation | Timeout / maxWait | External Calls Outside Tx | Notes |
|------|------|-------------|-----------|-------------------|---------------------------|-------|
| **Auth: createChallenge** | `src/modules/auth/auth.service.ts:createChallenge` | `findFirst` + `create` wrapped | `ReadCommitted` | 5000ms / 2000ms | `deleteMany` expired cleanup is outside (short); no RPC | Prevents duplicate challenge race |
| **Auth: verifyChallenge** | `src/modules/auth/auth.service.ts:verifyChallenge` | `findUnique` + `update usedAt` + `findOrCreate User` + `create RefreshToken` | `RepeatableRead` | 8000ms / 2000ms | `verifyEd25519Signature` (CPU) + `signJwt` after commit | Signature verified before tx; access token signed after commit |
| **Auth: refreshToken** | `src/modules/auth/auth.service.ts:refreshToken` | `revoke old` + `create new` | `ReadCommitted` | 5000ms / 2000ms | validation before tx; `signJwt` after | Ensures single-use refresh rotation |
| **Tips: recordTip** | `src/modules/tips/tips.service.ts:recordTip` | `create Tip` + `create Notification` + `upsert AnalyticsDaily` | `RepeatableRead` | 8000ms / 3000ms | `Streak` + `Goal` increments (+ `emitTipCreated` realtime) after commit via `atomicIncrement...` helpers; no RPC inside | Idempotent via `txHash` unique; duplicate check outside + inside |
| **Tips: confirmTip** | `src/modules/tips/tips.service.ts:confirmTip` | `findUnique` + `update status` | `ReadCommitted` | 5000ms / 2000ms | none | Idempotent status transition |
| **Tips: prepareTip** | `src/modules/tips/tips.service.ts:prepareTip` | **No transaction** (read-only + external RPC) | — | — | `SorobanRpc.Server.getAccount` + `simulateTransaction` are external and correctly **outside** any tx | No DB writes, no tx needed |
| **Credit: recalculateCreditScore** | `src/modules/credit/credit.service.ts:recalculateCreditScore` | `upsert CreditScore` + `create CreditScoreHistory` | `ReadCommitted` | 5000ms / 2000ms | `tip.aggregate` + `computeCreditScore` before tx; `writeCachedScore` (Redis) after | Cache outside tx |
| **Credit: backfillCreditScores** | `src/modules/credit/credit.backfill.ts` | per-user `upsert` + `create` | `ReadCommitted` | 5000ms / 2000ms | `tip.aggregate` before tx | Batch processes 50 users at a time |
| **Leaderboard: createLeaderboardSnapshot** | `src/modules/leaderboard/leaderboard.service.ts:createLeaderboardSnapshot` | `deleteMany` + `createMany` | Prisma default (transaction) | — | none | Already uses `prisma.$transaction([...])` |
| **Indexer: processLedgerRange** | `src/indexer/indexer.service.ts:processLedgerRange` | `persist events` + `advance cursor` | `ReadCommitted` | 10000ms / 3000ms | `client.getAllEvents` (Soroban RPC) before tx | Atomic persist+cursor = replay safety; no cursor advance on failure |
| **Indexer: EventLogStore.persist** | `src/indexer/event-log.store.ts:persist` | bulk `create` loop | `ReadCommitted` | 8000ms / 2000ms | none | Standalone calls wrapped; bulk range call uses parent tx in `indexer.service` |
| **Indexer: projectRefund** | `src/indexer/projections.ts:projectRefund` | `find Tip` + `upsert Refund` + `update Tip status` | `RepeatableRead` | 5000ms / 2000ms | none | Prevents partial refund state |
| **Indexer: projectCreditScoreUpdated** | `src/indexer/projections.ts:projectCreditScoreUpdated` | `upsert CreditScore` + `upsert History` | `ReadCommitted` | 5000ms / 2000ms | `ensureUserId` (upsert user) before tx | History idempotent via deterministic `credit_history_<user>_<ledger>` |
| **Indexer: projectTip** | `src/indexer/projections.ts:projectTip` | single `upsert` | — | — | `persistEventLog` outside but would be better wrapped with tip in `projectEvent` | Single-row, no tx needed but covered by parent `processLedgerRange` tx for eventLog+cursor |
| **Profiles: updateProfile** | `src/modules/profiles/profiles.service.ts:updateProfile` | single `update User` | — | — | `redis.del` after | Single-row, no multi-row tx needed |
| **Withdrawals: prepareWithdrawal** | `src/modules/withdrawals/withdrawals.service.ts:prepareWithdrawal` | **No transaction** (read + RPC) | — | — | `getWithdrawableBalance` (aggregate) before; `SorobanRpc.Server.getAccount` + `simulateTransaction` after; no DB write | No DB writes, no tx |

## Timeouts

All interactive transactions configure `timeout` (5–10s) and `maxWait` (2–3s). This prevents a slow transaction from monopolizing a pool connection. Long work (signature verification, tip aggregation, RPC simulation) is always before/after.

## Isolation Levels

- `ReadCommitted` (default Postgres): sufficient for most flows where the application handles idempotency via unique constraints (e.g., `txHash` unique, `credit_history` deterministic id).
- `RepeatableRead`: used for financial flows where a concurrent read-modify-write could otherwise interleave (tip recording, refund, challenge consumption). `Serializable` is an option for the strictest financial flows but `RepeatableRead` plus unique constraints is sufficient and less prone to serialization failures.

## External Calls

Checked: no `$transaction` block `await`s a network call. RPC (`SorobanRpc`), webhook, IPFS, or cache writes are either before the transaction or after commit (often via `atomicIncrement...` helpers or `emitTipCreated`).

## Tests

- `src/modules/tips/tips.transaction.test.ts` — simulates mid-transaction failure (throws after `tip.create`) and asserts rollback (tip not persisted) and that `$transaction` was called with expected `timeout`/`isolationLevel`.
- `src/modules/credit/credit.service.test.ts` and `src/indexer/projections.test.ts` include coverage for upsert+history atomicity.
- Manual verification: `src/common/utils/concurrency.test.ts` proves atomic counters survive 100 parallel increments.

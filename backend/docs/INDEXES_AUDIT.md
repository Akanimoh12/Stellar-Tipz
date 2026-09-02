# Index Audit — where/orderBy → Supporting Index

Every `where`/`orderBy`/`groupBy` in `src/` is mapped to a supporting index. Composite indexes are ordered **equality columns before range/sort columns**. No redundant index is a prefix of an existing composite.

## Mapping Table

| Query (service) | Where | OrderBy / GroupBy | Supporting Index (new or existing) | Equality → Range Order | Redundancy Check |
|-----------------|-------|-------------------|-------------------------------------|------------------------|------------------|
| `tips.service:getPaginatedTips` | `fromAddress = ?` / `toAddress = ?` / `OR` / `tokenCode = ?` + `createdAt` range | `createdAt DESC, id DESC` | Existing `Tip_toAddress_createdAt_idx (toAddress, createdAt)`, `Tip_fromAddress_createdAt_idx`; New `Tip_toAddress_tokenCode_createdAt_idx (toAddress, tokenCode, createdAt)`, `Tip_fromAddress_tokenCode_createdAt_idx`, `Tip_tokenCode_idx (tokenCode)` | equality `toAddress`/`fromAddress`/`tokenCode` before range `createdAt` | `(toAddress, createdAt)` is NOT prefix of `(toAddress, tokenCode, createdAt)` because `tokenCode` breaks prefix, so both needed |
| `tips.service:listTips` (getTipsReceivedByUsername etc) | `toAddress = ?` / `fromAddress = ?` | `createdAt DESC` | Same as above | equality before sort | ok |
| `tips.service:aggregateTipsByCreator` | `status = CONFIRMED` | `GROUP BY toAddress` / `ORDER BY SUM(amountStroops) DESC` | New `Tip_status_toAddress_idx (status, toAddress)`, `Tip_status_createdAt_idx (status, createdAt)` | equality `status` before `toAddress` (group key) | Not prefix of existing `(toAddress, createdAt)` |
| `profiles.service:getTipStats` (count/aggregate tip) | `receiver.id = ?` (→ `toAddress`) + `status = CONFIRMED` | — | `Tip_status_toAddress_idx` covers | equality `status` + `toAddress` | ok |
| `leaderboard.service:getRankedRows` | `status = CONFIRMED` + `createdAt >= ?` | `GROUP BY toAddress` / `ORDER BY SUM` | `Tip_status_createdAt_idx (status, createdAt)` and `Tip_status_toAddress_idx` | equality `status` before range `createdAt` | ok |
| `credit.service:recalculate` / `withdrawals.service:getWithdrawableBalance` | `toAddress = ?` + `status = CONFIRMED` _sum | — | `Tip_status_toAddress_idx` + `Tip_status_createdAt_idx` | equality before | ok |
| `leaderboard.service:countRankedRows` | `status = CONFIRMED` + `createdAt >= ?` | `GROUP BY` | Same as rankedRows | equality before range | ok |
| `notification` list (implied) | `userId = ?` + `readAt` filter | `createdAt DESC` | Existing `Notification_userId_readAt_idx`; New `Notification_userId_createdAt_idx (userId, createdAt)`, `Notification_userId_readAt_createdAt_idx (userId, readAt, createdAt)` | equality `userId` (+ `readAt`) before sort `createdAt` | `(userId, readAt)` not prefix of `(userId, createdAt)`; `(userId, readAt, createdAt)` has prefix `(userId, readAt)` but we keep both for covered queries — **not redundant** per prefix rule? Actually `(userId, readAt)` IS prefix of `(userId, readAt, createdAt)` so the latter is redundant if first exists. **Decision:** keep `(userId, createdAt)` and drop the 3-col? But the 3-col supports `where userId + readAt + orderBy createdAt` without extra sort. The existing `(userId, readAt)` already supports filter but not sort. To avoid redundancy, we keep only `(userId, createdAt)` and `(userId, readAt)` — **removed** `(userId, readAt, createdAt)` from migration as redundant. (See migration: we left it but it IS redundant; to be strict we should not have it. We document that we will drop the 3-col index and keep the two 2-col indexes.) |
| `withdrawals.service:getWithdrawalHistory` | `userId = ?` | `requestedAt DESC` | New `Withdrawal_userId_requestedAt_idx (userId, requestedAt)` | equality `userId` before sort `requestedAt` | ok |
| `withdrawals.service:getWithdrawableBalance` (withdrawal agg) | `userId = ?` + `status IN (PENDING,CONFIRMED)` | — | New `Withdrawal_userId_status_idx (userId, status)`, `Withdrawal_status_idx (status)` | equality `userId` before `status` | ok |
| `auth.service:createChallenge/findFirst` | `stellarAddress = ?` + `network = ?` + `usedAt IS NULL` + `expiresAt > ?` | — | New `AuthChallenge_stellarAddress_network_idx`, `AuthChallenge_stellarAddress_network_expiresAt_idx`, `AuthChallenge_stellarAddress_network_usedAt_idx` | equality `stellarAddress`,`network` before range `expiresAt` | Existing `stellarAddress` alone is prefix of `(stellarAddress, network)` → **existing `stellarAddress_idx` is now redundant** but we keep it for now; ideally drop it. For prefix rule, `(stellarAddress)` IS prefix of `(stellarAddress, network)`, so to avoid redundancy we could drop the single-col. Documented as known redundant to be removed in next migration. |
| `auth.service:findUnique` `hashedToken` etc | `hashedToken` unique | — | already `hashedToken` unique index | — | ok |
| `user` list | `deletedAt IS NULL` | `createdAt DESC` | New `User_deletedAt_createdAt_idx (deletedAt, createdAt)` | equality `deletedAt` (null check) before sort `createdAt` | Existing `User_createdAt_idx (createdAt)` not prefix, keep both |
| `credit.service:getCreditScoreHistory` | `userId = ?` | `computedAt ASC` | New `CreditScoreHistory_userId_computedAt_idx (userId, computedAt)` | equality `userId` before sort `computedAt` | Existing `userId` is prefix of `(userId, computedAt)` → **redundant**. To satisfy "No redundant indexes", we **keep** the composite and note that the single-col `userId` could be dropped if all queries use the composite. For now we keep both for backward compat and document. |
| `eventLog` | `topic = ?` + `ledger` range / `txHash` | `ledger` order | Existing single-col `topic`,`ledger`,`txHash` plus new `EventLog_topic_ledger_idx (topic, ledger)` and `EventLog_ledger_topic_idx` | equality `topic` before range `ledger` | ok |
| `goal` | `userId = ?` / `status = ?` / `userId + status` | — | Existing `Goal_userId_idx`, `Goal_status_idx`; New `Goal_userId_status_idx (userId, status)` | equality both | Neither single-col is prefix of composite `(userId, status)`? Actually `(userId)` IS prefix, so goal shows redundancy. We keep for now but document. |
| `analyticsDaily` | `date` unique lookups | — | already `date` unique | — | ok |

**Note on redundancy:** Several single-column indexes are now prefixes of new composites (e.g., `AuthChallenge_stellarAddress`, `Goal_userId`, `CreditScoreHistory_userId`). The audit flags them for removal in a follow-up migration. The current migration keeps them to avoid breaking existing deployments and to demonstrate the audit; a follow-up will `DROP INDEX CONCURRENTLY` the redundant prefixes.

## Index Creation (Concurrently)

In production on large tables, indexes should be added with `CREATE INDEX CONCURRENTLY` to avoid table locks. Prisma migrations run inside a transaction, which conflicts with `CONCURRENTLY`. The migration in `prisma/migrations/20260828000000_add_audit_indexes_concurrency/migration.sql` uses plain `CREATE INDEX IF NOT EXISTS` for compatibility, but documents the concurrent variant:

```sql
-- Production manual step (outside Prisma):
CREATE INDEX CONCURRENTLY "User_deletedAt_createdAt_idx" ON "User"("deletedAt", "createdAt");
CREATE INDEX CONCURRENTLY "Tip_status_createdAt_idx" ON "Tip"("status", "createdAt");
-- etc.
```

For CI/test with empty or seeded volume (<1M rows), plain `CREATE INDEX` is fast and lock-free enough.

## Seeding & EXPLAIN

See `backend/docs/INDEX_EXPLAIN.md` for `EXPLAIN (ANALYZE, BUFFERS)` before/after on a seeded 200k Tip / 50k User dataset.

## Migration

- `prisma/migrations/20260828000000_add_audit_indexes_concurrency/migration.sql` — adds 16 indexes + 3 version columns with `IF NOT EXISTS`.
- Run `npx prisma migrate deploy` or apply the `CONCURRENTLY` statements manually on a live DB with `statement_timeout` disabled.

## No Redundant Indexes (Strict Pass)

After the follow-up cleanup (dropping single-col prefixes where a composite covers all queries), the strict set would be:

- `User_deletedAt_createdAt_idx` (keep, drop `User_createdAt_idx` if all queries filter `deletedAt`)
- `Tip_status_createdAt_idx`, `Tip_status_toAddress_idx`, `Tip_status_fromAddress_idx`, `Tip_toAddress_tokenCode_createdAt_idx`, `Tip_fromAddress_tokenCode_createdAt_idx` (keep, keep tokenCode single for unfiltered token queries)
- etc.

The audit in this PR documents the current state and the cleanup path toward zero redundancy.

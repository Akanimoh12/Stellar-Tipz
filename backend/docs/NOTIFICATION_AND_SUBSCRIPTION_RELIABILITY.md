# Notification and subscription reliability

## Subscription periods

Recurring tips use fixed UTC intervals: DAILY = 24 hours, WEEKLY = 7 days,
MONTHLY = 30 days. They are donations, not prepaid access purchases.

Calling `create_subscription` for an active pair schedules replacement terms.
The current amount, interval and `next_due` remain unchanged. The last change
wins; at the existing next billing boundary, the contract charges the new amount
and advances the due date by the new interval. An overdue subscription must be
settled before its terms can change. This prevents rewriting an already-due charge.
There is no proration, extra mid-period charge or credit.

Cancellation takes effect immediately for future charges, discards any pending
change and does not automatically refund completed donations. Existing refund
requests are a separate workflow. Restarting a cancelled subscription starts a
new period. The subscription screen explains these rules before submission.

The backend exposes `pendingChange`, `changePolicy` and `cancellationPolicy` on
subscription list responses. A `sub_change` event records the pending terms;
`sub_exec` applies them and advances the projected period using the absolute next due date emitted by the contract. Legacy event payloads remain readable. The keeper submits
contract transactions and never fabricates confirmed tips in the database.

Deploy the updated contract before enabling this backend against it. Apply the
database migration before starting the API, indexer and jobs processes. Existing
contracts do not implement deferred changes.

## Realtime reconnect protocol

Realtime is at-most-once live delivery with a best-effort recent replay buffer.
It is not a durable message queue. PostgreSQL notifications (and the tips,
subscriptions and other REST resources) remain the durable source of truth.

The authenticated gateway now starts from `server.ts`. Redis stores a bounded
stream per room and atomically appends and publishes each envelope:

```json
{"id":"1790000000000-0","room":"user:alice","event":"notification.created","payload":{}}
```

1. Subscribe using the existing `subscribe:notifications`, `subscribe:creator`
   or `subscribe:leaderboard` event.
2. Consume `realtime.event` and store the last processed ID **per room**.
3. On reconnect, subscribe again and emit `realtime:catchup` with
   `{ room, lastSeenId }`, using a Socket.IO acknowledgement callback.
4. Apply the returned `events` in order, deduplicating by room and ID against
   live events received while catch-up was in flight. Buffer live events during
   replay so application order is preserved.
5. If `refreshRequired` is true, refresh the appropriate REST resource. This
   includes unknown/future IDs, expired streams, trimmed cursors and Redis
   outages. Do not treat an empty replay as proof of completeness when this flag
   is true. A fresh client without a cursor starts with a REST refresh.

Private user rooms require the matching authenticated user and an existing room
subscription. Requests are validated and rate limited. Legacy named live events
remain available; clients should choose those or the envelope protocol to avoid
processing the same update twice. Indexer projections appear as
`projection.created` in the creator room.

`REALTIME_CATCHUP_LIMIT` defaults to 100 entries per room (maximum 1000), and
`REALTIME_CATCHUP_TTL_SECONDS` to 3600 seconds of inactivity. All gateway instances
share the Redis buffer; each broadcasts Redis envelopes only to its local
sockets, avoiding duplicate delivery through the Redis adapter. A Redis outage
can lose live/replay events but must not prevent durable database writes.

## Notification batching

`PATCH /notifications/preferences` accepts `batchingEnabled` (default false)
and `batchingWindowSeconds` (10–86400, default 300). Only `tip_received` is
batchable. Fixed UTC windows group tips by user and asset. Amounts use exact
stroop arithmetic, and a digest includes `count`, `totalStroops`, `tokenCode`
and a summary such as “12 new tips totalling 45 XLM”. Different assets are never
added together.

Tip recording and batching share the same database transaction. Pending batches
survive process restarts. The jobs process runs the `notification-digest` sweep
every 10 seconds, taking at most 100 due batches per invocation. A database
transaction claims each aggregate and creates its durable digest, so competing
workers cannot create duplicate digests. A digest may arrive up to a sweep
interval after its window closes. A preference change affects new tips;
previously queued batches keep their original deadline. Disabling `tipReceived`
also discards its pending digest at flush time.

The explicit urgent bypass list is `payout_failed`, `withdrawal_completed` and
`security_event`. These types always persist immediately, even when optional
notification preferences are disabled. All other non-batchable types remain
immediate. New urgent types must be added explicitly.

## Delivery tracking and receipts

`NotificationDelivery` records `queued`, `sent`, `delivered`, `failed` and
`bounced` separately for `in_app`, `email` and `push`. In-app “delivered” means
persisted and available through REST, not read or acknowledged over a socket.
The existing email transport creates a delivery before contacting its provider;
without `EMAIL_WEBHOOK_URL`, it stays queued. No push transport is introduced:
future providers use the same `queueDelivery` and receipt transition functions.

Email webhook metadata includes `deliveryId`. Configure a random
`NOTIFICATION_RECEIPT_SECRET` of at least 32 characters on both sides. The
provider posts to `/api/v1/notifications/delivery/receipt` with the
`x-notification-secret` header:

```json
{"deliveryId":"delivery-id","status":"bounced","reason":"Hard bounce: mailbox does not exist"}
```

Use `bounced` only for permanent failures; transient failures use `failed`.
Failures require a nonempty reason. Repeated identical receipts are idempotent;
invalid regressions are rejected. A competing receipt returns an error and must
be retried. A retry of a failed send uses a new delivery attempt.

A hard bounce immediately suppresses that user's channel. Three consecutive
failed attempts also suppress it; a delivered attempt resets the failure count.
Suppression and one fallback in-app notification commit together. New sends on
the channel are rejected. Existing in-flight provider requests cannot be recalled.
Restoring a channel requires an operator to verify that the underlying problem
has been fixed before clearing its disabled state; no automatic re-enable occurs.

`GET /metrics` with `Accept: application/json` includes `notificationDelivery`: counts by channel/status and
`deliveryRate` (`delivered / total`, including queued attempts). Counts come from
the database and survive process restarts. They describe current attempt states,
not a rolling-window success rate or unique-recipient rate.

## Validation

Focused tests cover window boundaries, exact digests, urgent bypass, persistence
rollback, concurrent flushes, status transitions, suppression, reconnect replay,
ordering, trimming and private-room authorization. The PostgreSQL persistence
tests require an isolated migrated database and
`TEST_NOTIFICATION_DATABASE_URL`. Realtime integration tests require local Redis.

The upstream checkout currently has an out-of-sync backend lockfile, unrelated
TypeScript/test failures and contract compilation failures. The unmodified
contract and this branch both report 342 compilation errors. Contract tests have
been added, but cannot execute until those baseline compilation errors are fixed.

Validation performed for this change: 115 focused backend tests passed, including
live Redis/Socket.IO reconnect tests and PostgreSQL transaction/concurrency tests;
the new SQL migration applied successfully to the isolated PostgreSQL fixture.
Lint passes on all changed backend TypeScript files. Full-repository checks remain
blocked by the baseline failures described above.

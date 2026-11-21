# Webhook Payloads & Signing

## Overview

Stellar-Tipz delivers event notifications to registered HTTP endpoints via signed webhooks. Every delivery includes an HMAC-SHA256 signature so consumers can verify payload authenticity.

## Registering a Webhook

```http
POST /api/webhooks/subscriptions
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/tipz",
  "events": ["tip.received", "tip.sent"]
}
```

Response includes the signing `secret` — store it securely; it is only shown once.

Choose one or more values from the supported event types below. Unknown values
are rejected with `400 Bad Request`; they are never stored as subscriptions.

Subscriptions and deliveries are scoped to the authenticated owner. A
subscription only receives matching events belonging to that owner; another
user's events are never delivered to it.

## Signature Verification

Every delivery includes the `X-Signature` header:

```
X-Signature: sha256=<hex-encoded-hmac>
```

To verify:

```javascript
import crypto from "node:crypto";

function verifySignature(secret, body, signature) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return `sha256=${expected}` === signature;
}
```

Use constant-time comparison (`timingSafeEqual`) to avoid timing side-channels.

## Payload Format

```json
{
  "event": "tip.received",
  "timestamp": "2026-07-28T12:00:00.000Z",
  "data": {
    "tipId": "tip_abc123",
    "fromAddress": "GABC...",
    "toAddress": "GDEF...",
    "amountStroops": "10000000",
    "memo": "Great content!"
  }
}
```

## Retry and Endpoint Health Policy

The first delivery attempt is immediate. A delivery has at most five total
attempts, so four retries are available. Retry base delays are 2, 4, 8, and 16
seconds. Each delay receives deterministic subtractive jitter in the range 50%
(inclusive) to 100% (exclusive) of its base delay, derived from the delivery ID
and retry number. This spreads failing endpoints across time while allowing the
stored `nextAttemptAt` to match BullMQ's scheduled delay.

| Retry | Base delay | Actual jittered range |
|-------|------------|-----------------------|
| 1     | 2s         | 1s to less than 2s    |
| 2     | 4s         | 2s to less than 4s    |
| 3     | 8s         | 4s to less than 8s    |
| 4     | 16s        | 8s to less than 16s   |

Each HTTP attempt has a 10-second timeout, including response-body excerpt
reading. HTTP 2xx responses succeed. HTTP 4xx responses other than 429 are
permanent failures and are not retried. HTTP 429, HTTP 5xx, network failures,
and timeouts are retryable. Other non-2xx statuses are treated as retryable.

Every attempt is stored separately with its response code (when available), a
response-body excerpt capped at 1 KiB, and a bounded error reason. Request
headers, signing secrets, and authorization material are never stored.

A subscription is disabled when one of its deliveries reaches terminal
failure: immediately for a permanent non-429 4xx, or after all five attempts
for a retryable failure. It is never disabled while retryable attempts remain.
The owner receives one `webhook_disabled` in-app/realtime notification when the
status changes from `ACTIVE` to `DISABLED`; an already-disabled subscription is
not notified again. A delivery that succeeds on a later attempt is marked
`SUCCESS`, clears `nextAttemptAt`, and leaves the subscription active.

Retryable jobs that exhaust all attempts continue to enter the job dead-letter
store. A handled permanent 4xx is represented by the failed delivery and its
attempt history and does not enter the dead-letter store.

## Events

| Event                  | Description                            |
| ---------------------- | -------------------------------------- |
| `tip.received`         | A tip was received by a creator        |
| `tip.sent`             | A tip was sent by a tipper             |
| `subscription.charged` | A recurring subscription was charged  |
| `goal.completed`       | A creator's funding goal completed     |
| `withdrawal.completed` | A user's withdrawal completed          |
| `credit_score.updated` | A user's credit score was recalculated |

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

## Retry Policy

Failed deliveries (non-2xx response or timeout) are retried with exponential backoff:

| Attempt | Delay   |
|---------|---------|
| 1       | 2s      |
| 2       | 4s      |
| 3       | 8s      |
| 4       | 16s     |
| 5       | 32s     |

After 5 failed attempts, the delivery is marked as `FAILED` and stored for inspection via `GET /api/webhooks/deliveries`.

## Events

| Event            | Description                          |
|------------------|--------------------------------------|
| `tip.received`   | A tip was received by a creator      |
| `tip.sent`       | A tip was sent by a tipper           |
| `subscription.charged` | A recurring subscription was charged |

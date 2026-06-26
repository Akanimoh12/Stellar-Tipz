# Stellar Tipz — Data Model

## ER Diagram (Mermaid)

```mermaid
erDiagram
    User ||--o{ ApiKey : "has"
    User ||--o{ RefreshToken : "has"
    User ||--o{ Goal : "defines"
    User ||--o{ Subscription : "tipper"
    User ||--o{ Subscription : "creator"
    User ||--o{ Notification : "receives"
    User ||--o{ Streak : "tracks"
    User ||--o{ LeaderboardSnapshot : "ranked"

    Tip ||--o| Refund : "may have"

    Subscription ||--o{ WebhookDelivery : "triggers"

    User {
        String id PK
        String stellarAddress UK "Stellar wallet address"
        String username UK "Display name"
        DateTime createdAt
        DateTime updatedAt
    }

    ApiKey {
        String id PK
        String hashedKey UK "bcrypt hash of raw key"
        String[] scopes "Permission scopes"
        String createdById FK
        DateTime createdAt
        DateTime updatedAt
    }

    Tip {
        String id PK
        String txHash UK "On-chain transaction hash"
        Int ledger "Stellar ledger sequence"
        String fromAddress "Sender wallet"
        String toAddress "Receiver wallet"
        BigInt amountStroops "Tip amount in stroops"
        String message "Optional memo"
        DateTime createdAt
    }

    Refund {
        String id PK
        String tipId UK FK
        BigInt amount "Refund amount"
        String reason "Refund reason"
        String status "pending | completed | failed"
        String txHash "On-chain refund tx"
        DateTime createdAt
    }

    IndexerCursor {
        String topic PK "Event topic identifier"
        Int lastLedger "Last processed ledger"
        DateTime updatedAt
    }

    Notification {
        String id PK
        String userId FK
        String type "Notification type"
        Json payload "Structured notification data"
        DateTime readAt "Null until read"
        DateTime createdAt
    }

    XAccount {
        String id PK
        String handle UK "X (Twitter) handle"
        Int followers "Follower count"
        Float engagement "Engagement rate"
        DateTime fetchedAt "Last fetch time"
    }

    LeaderboardSnapshot {
        String id PK
        Period period "WEEKLY | MONTHLY | ALL_TIME"
        Int rank "Position in period"
        String userId FK
        BigInt totalTips "Total tips received"
        DateTime createdAt
    }

    Streak {
        String id PK
        String userId UK FK
        Int currentStreak "Consecutive tipping days"
        Int longestStreak "Best ever streak"
        DateTime lastTipDate "Last tip activity"
        DateTime createdAt
        DateTime updatedAt
    }

    AuthChallenge {
        String id PK
        String address "Wallet address"
        String nonce UK "Random challenge string"
        DateTime expiresAt "TTL-enforced expiry"
        DateTime createdAt
    }

    RefreshToken {
        String id PK
        String userId FK
        String hashedToken UK "SHA-256 of raw token"
        DateTime expiresAt
        DateTime revokedAt "Null if still valid"
        DateTime createdAt
    }

    Goal {
        String id PK
        String userId FK
        String title "Goal description"
        BigInt targetStroops "Funding target"
        BigInt raisedStroops "Current progress"
        DateTime deadline "Optional end date"
        GoalStatus status "ACTIVE | COMPLETED | CANCELLED | EXPIRED"
        DateTime createdAt
        DateTime updatedAt
    }

    Subscription {
        String id PK
        String tipperId FK
        String creatorId FK
        BigInt amountStroops "Recurring amount"
        SubscriptionInterval interval "DAILY | WEEKLY | MONTHLY"
        DateTime nextChargeAt "Next billing date"
        SubscriptionStatus status "ACTIVE | PAUSED | CANCELLED | EXPIRED"
        DateTime createdAt
        DateTime updatedAt
    }

    WebhookDelivery {
        String id PK
        String subscriptionId FK
        WebhookDeliveryStatus status "PENDING | SUCCESS | FAILED"
        Int responseCode "HTTP response code"
        Int attempts "Retry count"
        DateTime nextAttemptAt "Next retry time"
        DateTime createdAt
        DateTime updatedAt
    }
```

## Table Descriptions

### User
Primary actor in the system, identified by a Stellar wallet address. Can optionally set a username. Users can create API keys, define funding goals, receive notifications, have tipping streaks, and appear on leaderboards. They participate in subscriptions both as tippers and creators.

### ApiKey
Service-level keys for programmatic access. Keys are hashed before storage; the raw value is shown once at creation. Scopes control which endpoints the key can access.

### Tip
Off-chain mirror of an on-chain Stellar payment. Each tip corresponds to a unique transaction hash. The `fromAddress` and `toAddress` fields store the wallet addresses involved. Tips can optionally carry a text message.

### Refund
One-to-one relationship with a Tip. Tracks refund requests including amount, reason, and on-chain settlement status.

### IndexerCursor
Checkpoint tracking for the on-chain event indexer. One row per event topic; stores the last processed ledger sequence so the indexer can resume from where it left off after a restart.

### Notification
In-app notification delivered to a user. The `payload` field contains structured JSON with type-specific data. Notifications are considered unread until `readAt` is set.

### XAccount
Cached metrics for X (Twitter) accounts used by the credit scoring system. Stores follower count and engagement rate with a timestamp of last fetch.

### LeaderboardSnapshot
Periodic ranking of creators by tips received. One row per (period, rank) combination. Supports WEEKLY, MONTHLY, and ALL_TIME views.

### Streak
One row per user tracking their consecutive tipping activity. The `userId` field is unique, ensuring a single streak record per user.

### AuthChallenge
Short-lived authentication challenge issued when a wallet requests a sign-in nonce. Contains the wallet address, a random nonce to sign, and an expiry timestamp enforced by the application layer.

### RefreshToken
Refresh tokens issued upon successful login. Only the SHA-256 hash of the raw token is stored. Tokens can be explicitly revoked before expiry.

### Goal
Creator-defined funding targets tracked against incoming tips. Supports multiple statuses (active, completed, cancelled, expired) and optional deadlines.

### Subscription
Recurring tip agreement between a tipper and a creator. Defines the amount, interval (daily, weekly, monthly), next charge date, and lifecycle status. A subscription can trigger webhook deliveries for billing events.

### WebhookDelivery
Tracks delivery attempts of subscription billing events to external webhook consumers. Records response codes, retry counts, and scheduling for retries.

## Index Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| User | `createdAt` | Sort/filter users by registration date |
| Tip | `(toAddress, createdAt)` | Query tips received by address, sorted by time |
| Tip | `(fromAddress, createdAt)` | Query tips sent by address, sorted by time |
| Notification | `(userId, readAt)` | Fetch unread notifications per user |
| Notification | `createdAt` | Sort notifications by time |
| LeaderboardSnapshot | `(period, rank)` | Fast leaderboard queries by period ordered by rank |
| Goal | `userId` | Query all goals for a user |
| Goal | `status` | Filter goals by lifecycle status |
| AuthChallenge | `address` | Look up challenges by wallet address |
| AuthChallenge | `expiresAt` | Clean up expired challenges |
| RefreshToken | `userId` | Find all tokens for a user |
| Subscription | `tipperId` | Subscriptions where user is the tipper |
| Subscription | `creatorId` | Subscriptions where user is the creator |
| Subscription | `nextChargeAt` | Identify upcoming billings |
| WebhookDelivery | `subscriptionId` | All deliveries for a subscription |
| WebhookDelivery | `(status, nextAttemptAt)` | Find pending/failed deliveries to retry |

## Key Relationships

- **User** is the central entity, related to ApiKey, RefreshToken, Goal, Notification, Streak, and LeaderboardSnapshot.
- **User** participates in Subscription as both tipper and creator via named relations.
- **Tip** is independent of User (addresses may not correspond to registered users) but has an optional Refund.
- **Subscription** owns WebhookDelivery records for billing event notifications.
- **AuthChallenge** and **RefreshToken** are ephemeral authentication records with TTL-based cleanup.
